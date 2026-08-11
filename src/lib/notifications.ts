import { ageHoursBetween } from "./format";
import { computeAgeStatus } from "./ageStatus";
import { buildConsentMessage, isAlreadyOff, sendConsentDM, updateMessage } from "./slack";
import { readClusters, upsertClusters, appendHistoryIfChanged } from "./store";
import { readSettings } from "./settings";
import type { AgeStatus, ClusterRecord, Settings, TierNotificationConfig } from "../types";

const DAY_MS = 24 * 60 * 60 * 1000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isEmailLike(value: string | null): value is string {
  return value !== null && EMAIL_RE.test(value);
}

/**
 * "In Use" has no configured tier settings (see NotifiableAgeStatus) - there's
 * nothing to ask about automatically. A manual ask can still target an
 * "In Use" cluster (an operator overriding the algorithm's classification),
 * so it needs *some* config to build a message from; defaulting to offering
 * both turn-off and delete gives the operator full manual control rather
 * than silently offering nothing. `notify` is irrelevant here - manual sends
 * always bypass it.
 */
const IN_USE_MANUAL_TIER_CONFIG: TierNotificationConfig = { notify: false, askTurnOff: true, askDelete: true };

function resolveTierConfig(tier: AgeStatus, settings: Settings): TierNotificationConfig {
  return tier === "In Use" ? IN_USE_MANUAL_TIER_CONFIG : settings.notificationsByTier[tier];
}

/** Same computation `computeAgeStatus` needs, from a stored record instead of the render-time inputs `app/page.tsx` already has to hand. */
export function computeRecordAgeStatus(record: ClusterRecord, settings: Settings, nowMs: number): AgeStatus {
  const createdAtMs = new Date(record.createdAt).getTime();
  const lastActivityMs = record.lastActivityAt ? new Date(record.lastActivityAt).getTime() : null;
  return computeAgeStatus(
    ageHoursBetween(createdAtMs, nowMs),
    lastActivityMs,
    record.lastActivitySource,
    nowMs,
    settings,
  );
}

export async function supersedeLiveMessage(record: ClusterRecord, settings: Settings, text: string): Promise<void> {
  if (!record.slackChannelId || !record.slackMessageTs) return;
  if (!settings.slackBotToken) return;
  await updateMessage(settings.slackBotToken, record.slackChannelId, record.slackMessageTs, text).catch(
    () => undefined,
  );
}

/** Sends (or re-sends, as a reminder) a tier notification. Returns false without throwing on any skip/failure - owner unresolvable, tokens unset, or the Slack send itself failing are all "didn't send," not errors. */
async function trySendNotification(
  record: ClusterRecord,
  tier: AgeStatus,
  settings: Settings,
  isReminder: boolean,
  nowMs: number,
): Promise<boolean> {
  if (!settings.slackBotToken || !settings.slackAppToken) return false;
  if (!isEmailLike(record.ownerDerived)) return false;

  const tierConfig = resolveTierConfig(tier, settings);
  const message = buildConsentMessage({ cluster: record, tier, tierConfig, isReminder, nowMs, settings });

  const sent = await sendConsentDM(settings.slackBotToken, record.ownerDerived, message);
  if (!sent.ok) {
    console.error(`[notifications] failed to notify ${record.ownerDerived} about ${record.clusterName}: ${sent.reason}`);
    return false;
  }

  record.slackChannelId = sent.channelId;
  record.slackMessageTs = sent.messageTs;
  return true;
}

/**
 * Applies one sync cycle's worth of notification logic to every active
 * (non-tombstoned) record, in place: detects age-status tier transitions -
 * resetting the consent cycle and sending a fresh notification when the new
 * tier is configured to notify - and advances any still-pending cycle
 * through its reminders and expiry. See cluster-consent-notifications spec.
 */
export async function applyConsentNotifications(
  records: ClusterRecord[],
  settings: Settings,
  nowMs: number,
): Promise<void> {
  for (const record of records) {
    const tier = computeRecordAgeStatus(record, settings, nowMs);

    if (tier !== record.lastNotifiedAgeStatus) {
      await supersedeLiveMessage(record, settings, `No longer current - *${record.clusterName}*'s status changed to *${tier}*.`);

      record.lastNotifiedAgeStatus = tier;
      record.consentStatus = "none";
      record.consentCycleStartedAt = null;
      record.remindersSent = 0;
      record.consentTierAtDecision = null;
      record.actionOutcome = "none";
      record.slackChannelId = null;
      record.slackMessageTs = null;
      record.snoozeUntil = null;
      record.snoozeJustification = null;

      if (tier !== "In Use" && settings.notificationsByTier[tier].notify) {
        const sent = await trySendNotification(record, tier, settings, false, nowMs);
        if (sent) {
          record.consentStatus = "pending";
          record.consentCycleStartedAt = new Date(nowMs).toISOString();
          record.consentTierAtDecision = tier;
        }
      }
      continue;
    }

    if (record.consentStatus === "snoozed") {
      if (!record.snoozeUntil || nowMs < new Date(record.snoozeUntil).getTime()) continue;

      // Snooze ended with no tier change since - ask again from scratch,
      // same tier, rather than staying silent forever (only a tier
      // transition resets things above; this is the other reset trigger).
      record.remindersSent = 0;
      record.consentTierAtDecision = null;
      record.actionOutcome = "none";

      if (tier !== "In Use" && settings.notificationsByTier[tier].notify) {
        const sent = await trySendNotification(record, tier, settings, false, nowMs);
        if (sent) {
          record.consentStatus = "pending";
          record.consentCycleStartedAt = new Date(nowMs).toISOString();
          record.consentTierAtDecision = tier;
          continue;
        }
      }
      record.consentStatus = "none";
      record.consentCycleStartedAt = null;
      continue;
    }

    if (record.consentStatus !== "pending" || !record.consentCycleStartedAt) continue;
    // "pending" is never set for "In Use" by the automatic path above, but a
    // manual send (sendManualConsentRequest) can set it regardless of tier -
    // that cycle still needs to advance through reminders and expiry like
    // any other, so there's deliberately no early-out for "In Use" here.

    const ageMs = nowMs - new Date(record.consentCycleStartedAt).getTime();
    const expiryMs = settings.consentExpiryDays * DAY_MS;

    if (ageMs >= expiryMs) {
      record.consentStatus = "expired";
      await supersedeLiveMessage(record, settings, `Request expired for *${record.clusterName}* - no response received.`);
      continue;
    }

    // Evenly space reminders across the expiry window - see design.md Open Questions.
    const reminderIntervalMs = expiryMs / (settings.consentReminderMax + 1);
    const dueReminders = Math.min(settings.consentReminderMax, Math.floor(ageMs / reminderIntervalMs));
    if (dueReminders > record.remindersSent) {
      await supersedeLiveMessage(record, settings, `Superseded by a newer reminder for *${record.clusterName}*.`);
      const sent = await trySendNotification(record, tier, settings, true, nowMs);
      if (sent) record.remindersSent += 1;
    }
  }
}

export interface ManualConsentResult {
  ok: boolean;
  message: string;
}

/**
 * Manually (re-)sends a real consent request for a cluster's *current*
 * tier, using that tier's configured asks (askTurnOff/askDelete, or the
 * "In Use" manual default from resolveTierConfig if the cluster doesn't
 * currently have a notifiable tier) - bypasses the tier's `notify` toggle
 * (clicking this button is itself the trigger) but otherwise behaves like
 * an automatic send: supersedes any still-live message first, and on
 * success resets the consent cycle to a fresh "pending" with real ask
 * buttons, exactly as a transition-triggered send would. Always available
 * regardless of tier - an operator may want to check in with an owner even
 * when the algorithm currently classifies the cluster "In Use".
 */
export async function sendManualConsentRequest(clusterId: string): Promise<ManualConsentResult> {
  const [clusters, settings] = await Promise.all([readClusters(), readSettings()]);
  const record = clusters.find((c) => c.clusterId === clusterId);
  if (!record) return { ok: false, message: "Cluster not found." };
  if (!settings.slackBotToken || !settings.slackAppToken) {
    return { ok: false, message: "Slack bot token and/or app token isn't configured in Settings." };
  }
  if (!isEmailLike(record.ownerDerived)) {
    return { ok: false, message: `No email-shaped owner to notify (owner: ${record.ownerDerived ?? "unknown"}).` };
  }

  const nowMs = Date.now();
  const tier = computeRecordAgeStatus(record, settings, nowMs);
  const tierConfig = resolveTierConfig(tier, settings);

  await supersedeLiveMessage(record, settings, `Superseded by a manually-sent request for *${record.clusterName}*.`);

  const message = buildConsentMessage({ cluster: record, tier, tierConfig, isReminder: false, nowMs, settings });
  const sent = await sendConsentDM(settings.slackBotToken, record.ownerDerived, message);
  if (!sent.ok) {
    return { ok: false, message: `Couldn't deliver to ${record.ownerDerived}: ${sent.reason}` };
  }

  // Re-read fresh rather than reusing `record` from the top of this
  // function - supersedeLiveMessage and sendConsentDM together made up to
  // four Slack API round trips since then, plenty of time for a concurrent
  // sync cycle or Slack click to have changed other fields on this same
  // cluster. Writing back the stale `record` would silently revert those -
  // same bug class as sync.ts/reconciliation.ts, see their comments.
  const freshRecord = (await readClusters()).find((c) => c.clusterId === clusterId);
  if (!freshRecord) {
    return { ok: false, message: "Cluster disappeared before the request could be recorded." };
  }
  const priorRecord = { ...freshRecord };
  freshRecord.lastNotifiedAgeStatus = tier;
  freshRecord.consentStatus = "pending";
  freshRecord.consentCycleStartedAt = new Date(nowMs).toISOString();
  freshRecord.remindersSent = 0;
  freshRecord.consentTierAtDecision = tier;
  freshRecord.actionOutcome = "none";
  freshRecord.slackChannelId = sent.channelId;
  freshRecord.slackMessageTs = sent.messageTs;
  await upsertClusters([freshRecord]);
  await appendHistoryIfChanged(priorRecord, freshRecord, "manual-consent-request", new Date(nowMs).toISOString());

  const asks = [
    tierConfig.askTurnOff && !isAlreadyOff(freshRecord.config.status) && "turn off",
    tierConfig.askDelete && "delete",
    "snooze",
  ].filter(Boolean) as string[];
  return {
    ok: true,
    message: `Sent ${tier} consent request to ${record.ownerDerived} (${asks.join(" / ")}).`,
  };
}
