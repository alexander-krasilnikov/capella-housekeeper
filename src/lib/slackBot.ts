import { App, SocketModeReceiver } from "@slack/bolt";
import { readClusters, getCluster, upsertClusters, appendHistoryIfChanged } from "./store";
import { readSettings } from "./settings";
import { applyAutoTurnOffDecision, computeRecordAgeStatus, resolveTierConfig } from "./notifications";
import {
  buildSnoozeModalView,
  canAutoTurnOff,
  CONSENT_ACTION_IDS,
  describeSnoozeAllowance,
  parseSnoozeSubmission,
  slackErrorReason,
  SNOOZE_MODAL_CALLBACK_ID,
  updateMessage,
  type ConsentAction,
} from "./slack";
import type { AgeStatus, ClusterRecord, ConsentStatus, Settings } from "../types";

let started = false;
let reconnectInFlight: Promise<void> | null = null;
const RETRY_INTERVAL_MS = 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
/** How long the connection may sit in a non-"connected", non-"disabled" state before the watchdog forces a fresh reconnect instead of trusting the library's own retry to eventually recover. */
const STUCK_THRESHOLD_MS = 3 * 60 * 1000;
const WATCHDOG_INTERVAL_MS = 60 * 1000;

/** The two direct-decision actions - "snooze" isn't here because clicking it opens a modal instead of recording a decision immediately; only the modal's submission (below) does that. */
type DirectConsentAction = Exclude<ConsentAction, "snooze">;

const ACTION_TO_CONSENT_STATUS: Record<DirectConsentAction, ConsentStatus> = {
  turnoff: "approved-turnoff",
  delete: "approved-delete",
};

const OUTCOME_TEXT: Record<DirectConsentAction, string> = {
  turnoff: "Approved - this cluster will be turned off after a final check.",
  delete: "Approved - this cluster will be deleted after a final check.",
};

export type SlackBotConnectionStatus =
  | "disabled"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected"
  | "error";

export interface SlackBotStatus {
  status: SlackBotConnectionStatus;
  detail: string;
  updatedAt: number;
}

/**
 * Kept on `globalThis`, not a plain module-level variable - this is set
 * from code reached only via instrumentation.ts's dynamic import(), which
 * Next.js can compile into a separate module graph from the one
 * app/page.tsx and app/actions.ts import via their static `import`. Two
 * separate module instances of this file would mean two separate,
 * never-synchronized copies of a plain `let` - `globalThis` is the one
 * thing guaranteed to be the same JS realm across both. Read from
 * app/page.tsx (a Server Component re-rendered fresh per request, per its
 * `dynamic = "force-dynamic"`) to show the connection LED.
 */
declare global {
  var __capellaHousekeeperSlackBotStatus: SlackBotStatus | undefined;
  /** Same cross-module-graph reasoning as the status above - a manually- or watchdog-triggered reconnect needs to reach the *actual* live receiver, not an uninitialized copy of this module's local state. */
  var __capellaHousekeeperSlackReceiver: SocketModeReceiver | undefined;
}

function getState(): SlackBotStatus {
  return (globalThis.__capellaHousekeeperSlackBotStatus ??= {
    status: "disabled",
    detail: "Slack bot/app token not configured.",
    updatedAt: Date.now(),
  });
}

function setStatus(status: SlackBotConnectionStatus, detail: string): void {
  globalThis.__capellaHousekeeperSlackBotStatus = { status, detail, updatedAt: Date.now() };
  console.log(`[slackBot] status -> ${status}: ${detail}`);
}

export function getSlackBotStatus(): SlackBotStatus {
  return getState();
}

/**
 * Records a consent decision and updates the originating message in place.
 * A click on a stale/already-decided message (record no longer "pending" -
 * e.g. it already expired, or a newer reminder superseded it) is a no-op,
 * not an error - see cluster-consent-notifications spec.
 */
async function handleConsentAction(action: DirectConsentAction, clusterId: string, botToken: string): Promise<void> {
  const clusters = await readClusters();
  const record = clusters.find((c) => c.clusterId === clusterId);
  if (!record || record.consentStatus !== "pending") return;

  const prior = { ...record };
  record.consentStatus = ACTION_TO_CONSENT_STATUS[action];
  await upsertClusters([record]);
  await appendHistoryIfChanged(prior, record, "slack-decision", new Date().toISOString());

  if (record.slackChannelId && record.slackMessageTs) {
    await updateMessage(
      botToken,
      record.slackChannelId,
      record.slackMessageTs,
      `*${record.clusterName}*: ${OUTCOME_TEXT[action]}`,
    ).catch(() => undefined);
  }
}

/**
 * Records the actual snooze decision once the modal is submitted (the
 * button click itself only opened the modal - see the `consent_snooze`
 * action handler below). Same stale-click no-op rule as
 * handleConsentAction: only acts if the cluster is still "pending".
 */
async function handleSnoozeSubmission(
  clusterId: string,
  channelId: string,
  messageTs: string,
  days: number,
  justification: string,
  settings: Settings,
): Promise<void> {
  const clusters = await readClusters();
  const record = clusters.find((c) => c.clusterId === clusterId);
  if (!record || record.consentStatus !== "pending") return;

  const prior = { ...record };
  const nowMs = Date.now();
  const snoozeUntilMs = nowMs + days * DAY_MS;
  record.consentStatus = "snoozed";
  record.snoozeUntil = new Date(snoozeUntilMs).toISOString();
  record.snoozeJustification = justification;
  record.snoozeCount += 1;
  await upsertClusters([record]);
  await appendHistoryIfChanged(prior, record, "slack-decision", new Date().toISOString());

  if (channelId && messageTs) {
    const until = new Date(snoozeUntilMs).toISOString().slice(0, 10);
    const reasonNote = ` Reason given: ${justification}`;
    const tier = computeRecordAgeStatus(record, settings, nowMs);
    const tierConfig = resolveTierConfig(tier, settings);
    const allowanceNote = describeSnoozeAllowance(tierConfig, record.snoozeCount);
    const allowanceLine = allowanceNote ? ` ${allowanceNote}` : "";
    await updateMessage(
      settings.slackBotToken,
      channelId,
      messageTs,
      `*${record.clusterName}*: Snoozed until ${until}.${reasonNote}${allowanceLine}`,
    ).catch(() => undefined);
  }
}

/**
 * Refuses a snooze attempt that would exceed the tier's configured
 * maxSnoozes and applies the same automatic-turnoff decision as an
 * expiry (see notifications.ts's applyAutoTurnOffDecision) - tagged with
 * a distinct trigger since, unlike the expiry case, this happens at an
 * isolated moment (a button click) rather than inside the periodic sync
 * batch. See "Exhausting the snooze cap triggers the same automatic
 * outcome as expiry" in the auto-turnoff-on-inaction spec.
 */
async function handleSnoozeCapExceeded(
  record: ClusterRecord,
  tier: AgeStatus,
  maxSnoozes: number,
  settings: Settings,
): Promise<void> {
  await applyAutoTurnOffDecision(record, tier, settings, `the maximum of ${maxSnoozes} snooze(s) was reached`);

  // Re-read fresh right before writing, applying only the two fields
  // applyAutoTurnOffDecision just decided - not `record` from the top of
  // the click handler. applyAutoTurnOffDecision just did a Slack round trip
  // (supersedeLiveMessage's chat.update), plenty of time for a concurrent
  // sync/reconciliation pass to have changed other fields on this same
  // cluster; writing back the stale `record` would silently clobber those -
  // same bug class as reconciliation.ts's applyActionOutcome and
  // manualActions.ts, see their comments.
  const fresh = await getCluster(record.clusterId);
  if (!fresh) return;
  const prior = { ...fresh };
  fresh.consentStatus = record.consentStatus;
  fresh.consentTierAtDecision = record.consentTierAtDecision;
  await upsertClusters([fresh]);
  await appendHistoryIfChanged(prior, fresh, "auto-turnoff-decision", new Date().toISOString());
}

/**
 * Starts a long-lived Socket Mode connection: this process opens an
 * *outbound* connection to Slack, which then pushes button-click events
 * down it. No inbound HTTP endpoint is exposed for Slack to call into - see
 * design.md. Called once at process boot (instrumentation.ts) - if either
 * Slack token isn't set yet at that moment, it retries every minute rather
 * than giving up for the process's whole lifetime, so saving both tokens in
 * Settings on an already-running server takes effect on its own shortly
 * after, with no restart needed.
 */
export async function startSlackBot(): Promise<void> {
  if (started) return;

  const settings = await readSettings();
  if (!settings.slackBotToken || !settings.slackAppToken) {
    setStatus("disabled", "Slack bot/app token not configured.");
    console.log("[slackBot] Slack bot/app token not configured yet - will check again in a minute.");
    setTimeout(() => {
      startSlackBot().catch((err) => console.error("[slackBot] retry failed:", err));
    }, RETRY_INTERVAL_MS);
    return;
  }
  started = true;
  await connectSocketMode(settings.slackBotToken, settings.slackAppToken);
  startConnectionWatchdog();
}

/**
 * Tears down the current Socket Mode connection (if any) and opens a fresh
 * one. Safe to call whether or not a connection currently exists, and
 * de-duplicates overlapping calls (the watchdog and a manual trigger could
 * otherwise fire close together). This is the actual recovery mechanism
 * for a connection that's stuck rather than cleanly disconnected - the
 * library's own `autoReconnectEnabled` already handles a normal dropped
 * WebSocket with backoff (see the `reconnecting` status below), but
 * nothing in the library detects "still nominally connected, but Slack's
 * side has stopped being able to dispatch to it," which is what a stuck
 * `dispatch_failed` on Slack's end looks like from here.
 */
export async function reconnectSlackBot(): Promise<void> {
  if (reconnectInFlight) return reconnectInFlight;

  reconnectInFlight = (async () => {
    const settings = await readSettings();
    if (!settings.slackBotToken || !settings.slackAppToken) {
      setStatus("disabled", "Slack bot/app token not configured.");
      return;
    }

    const existing = globalThis.__capellaHousekeeperSlackReceiver;
    if (existing) {
      setStatus("connecting", "Reconnecting - closing the previous connection...");
      await existing.client.disconnect().catch(() => undefined);
    }
    await connectSocketMode(settings.slackBotToken, settings.slackAppToken);
  })();

  try {
    await reconnectInFlight;
  } finally {
    reconnectInFlight = null;
  }
}

/**
 * Watches for the connection sitting in a non-"connected", non-"disabled"
 * state for too long, and forces a reconnect rather than trusting that
 * state to eventually resolve on its own. Started once, alongside the
 * initial connection.
 */
function startConnectionWatchdog(): void {
  const tick = () => {
    const status = getSlackBotStatus();
    const stuckMs = Date.now() - status.updatedAt;
    if (status.status !== "connected" && status.status !== "disabled" && stuckMs > STUCK_THRESHOLD_MS) {
      console.log(
        `[slackBot] connection stuck in "${status.status}" for ${Math.round(stuckMs / 1000)}s - forcing a reconnect.`,
      );
      reconnectSlackBot().catch((err) => console.error("[slackBot] watchdog reconnect failed:", err));
    }
    setTimeout(tick, WATCHDOG_INTERVAL_MS);
  };
  setTimeout(tick, WATCHDOG_INTERVAL_MS);
}

/**
 * Builds and starts one Socket Mode connection. Uses an explicit
 * SocketModeReceiver (rather than the shorthand `socketMode: true` App
 * option) specifically so its underlying `SocketModeClient` - a plain
 * EventEmitter - can be observed directly for connection lifecycle events,
 * which is what drives getSlackBotStatus(). The receiver is stashed on
 * globalThis so a later reconnect can find and close it.
 */
async function connectSocketMode(botToken: string, appToken: string): Promise<void> {
  setStatus("connecting", "Opening the Socket Mode connection to Slack...");

  const receiver = new SocketModeReceiver({ appToken });
  globalThis.__capellaHousekeeperSlackReceiver = receiver;
  receiver.client.on("connecting", () => setStatus("connecting", "Connecting to Slack..."));
  receiver.client.on("authenticated", () => setStatus("connecting", "Authenticated - finishing connection setup..."));
  receiver.client.on("connected", () => setStatus("connected", "Connected - ready to receive button clicks."));
  receiver.client.on("reconnecting", () => setStatus("reconnecting", "Connection dropped - reconnecting..."));
  receiver.client.on("disconnecting", () => setStatus("disconnected", "Disconnecting from Slack."));
  receiver.client.on("disconnected", () => setStatus("disconnected", "Disconnected from Slack."));
  receiver.client.on("error", (err: unknown) =>
    setStatus("error", err instanceof Error ? err.message : String(err)),
  );

  const app = new App({ token: botToken, receiver });

  const directActions: DirectConsentAction[] = ["turnoff", "delete"];
  for (const action of directActions) {
    app.action(CONSENT_ACTION_IDS[action], async ({ ack, action: slackAction }) => {
      await ack();
      const clusterId = (slackAction as { value?: string }).value;
      if (!clusterId) return;
      const currentSettings = await readSettings();
      if (!currentSettings.slackBotToken) return;
      try {
        await handleConsentAction(action, clusterId, currentSettings.slackBotToken);
      } catch (err) {
        console.error(`[slackBot] failed to handle ${action} for cluster ${clusterId}:`, err);
      }
    });
  }

  // "Snooze" opens a modal instead of recording anything directly - the
  // decision is only made once that modal is submitted, below.
  app.action(CONSENT_ACTION_IDS.snooze, async ({ ack, action: slackAction, body, client }) => {
    await ack();
    const clusterId = (slackAction as { value?: string }).value;
    const triggerId = (body as { trigger_id?: string }).trigger_id;
    const channelId = (body as { channel?: { id?: string } }).channel?.id;
    const userId = (body as { user?: { id?: string } }).user?.id;
    if (!clusterId || !triggerId) return;
    try {
      const clusters = await readClusters();
      const record = clusters.find((c) => c.clusterId === clusterId);
      if (!record || record.consentStatus !== "pending") return;
      const settings = await readSettings();

      // Cap enforcement happens here, before the modal ever opens - see
      // "Snooze cap enforcement point" in design.md: refusing up front is
      // more honest than accepting a justification for a snooze that was
      // never going to happen. Falls through to a normal (uncapped) snooze
      // if auto-turn-off can't actually fire for this tier right now (e.g.
      // ask-to-turn-off is disabled, or the cluster is already off) - there's
      // no automatic outcome to substitute, so refusing would just strand
      // the request with no way forward.
      const tier = computeRecordAgeStatus(record, settings, Date.now());
      const tierConfig = resolveTierConfig(tier, settings);
      const capExceeded = tierConfig.autoTurnOffOnInaction && record.snoozeCount >= tierConfig.maxSnoozes;
      if (capExceeded && canAutoTurnOff(record, tierConfig) && settings.slackBotToken) {
        await handleSnoozeCapExceeded(record, tier, tierConfig.maxSnoozes, settings);
        if (channelId && userId) {
          await client.chat
            .postEphemeral({
              channel: channelId,
              user: userId,
              text: `You've already used all ${tierConfig.maxSnoozes} allowed snooze(s) for *${record.clusterName}* - it's being turned off automatically instead.`,
            })
            .catch(() => undefined);
        }
        return;
      }

      const { snoozeDayOptions } = settings;
      await client.views.open({
        trigger_id: triggerId,
        view: buildSnoozeModalView(
          record.clusterName,
          {
            clusterId: record.clusterId,
            channelId: record.slackChannelId ?? "",
            messageTs: record.slackMessageTs ?? "",
          },
          snoozeDayOptions,
        ) as never,
      });
    } catch (err) {
      const reason = slackErrorReason(err);
      console.error(`[slackBot] failed to open snooze modal for cluster ${clusterId}: ${reason}`);
      // The button click otherwise fails completely silently from the
      // clicking user's point of view (just Slack's generic "something
      // went wrong" triangle) - an ephemeral message at least says why,
      // visible only to them.
      if (channelId && userId) {
        await client.chat
          .postEphemeral({
            channel: channelId,
            user: userId,
            text: `Couldn't open the snooze dialog: ${reason}. Try again, or use Turn off / Delete / Decline instead.`,
          })
          .catch(() => undefined);
      }
    }
  });

  app.view(SNOOZE_MODAL_CALLBACK_ID, async ({ ack, view, body, client }) => {
    await ack();
    const userId = (body as { user?: { id?: string } }).user?.id;
    const submission = parseSnoozeSubmission(view as never);
    if (!submission) {
      console.error("[slackBot] snooze modal submitted but couldn't be parsed - check buildSnoozeModalView/parseSnoozeSubmission block_id/action_id agreement.");
      return;
    }
    const currentSettings = await readSettings();
    if (!currentSettings.slackBotToken) return;
    try {
      await handleSnoozeSubmission(
        submission.metadata.clusterId,
        submission.metadata.channelId,
        submission.metadata.messageTs,
        submission.days,
        submission.justification,
        currentSettings,
      );
    } catch (err) {
      const reason = slackErrorReason(err);
      console.error(`[slackBot] failed to handle snooze submission for cluster ${submission.metadata.clusterId}: ${reason}`);
      if (userId && submission.metadata.channelId) {
        await client.chat
          .postEphemeral({
            channel: submission.metadata.channelId,
            user: userId,
            text: `Couldn't save the snooze: ${reason}. Try again from the original message.`,
          })
          .catch(() => undefined);
      }
    }
  });

  try {
    await app.start();
    console.log("[slackBot] Socket Mode connection started");
  } catch (err) {
    setStatus("error", err instanceof Error ? err.message : String(err));
    throw err;
  }
}
