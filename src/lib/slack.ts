import { WebClient } from "@slack/web-api";
import { ageDaysBetween, ageHoursBetween } from "./format";
import { formatStatusLabel } from "./configSummary";
import type { AgeStatus, ClusterRecord, Settings, TierNotificationConfig } from "../types";

export type ConsentAction = "turnoff" | "delete" | "snooze";

/** Only these two get a Block Kit `confirm` dialog and "danger" styling - snooze isn't destructive. */
const DESTRUCTIVE_ACTIONS: ConsentAction[] = ["turnoff", "delete"];

/** action_id per consent action - the Bolt receiver (src/lib/slackBot.ts) registers a handler per id. */
export const CONSENT_ACTION_IDS: Record<ConsentAction, string> = {
  turnoff: "consent_turnoff",
  delete: "consent_delete",
  snooze: "consent_snooze",
};

const ACTION_LABELS: Record<ConsentAction, string> = {
  turnoff: "Turn off",
  delete: "Delete",
  snooze: "Snooze",
};

/** What each option actually does, in plain terms - shown in the message body, so nobody has to guess from a one-word button label. */
const ACTION_EXPLANATIONS: Record<ConsentAction, string> = {
  turnoff:
    "*Turn off* stops the cluster's compute - and its compute billing - while keeping all data, buckets, indexes, users, and configuration intact. It can be turned back on later from Capella. Note: Data API charges, if any, keep accruing while off.",
  delete:
    "*Delete* permanently removes this cluster and its data from Capella. This cannot be undone unless a snapshot backup was separately retained.",
  snooze:
    "*Snooze* delays this request for a number of days you choose, with a required note on why - useful if the cluster is still needed for a known period. You'll be asked again once the snooze ends.",
};

/**
 * A short version for the confirm dialog specifically - Slack caps a
 * confirm object's `text` at 300 characters, and the full
 * ACTION_EXPLANATIONS entry plus a cluster name routinely blew past that
 * (the actual cause of an `invalid_blocks` error from chat.postMessage).
 * Only populated for DESTRUCTIVE_ACTIONS - snooze opens a modal instead,
 * which is its own "gather details" step, so it never gets a confirm
 * dialog on the button itself.
 */
const ACTION_CONFIRM_SUMMARY: Record<ConsentAction, string> = {
  turnoff: "Stops compute and billing, keeps all data, reversible later.",
  delete: "Permanently deletes the cluster and its data. This cannot be undone.",
  snooze: "",
};

function confirmDialog(action: ConsentAction, clusterName: string) {
  return {
    title: { type: "plain_text" as const, text: `${ACTION_LABELS[action]} this cluster?` },
    text: { type: "plain_text" as const, text: `${ACTION_CONFIRM_SUMMARY[action]}\n\nCluster: ${clusterName}` },
    confirm: { type: "plain_text" as const, text: "Yes, do it" },
    deny: { type: "plain_text" as const, text: "Cancel" },
  };
}

/** Plain-language explanation of what the tier means and why this cluster is in it, parameterized by the operator's actual configured thresholds rather than a hardcoded description. Stated in hours, matching the settings fields exactly, rather than converted to a rounded day figure that could read as a different number than what's actually configured. */
function describeTier(
  tier: AgeStatus,
  ageHours: number,
  settings: Pick<Settings, "activityGraceHours" | "forgottenHours">,
): string {
  switch (tier) {
    case "In Use":
      return `It's currently classified *In Use* (activity within the last ${settings.activityGraceHours} hour(s), or created that recently) - this request was sent manually rather than triggered automatically.`;
    case "Stale":
      return `It's classified *Stale*: it's ${ageHours} hour(s) old with no activity in the last ${settings.activityGraceHours} hour(s), or no activity data at all. It may not be needed anymore.`;
    case "Forgotten":
      return `It's classified *Forgotten*: it's ${ageHours} hour(s) old, well past the ${settings.forgottenHours}-hour threshold, with no recent activity. It's a strong candidate for cleanup.`;
  }
}

/** True when the cluster's raw Capella status indicates it's already turned off - used to suppress a redundant "Turn off" ask. */
export function isAlreadyOff(rawStatus: string | null): boolean {
  return /off/i.test(formatStatusLabel(rawStatus));
}

/**
 * Plain-language summary of the cluster's *current operational state*
 * (running/turned off/deploying/...) - a different axis entirely from the
 * age-status tier below (a cluster can be "Forgotten" and still running,
 * still billing, and vice versa), so it's worth saying explicitly rather
 * than only ever mentioning the tier.
 */
function describeCurrentState(rawStatus: string | null): string {
  const label = formatStatusLabel(rawStatus);
  if (isAlreadyOff(rawStatus)) {
    return `Current state: *${label}* - it's already turned off, so compute isn't running (Data API charges, if any, may still apply).`;
  }
  if (rawStatus === null || /healthy|active|running|ready/i.test(label)) {
    return `Current state: *${label}* - it's running normally and incurring compute billing.`;
  }
  return `Current state: *${label}*.`;
}

/** Plain-language summary of what's known about the cluster's last activity, distinguishing "genuinely inactive" from "we simply have no data." */
function describeLastActivity(cluster: ClusterRecord, nowMs: number): string {
  if (!cluster.lastActivityAt || cluster.lastActivitySource === "unknown") {
    return "No reliable activity history is available for this cluster, so its status is based on age alone.";
  }
  const lastActivityMs = new Date(cluster.lastActivityAt).getTime();
  const days = ageDaysBetween(lastActivityMs, nowMs);
  let when: string;
  if (days < 1) {
    const hours = ageHoursBetween(lastActivityMs, nowMs);
    when = hours <= 0 ? "less than an hour ago" : `${hours}h ago`;
  } else if (days === 1) {
    when = "1 day ago";
  } else {
    when = `${days} days ago`;
  }
  const sourceNote =
    cluster.lastActivitySource === "activity-log"
      ? "from Capella's activity log"
      : "inferred from a detected configuration change, since the activity log wasn't available";
  return `Its last known activity was ${when} (${sourceNote}).`;
}

/**
 * Explains what actually happens on no response, honestly: reminders, then
 * expiry, and - since nothing in this codebase auto-turns-off or
 * auto-deletes on expiry (only an explicit approval ever reaches the
 * reconciliation loop) - explicitly says so, rather than leaving that
 * ambiguous. For "Forgotten" specifically, adds that the cluster has
 * already exceeded its configured grace period (the forgottenHours
 * threshold), so it'll keep resurfacing until it's acted on or shows
 * renewed activity.
 */
function describeNoResponseConsequence(
  tier: AgeStatus,
  settings: Pick<Settings, "forgottenHours" | "consentReminderMax" | "consentExpiryDays">,
): string {
  const base = `If you don't respond, you'll get up to ${settings.consentReminderMax} reminder(s) over the next ${settings.consentExpiryDays} day(s). After that, this request simply expires - *no action is taken automatically*, the cluster is left exactly as it is, and you won't be asked again until its status changes.`;
  if (tier !== "Forgotten") return base;
  return `${base} This cluster has already exceeded the configured Forgotten grace period (${settings.forgottenHours}+ hours with no recent activity), so expect it to keep resurfacing on future reviews until it's turned off, deleted, or shows renewed activity.`;
}

export interface ConsentMessageInput {
  cluster: ClusterRecord;
  tier: AgeStatus;
  tierConfig: TierNotificationConfig;
  isReminder: boolean;
  nowMs: number;
  settings: Pick<Settings, "activityGraceHours" | "forgottenHours" | "consentReminderMax" | "consentExpiryDays">;
}

export interface SlackMessage {
  text: string;
  blocks: unknown[];
}

/**
 * Builds the Block Kit message for a tier notification (or reminder):
 * why the cluster was flagged (its tier and activity history, in plain
 * language, not just a status word), and what each offered option actually
 * does. Turn-off/delete carry a native `confirm` dialog repeating that
 * explanation as the mis-click guard. Also states plainly what happens on
 * no response at all, so silence isn't ambiguous - see
 * cluster-consent-notifications spec.
 */
export function buildConsentMessage({ cluster, tier, tierConfig, isReminder, nowMs, settings }: ConsentMessageInput): SlackMessage {
  const ageHours = ageHoursBetween(new Date(cluster.createdAt).getTime(), nowMs);
  const heading = isReminder
    ? `:bell: Reminder - *${cluster.clusterName}* still needs a decision`
    : `:broom: Housekeeping alert for cluster *${cluster.clusterName}*`;
  const stateLine = describeCurrentState(cluster.config.status);
  const tierLine = describeTier(tier, ageHours, settings);
  const activityLine = describeLastActivity(cluster, nowMs);
  const noResponseLine = describeNoResponseConsequence(tier, settings);

  const offeredActions: ConsentAction[] = [
    ...(tierConfig.askTurnOff && !isAlreadyOff(cluster.config.status) ? (["turnoff"] as const) : []),
    ...(tierConfig.askDelete ? (["delete"] as const) : []),
    "snooze",
  ];
  const explanationText = offeredActions.map((action) => `• ${ACTION_EXPLANATIONS[action]}`).join("\n");

  const text = `${heading}. Org ${cluster.orgName}, project ${cluster.projectName}. ${stateLine} ${tierLine} ${activityLine} ${noResponseLine}`;

  const buttons: Record<string, unknown>[] = offeredActions.map((action) => ({
    type: "button",
    action_id: CONSENT_ACTION_IDS[action],
    value: cluster.clusterId,
    text: { type: "plain_text", text: ACTION_LABELS[action] },
    ...(DESTRUCTIVE_ACTIONS.includes(action)
      ? { style: "danger", confirm: confirmDialog(action, cluster.clusterName) }
      : {}),
  }));

  const blocks: unknown[] = [
    {
      type: "section",
      text: { type: "mrkdwn", text: `*${heading}*\nOrg *${cluster.orgName}*, project *${cluster.projectName}*.` },
    },
    { type: "section", text: { type: "mrkdwn", text: `${stateLine}\n${tierLine}\n${activityLine}` } },
    { type: "divider" },
    { type: "section", text: { type: "mrkdwn", text: `*What each option means:*\n${explanationText}` } },
    { type: "section", text: { type: "mrkdwn", text: `:hourglass_flowing_sand: *If you don't respond:*\n${noResponseLine}` } },
    { type: "actions", block_id: `consent_${cluster.clusterId}`, elements: buttons },
  ];
  return { text, blocks };
}

export const SNOOZE_MODAL_CALLBACK_ID = "consent_snooze_modal";

export interface SnoozeModalMetadata {
  clusterId: string;
  channelId: string;
  messageTs: string;
}

/** Opened when "Snooze" is clicked - gathers the two things a button click alone can't: how long, and why (required, so there's always a reason recorded for whoever reviews it later). `dayOptions` comes from Settings.snoozeDayOptions (configurable in the settings page) rather than being fixed here. */
export function buildSnoozeModalView(clusterName: string, metadata: SnoozeModalMetadata, dayOptions: number[]) {
  return {
    type: "modal" as const,
    callback_id: SNOOZE_MODAL_CALLBACK_ID,
    private_metadata: JSON.stringify(metadata),
    title: { type: "plain_text" as const, text: "Snooze request" },
    submit: { type: "plain_text" as const, text: "Snooze" },
    close: { type: "plain_text" as const, text: "Cancel" },
    blocks: [
      {
        type: "section",
        text: { type: "mrkdwn", text: `Delay the request for *${clusterName}* and explain why.` },
      },
      {
        type: "input",
        block_id: "snooze_days",
        label: { type: "plain_text", text: "Snooze for" },
        element: {
          type: "static_select",
          action_id: "days",
          placeholder: { type: "plain_text", text: "Choose a duration" },
          options: dayOptions.map((days) => ({
            text: { type: "plain_text", text: `${days} day${days > 1 ? "s" : ""}` },
            value: String(days),
          })),
        },
      },
      {
        type: "input",
        block_id: "justification",
        label: { type: "plain_text", text: "Reason (required - shown in the dashboard)" },
        element: {
          type: "plain_text_input",
          action_id: "text",
          multiline: true,
          placeholder: { type: "plain_text", text: "e.g. still needed for a POC through end of month" },
        },
      },
    ],
  };
}

export interface SnoozeSubmission {
  days: number;
  justification: string;
  metadata: SnoozeModalMetadata;
}

/** Loosely typed on purpose - Bolt's view-submission payload type is a deep generic keyed off block/action id strings that isn't worth fighting for a handful of fields read once. */
export function parseSnoozeSubmission(view: {
  private_metadata: string;
  state: { values: Record<string, Record<string, { selected_option?: { value?: string }; value?: string }>> };
}): SnoozeSubmission | null {
  let metadata: SnoozeModalMetadata;
  try {
    metadata = JSON.parse(view.private_metadata) as SnoozeModalMetadata;
  } catch {
    return null;
  }

  const daysValue = view.state.values.snooze_days?.days?.selected_option?.value;
  const days = daysValue ? Number.parseInt(daysValue, 10) : NaN;
  if (!Number.isFinite(days) || days <= 0) return null;

  // Required per the modal's own "Reason (required)" label - Slack's
  // client-side validation should already block submission without it, but
  // don't trust that alone for something that gets persisted and displayed.
  const justification = view.state.values.justification?.text?.value?.trim();
  if (!justification) return null;

  return { days, justification, metadata };
}

export interface SentMessage {
  channelId: string;
  messageTs: string;
}

export type SlackSendOutcome = ({ ok: true } & SentMessage) | { ok: false; reason: string };

/** Pulls the actual Slack error code (e.g. "missing_scope", "users_not_found", "invalid_auth") out of whatever @slack/web-api throws, instead of a useless generic message. */
export function slackErrorReason(err: unknown): string {
  if (err && typeof err === "object") {
    const data = (err as { data?: { error?: string } }).data;
    if (typeof data?.error === "string") return data.error;
  }
  if (err instanceof Error) return err.message;
  return String(err);
}

/**
 * Resolves the owner's Slack user by email and DMs them. Never throws -
 * every failure (no matching Slack account, missing bot scope, invalid
 * token, DM couldn't be opened/posted, ...) comes back as `{ok: false,
 * reason}` with the real Slack error code, not a generic "didn't work."
 */
export async function sendConsentDM(
  botToken: string,
  email: string,
  message: SlackMessage,
): Promise<SlackSendOutcome> {
  const client = new WebClient(botToken);

  let userId: string | undefined;
  try {
    userId = (await client.users.lookupByEmail({ email })).user?.id;
  } catch (err) {
    return { ok: false, reason: `users.lookupByEmail: ${slackErrorReason(err)}` };
  }
  if (!userId) return { ok: false, reason: "users.lookupByEmail: no matching Slack user" };

  let channelId: string | undefined;
  try {
    channelId = (await client.conversations.open({ users: userId })).channel?.id;
  } catch (err) {
    return { ok: false, reason: `conversations.open: ${slackErrorReason(err)}` };
  }
  if (!channelId) return { ok: false, reason: "conversations.open: no channel returned" };

  let messageTs: string | undefined;
  try {
    messageTs = (
      await client.chat.postMessage({ channel: channelId, text: message.text, blocks: message.blocks as never })
    ).ts;
  } catch (err) {
    return { ok: false, reason: `chat.postMessage: ${slackErrorReason(err)}` };
  }
  if (!messageTs) return { ok: false, reason: "chat.postMessage: no timestamp returned" };

  return { ok: true, channelId, messageTs };
}

/** Updates a previously-sent message in place - used to show a decision's outcome or mark a message superseded, removing its now-stale buttons. */
export async function updateMessage(
  botToken: string,
  channelId: string,
  messageTs: string,
  text: string,
): Promise<void> {
  const client = new WebClient(botToken);
  await client.chat.update({
    channel: channelId,
    ts: messageTs,
    text,
    blocks: [{ type: "section", text: { type: "mrkdwn", text } }] as never,
  });
}

export interface SlackConnectionCheck {
  label: string;
  ok: boolean;
  detail: string;
}

export interface SlackConnectionTestResult {
  ok: boolean;
  checks: SlackConnectionCheck[];
}

/**
 * Made-up targets, never real - used to distinguish "the scope is missing"
 * (missing_scope) from "the scope works fine, this target just doesn't
 * exist" (users_not_found / channel_not_found / etc.), without touching a
 * real person, channel, or - critically - trying to DM the bot itself.
 * (An earlier version of this check tried exactly that and hit
 * `cannot_dm_bot`: Slack flatly refuses to let a bot open a DM with
 * another bot, including itself, so that was never a valid way to test
 * im:write in the first place. conversations.open never sends anything
 * visible to anyone regardless of whether its target happens to be real.)
 */
const SCOPE_PROBE_EMAIL = "capella-housekeeper-connection-test@example.invalid";
const SCOPE_PROBE_USER_ID = "U00000000AA";
const SCOPE_PROBE_CHANNEL_ID = "C00000000AA";

/** A made-up-target probe succeeded at exercising the scope as long as the failure wasn't specifically "missing_scope" - any other error means Slack got far enough to complain about the target instead. */
function scopePresent(reason: string): boolean {
  return reason !== "missing_scope";
}

/**
 * Exercises the bot token and app-level token against real Slack API calls
 * and reports what actually happened, scope by scope - the same
 * missing_scope-vs-target-not-found distinction that diagnosed the real
 * setup issues earlier in this feature's rollout, now available as a
 * button instead of trial-and-error against a real cluster owner.
 */
export async function testSlackConnection(botToken: string, appToken: string): Promise<SlackConnectionTestResult> {
  const checks: SlackConnectionCheck[] = [];
  const client = new WebClient(botToken);

  try {
    const res = await client.auth.test();
    checks.push({
      label: "Bot token",
      ok: true,
      detail: `Valid - authenticated as ${res.user ?? "unknown"} in workspace ${res.team ?? "unknown"}.`,
    });
  } catch (err) {
    checks.push({ label: "Bot token", ok: false, detail: slackErrorReason(err) });
  }

  try {
    await client.conversations.open({ users: SCOPE_PROBE_USER_ID });
    checks.push({ label: "im:write", ok: true, detail: "Scope present (unexpectedly opened a real DM)." });
  } catch (err) {
    const reason = slackErrorReason(err);
    checks.push({
      label: "im:write",
      ok: scopePresent(reason),
      detail: scopePresent(reason) ? `Scope present (${reason}, as expected for a made-up user id).` : reason,
    });
  }

  try {
    await client.chat.postMessage({ channel: SCOPE_PROBE_CHANNEL_ID, text: "Capella Housekeeper connection test" });
    checks.push({ label: "chat:write", ok: true, detail: "Scope present (unexpectedly posted to a real channel)." });
  } catch (err) {
    const reason = slackErrorReason(err);
    checks.push({
      label: "chat:write",
      ok: scopePresent(reason),
      detail: scopePresent(reason) ? `Scope present (${reason}, as expected for a made-up channel id).` : reason,
    });
  }

  try {
    await client.users.lookupByEmail({ email: SCOPE_PROBE_EMAIL });
    checks.push({ label: "users:read.email", ok: true, detail: "Scope present (unexpectedly matched a real user)." });
  } catch (err) {
    const reason = slackErrorReason(err);
    checks.push({
      label: "users:read.email",
      ok: reason === "users_not_found",
      detail: reason === "users_not_found" ? "Scope present (test address correctly not found)." : reason,
    });
  }

  try {
    await new WebClient(appToken).apps.connections.open();
    checks.push({ label: "App-level token (connections:write)", ok: true, detail: "Valid - Socket Mode can connect." });
  } catch (err) {
    checks.push({ label: "App-level token (connections:write)", ok: false, detail: slackErrorReason(err) });
  }

  return { ok: checks.every((c) => c.ok), checks };
}
