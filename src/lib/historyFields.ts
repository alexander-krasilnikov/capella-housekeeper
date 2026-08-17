import { formatConfigSummary, formatStatusLabel } from "./configSummary";
import { formatUsd } from "./format";
import type { ClusterConfig, ClusterRecord, ConsentActionOutcome, ConsentStatus, HistoryTrigger } from "../types";

/** `config`'s resource-shape fields only, excluding `status` (the cluster's operational state) - so a pure status transition (e.g. "Turned Off" -> "Turning Off") is tracked and described under the separate "status" HISTORY_FIELDS entry below, not folded into "Configuration" as if the resource shape itself had changed. */
function configShapeSignature(config: ClusterConfig): string {
  return JSON.stringify({
    cloudProvider: config.cloudProvider,
    region: config.region,
    couchbaseVersion: config.couchbaseVersion,
    nodeCount: config.nodeCount,
    nodeSpec: config.nodeSpec,
  });
}

export interface FieldChange {
  field: string;
  label: string;
  from: string;
  to: string;
}

interface HistoryFieldSpec {
  field: string;
  label: string;
  /** Whether a change in this field alone makes a history entry a lifecycle event for the audit log - see cluster-history-ui spec "Cross-cluster lifecycle audit log". */
  lifecycle: boolean;
  differs: (a: ClusterRecord, b: ClusterRecord) => boolean;
  describe: (r: ClusterRecord) => string;
}

/**
 * The single field set a history entry is gated on (historyEntriesDiffer)
 * and diffed against for display (computeFieldChanges) - kept as one list
 * so the two can't silently drift apart. Deliberately excludes
 * `lastSyncedAt`, `lastObservedFingerprint`, `lastActivityAt`, and
 * `lastActivitySource` - see cluster-history-log design.md.
 */
const HISTORY_FIELDS: HistoryFieldSpec[] = [
  {
    field: "config",
    label: "Configuration",
    lifecycle: false,
    differs: (a, b) => configShapeSignature(a.config) !== configShapeSignature(b.config),
    describe: (r) => formatConfigSummary(r.config),
  },
  {
    field: "status",
    label: "Status",
    lifecycle: false,
    differs: (a, b) => a.config.status !== b.config.status,
    describe: (r) => formatStatusLabel(r.config.status),
  },
  {
    field: "actualCost",
    label: "Actual cost",
    lifecycle: false,
    differs: (a, b) => a.actualCost.amountUsd !== b.actualCost.amountUsd,
    describe: (r) => formatUsd(r.actualCost.amountUsd),
  },
  {
    field: "deletedAt",
    label: "Deleted",
    lifecycle: false,
    differs: (a, b) => a.deletedAt !== b.deletedAt,
    describe: (r) => r.deletedAt ?? "—",
  },
  {
    field: "ownerDerived",
    label: "Owner",
    lifecycle: false,
    differs: (a, b) => a.ownerDerived !== b.ownerDerived,
    describe: (r) => r.ownerDerived ?? "Unknown",
  },
  {
    field: "consentStatus",
    label: "Consent status",
    lifecycle: true,
    differs: (a, b) => a.consentStatus !== b.consentStatus,
    describe: (r) => r.consentStatus,
  },
  {
    field: "actionOutcome",
    label: "Action outcome",
    lifecycle: true,
    differs: (a, b) => a.actionOutcome !== b.actionOutcome,
    describe: (r) => r.actionOutcome,
  },
  {
    field: "snoozeUntil",
    label: "Snoozed until",
    lifecycle: true,
    differs: (a, b) => a.snoozeUntil !== b.snoozeUntil,
    describe: (r) => r.snoozeUntil ?? "—",
  },
  {
    field: "snoozeJustification",
    label: "Snooze reason",
    lifecycle: true,
    differs: (a, b) => a.snoozeJustification !== b.snoozeJustification,
    describe: (r) => r.snoozeJustification ?? "—",
  },
  {
    field: "remindersSent",
    label: "Reminders sent",
    lifecycle: true,
    differs: (a, b) => a.remindersSent !== b.remindersSent,
    describe: (r) => String(r.remindersSent),
  },
  {
    field: "consentCycleStartedAt",
    label: "Consent cycle started",
    lifecycle: true,
    differs: (a, b) => a.consentCycleStartedAt !== b.consentCycleStartedAt,
    describe: (r) => r.consentCycleStartedAt ?? "—",
  },
  {
    field: "snoozeCount",
    label: "Snoozes used",
    lifecycle: true,
    differs: (a, b) => a.snoozeCount !== b.snoozeCount,
    describe: (r) => String(r.snoozeCount),
  },
  {
    field: "consentStatusChangedAt",
    label: "Consent status changed",
    lifecycle: true,
    differs: (a, b) => a.consentStatusChangedAt !== b.consentStatusChangedAt,
    describe: (r) => r.consentStatusChangedAt ?? "—",
  },
  {
    field: "workflowNote",
    label: "Workflow note",
    lifecycle: true,
    differs: (a, b) => a.workflowNote !== b.workflowNote,
    describe: (r) => r.workflowNote ?? "—",
  },
];

const LIFECYCLE_FIELD_NAMES = new Set(HISTORY_FIELDS.filter((f) => f.lifecycle).map((f) => f.field));

/**
 * Triggers that are always a lifecycle event regardless of which field
 * actually changed - a manual turn-on/turn-off/delete only ever touches
 * `config`/`deletedAt` (both `lifecycle: false`, since routine sync-detected
 * changes to those same fields are noise), but an operator's own action is
 * exactly what the cross-cluster Lifecycle History audit log exists to
 * surface - see cluster-history-ui spec "Cross-cluster lifecycle audit log".
 */
const ALWAYS_LIFECYCLE_TRIGGERS: ReadonlySet<HistoryTrigger> = new Set([
  "manual-turn-off",
  "manual-turn-on",
  "manual-delete",
]);

/**
 * The only two triggers that move `consentStatus` into an `approved-*`
 * state - see the `describeAuditEntry` branch below that already
 * special-cases `slack-decision` when narrating an approval. Exported so
 * consentActionHealth.ts's cycle reconstruction reads this same set instead
 * of re-deriving "who can approve a cycle" independently, which would
 * otherwise be free to silently drift from this file's own trigger
 * semantics as the state machine evolves.
 */
export const APPROVAL_TRIGGERS: ReadonlySet<HistoryTrigger> = new Set(["slack-decision", "auto-turnoff-decision"]);

/**
 * Triggers where an operator acted directly on a cluster's power state,
 * bypassing the consent pipeline entirely - a subset of
 * ALWAYS_LIFECYCLE_TRIGGERS (excludes manual-turn-on, which isn't a
 * stop/delete action). Exported for the same reason as APPROVAL_TRIGGERS.
 */
export const MANUAL_ACTION_TRIGGERS: ReadonlySet<HistoryTrigger> = new Set(["manual-turn-off", "manual-delete"]);

/** See cluster-sync spec "Cluster record persistence" - true iff any compared field differs. */
export function historyEntriesDiffer(a: ClusterRecord, b: ClusterRecord): boolean {
  return HISTORY_FIELDS.some((spec) => spec.differs(a, b));
}

/** Empty for the first entry for a cluster - see cluster-history-ui spec "Cluster with only one recorded entry". */
export function computeFieldChanges(prior: ClusterRecord | null, next: ClusterRecord): FieldChange[] {
  if (!prior) return [];
  return HISTORY_FIELDS.filter((spec) => spec.differs(prior, next)).map((spec) => ({
    field: spec.field,
    label: spec.label,
    from: spec.describe(prior),
    to: spec.describe(next),
  }));
}

/** See cluster-history-ui spec "Cross-cluster lifecycle audit log" / "Routine sync-detected changes excluded". `trigger` is optional so existing (pre-trigger-awareness) callers keep working unchanged. */
export function isLifecycleChange(changes: FieldChange[], trigger?: HistoryTrigger): boolean {
  if (trigger && ALWAYS_LIFECYCLE_TRIGGERS.has(trigger)) return true;
  return changes.some((c) => LIFECYCLE_FIELD_NAMES.has(c.field));
}

export interface AuditLogEntry {
  clusterId: string;
  clusterName: string;
  orgName: string;
  projectName: string;
  takenAt: string;
  trigger: HistoryTrigger;
  /** The record's actual consent/action-outcome values at this entry - not just what changed this entry - so narration can say "Turned off" vs "Deleted" even on an entry where only actionOutcome moved. */
  consentStatus: ConsentStatus;
  actionOutcome: ConsentActionOutcome;
  /** Persisted system-written explanation for this entry's consentStatus/actionOutcome, if one was recorded - see cluster-history-ui spec "History views state the system's own explanation when one was recorded". Null for owner-driven/manual/reset entries, and for entries recorded before this field existed. */
  workflowNote: string | null;
  changes: FieldChange[];
}

/**
 * Short, standalone label for a trigger - e.g. a "Trigger" column value.
 * Kept in this file (not historyView.ts) deliberately: this file has no
 * `node:fs` dependency, so a Client Component (e.g. ClusterHistoryButton)
 * can import it directly without pulling fs-backed code into the browser
 * bundle - historyView.ts's readHistory()-based functions are server-only.
 */
export const TRIGGER_LABEL: Record<HistoryTrigger, string> = {
  sync: "Sync",
  "manual-turn-off": "Manual turn-off",
  "manual-delete": "Manual delete",
  "manual-turn-on": "Manual turn-on",
  "slack-decision": "Slack",
  "manual-consent-request": "Manual request",
  reconciliation: "Reconciliation",
  "auto-turnoff-decision": "Auto turn-off (snooze limit)",
};

/** Same trigger, phrased to read naturally after an action - e.g. "Turned off - reconciliation". */
const TRIGGER_PHRASE: Record<HistoryTrigger, string> = {
  sync: "detected during sync",
  "manual-turn-off": "manual turn-off",
  "manual-delete": "manual delete",
  "manual-turn-on": "manual turn-on",
  "slack-decision": "via Slack",
  "manual-consent-request": "manually sent",
  reconciliation: "reconciliation",
  "auto-turnoff-decision": "snooze limit reached",
};

/**
 * Turns an audit-log entry's field changes into one plain-language
 * sentence, e.g. "Notified owner - via Slack" or "Turned off -
 * reconciliation". Priority order below picks the single most meaningful
 * change to headline when more than one lifecycle field moved in the same
 * entry. Reads `entry.consentStatus`/`entry.actionOutcome` (the record's
 * actual current values), not just the `changes` deltas - a `performed`
 * entry only ever shows `actionOutcome` as changed (consentStatus stays
 * "approved-turnoff"/"approved-delete" from the earlier decision), so the
 * *current* consentStatus is what says which action was actually performed.
 *
 * `actionOutcome` transitioning to "none" is deliberately excluded from the
 * action-performed branch below - that's a tier-change reset (see
 * notifications.ts `applyConsentNotifications`), which resets consentStatus
 * to "none" in the very same entry, and it's that reset the consentStatus
 * branch narrates ("Consent cycle cleared"). Treating a reset-to-"none" as
 * an "action" would otherwise print the raw enum value.
 *
 * `entry.workflowNote`, when present, is appended after the generic
 * trigger-derived phrase rather than replacing it - see cluster-history-ui
 * spec "History views state the system's own explanation when one was
 * recorded." Entries recorded before that field existed (or from an
 * owner-driven/manual transition, which never sets it) simply have nothing
 * to append.
 */
export function describeAuditEntry(entry: AuditLogEntry): string {
  const trigger = TRIGGER_PHRASE[entry.trigger];
  const changedFields = new Set(entry.changes.map((c) => c.field));
  const noteSuffix = entry.workflowNote ? ` (${entry.workflowNote})` : "";

  if (changedFields.has("actionOutcome") && entry.actionOutcome !== "none") {
    const action = entry.consentStatus === "approved-delete" ? "Delete" : "Turn-off";
    if (entry.actionOutcome === "performed") {
      return `${entry.consentStatus === "approved-delete" ? "Deleted" : "Turned off"} - ${trigger}`;
    }
    if (entry.actionOutcome === "skipped") return `${action} skipped (tier changed) - ${trigger}${noteSuffix}`;
    return `${action} failed - ${trigger}${noteSuffix}`;
  }

  if (changedFields.has("consentStatus")) {
    const label =
      entry.consentStatus === "pending"
        ? "Notified owner"
        : entry.consentStatus === "approved-turnoff"
          ? entry.trigger === "slack-decision"
            ? "Owner approved turn-off"
            : "Auto turn-off triggered"
          : entry.consentStatus === "approved-delete"
            ? "Owner approved delete"
            : entry.consentStatus === "snoozed"
              ? "Owner snoozed"
              : entry.consentStatus === "expired"
                ? "Request expired"
                : "Consent cycle cleared";
    const suffix = entry.consentStatus === "approved-turnoff" && entry.trigger !== "slack-decision" ? noteSuffix : "";
    return `${label} - ${trigger}${suffix}`;
  }

  if (changedFields.has("remindersSent")) return `Reminder sent - ${trigger}`;
  if (changedFields.has("snoozeUntil")) return `Snooze updated - ${trigger}`;

  return `Consent cycle updated - ${trigger}`;
}
