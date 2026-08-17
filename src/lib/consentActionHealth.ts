import { APPROVAL_TRIGGERS, MANUAL_ACTION_TRIGGERS } from "./historyFields";
import type { AuditLogEntry } from "./historyFields";
import { groupBy } from "./groupBy";
import type { ConsentStatus, HistoryTrigger } from "../types";

const HOUR_MS = 60 * 60 * 1000;
export const DEFAULT_WINDOW_HOURS = 168;
/**
 * How far before the display window to still include audit-log entries when
 * reconstructing cycles. An action performed inside the display window can
 * trace back to an approval that happened earlier (see the "Slack-approved"
 * lineage tracing below) - cutting entries off exactly at the window
 * boundary would silently break that lineage for any cycle whose approval
 * landed just before it. 30 days is far larger than any realistic
 * ask-to-execution gap while still bounding reconstruction cost to a fixed
 * ceiling instead of the audit log's entire history since inception.
 */
const LINEAGE_LOOKBACK_HOURS = 24 * 30;

export type ConsentCycleOutcome = "approved" | "snoozed" | "expired" | "pending";

/** A single ask-to-resolution cycle for one cluster, reconstructed from the audit log - see design.md "Cycle reconstruction, not live-field reads." */
export interface ConsentCycle {
  clusterId: string;
  clusterName: string;
  startedAtMs: number;
  outcome: ConsentCycleOutcome;
  /** null while `outcome` is "pending". */
  resolvedAtMs: number | null;
}

export type ActionCategory = "manual" | "auto-decided" | "slack-approved";

/** A stop/delete action attributed to who/what decided it - see design.md "Action-trigger attribution uses three categories". */
export interface ReconstructedAction {
  clusterId: string;
  clusterName: string;
  performedAtMs: number;
  category: ActionCategory;
}

const APPROVED_STATUSES: ReadonlySet<ConsentStatus> = new Set(["approved-turnoff", "approved-delete"]);

function outcomeForResolvedStatus(status: ConsentStatus): ConsentCycleOutcome | null {
  if (APPROVED_STATUSES.has(status)) return "approved";
  if (status === "snoozed") return "snoozed";
  if (status === "expired") return "expired";
  return null;
}

/** `getLifecycleAuditLog()` returns entries most-recent-first across every cluster - group and sort each cluster's own entries oldest-first so cycles can be walked in the order they actually happened. */
function groupByClusterChronological(entries: AuditLogEntry[]): Map<string, AuditLogEntry[]> {
  const byCluster = groupBy(entries, (e) => e.clusterId);
  for (const list of byCluster.values()) {
    list.sort((a, b) => new Date(a.takenAt).getTime() - new Date(b.takenAt).getTime());
  }
  return byCluster;
}

export interface ReconstructedHistory {
  cycles: ConsentCycle[];
  actions: ReconstructedAction[];
}

/**
 * Walks each cluster's lifecycle audit-log entries in chronological order,
 * reconstructing consent cycles (start -> resolution) and stop/delete
 * actions attributed to who/what decided them.
 *
 * A cycle starts wherever `consentStatus` moves *into* "pending" from
 * anything other than "pending" itself - not only from "none". The real
 * state machine (see notifications.ts's `applyConsentNotifications`)
 * collapses a reset-to-"none" and a set-to-"pending" into one synchronous
 * mutation per sync pass for the common age-tier-transition path, and skips
 * "none" entirely on snooze-resume ("snoozed" -> "pending" directly) - so a
 * persisted diff literally `{from: "none", to: "pending"}` is closer to the
 * exception than the rule. Treating any non-"pending" -> "pending" move as a
 * start recognizes all of these paths uniformly.
 *
 * A cycle resolves at the next `consentStatus` change for that cluster,
 * classified as approved/snoozed/expired - see design.md's Decisions
 * section. A change to "none" instead means the cycle was *cancelled*
 * (an age-tier change or a manual turn-off/turn-on reset it, not an owner
 * decision) - it's discarded rather than counted toward any funnel bucket,
 * and critically the open-cycle marker is cleared so a stale start time
 * can't resurface later as a bogus "still pending" cycle.
 *
 * A manual turn-off/delete is recorded as an action directly, since it
 * bypasses the consent pipeline. A reconciliation-performed action is
 * traced back to the trigger that most recently approved the current cycle
 * ("slack-decision" or "auto-turnoff-decision") to attribute who actually
 * decided it, not just which code path executed the API call - see
 * design.md's "Slack-approved" vs "Auto-decided" decision. This generalizes
 * design.md's two named patterns (decide+act in one entry vs.
 * decide-then-later-execute) into one rule: trace the lineage regardless of
 * whether decision and execution landed in the same entry.
 */
export function reconstructConsentAndActionHistory(entries: AuditLogEntry[]): ReconstructedHistory {
  const cycles: ConsentCycle[] = [];
  const actions: ReconstructedAction[] = [];
  const byCluster = groupByClusterChronological(entries);

  for (const [clusterId, clusterEntries] of byCluster) {
    let openCycleStartedAtMs: number | null = null;
    let lastApprovalTrigger: HistoryTrigger | null = null;

    for (const entry of clusterEntries) {
      const takenAtMs = new Date(entry.takenAt).getTime();

      if (MANUAL_ACTION_TRIGGERS.has(entry.trigger)) {
        actions.push({ clusterId, clusterName: entry.clusterName, performedAtMs: takenAtMs, category: "manual" });
      }

      const consentChange = entry.changes.find((c) => c.field === "consentStatus");
      if (consentChange) {
        if (consentChange.to === "pending" && consentChange.from !== "pending") {
          openCycleStartedAtMs = takenAtMs;
          lastApprovalTrigger = null;
        } else if (openCycleStartedAtMs !== null) {
          if (entry.consentStatus === "none") {
            openCycleStartedAtMs = null;
            lastApprovalTrigger = null;
          } else {
            const outcome = outcomeForResolvedStatus(entry.consentStatus);
            if (outcome) {
              cycles.push({
                clusterId,
                clusterName: entry.clusterName,
                startedAtMs: openCycleStartedAtMs,
                outcome,
                resolvedAtMs: takenAtMs,
              });
              if (outcome === "approved" && APPROVAL_TRIGGERS.has(entry.trigger)) lastApprovalTrigger = entry.trigger;
              openCycleStartedAtMs = null;
            }
          }
        }
      }

      const actionOutcomeChanged = entry.changes.some((c) => c.field === "actionOutcome");
      if (actionOutcomeChanged && entry.actionOutcome === "performed") {
        // No traceable approval lineage shouldn't happen given the state machine
        // (a performed action always follows an approved-turnoff/approved-delete
        // decision) - default to "auto-decided" rather than dropping the action.
        const category: ActionCategory = lastApprovalTrigger === "slack-decision" ? "slack-approved" : "auto-decided";
        actions.push({ clusterId, clusterName: entry.clusterName, performedAtMs: takenAtMs, category });
      }
    }

    if (openCycleStartedAtMs !== null) {
      const last = clusterEntries[clusterEntries.length - 1];
      cycles.push({
        clusterId,
        clusterName: last.clusterName,
        startedAtMs: openCycleStartedAtMs,
        outcome: "pending",
        resolvedAtMs: null,
      });
    }
  }

  return { cycles, actions };
}

export function cyclesStartedWithin(cycles: ConsentCycle[], windowStartMs: number): ConsentCycle[] {
  return cycles.filter((c) => c.startedAtMs >= windowStartMs);
}

export function actionsWithin(actions: ReconstructedAction[], windowStartMs: number): ReconstructedAction[] {
  return actions.filter((a) => a.performedAtMs >= windowStartMs);
}

export interface ConsentFunnelSummary {
  approved: number;
  snoozed: number;
  expired: number;
  pending: number;
}

/** Raw counts per outcome, for a set of cycles already narrowed to the window - see spec "Funnel panel shows raw counts per outcome". */
export function summarizeFunnel(cycles: ConsentCycle[]): ConsentFunnelSummary {
  const counts: ConsentFunnelSummary = { approved: 0, snoozed: 0, expired: 0, pending: 0 };
  for (const cycle of cycles) counts[cycle.outcome]++;
  return counts;
}

export interface ActionsSummary {
  manual: number;
  autoDecided: number;
  slackApproved: number;
}

/** Raw counts by attributed category, for a set of actions already narrowed to the window - see spec "Actions-taken panel shows raw counts by trigger". */
export function summarizeActions(actions: ReconstructedAction[]): ActionsSummary {
  const summary: ActionsSummary = { manual: 0, autoDecided: 0, slackApproved: 0 };
  for (const action of actions) {
    if (action.category === "manual") summary.manual++;
    else if (action.category === "auto-decided") summary.autoDecided++;
    else summary.slackApproved++;
  }
  return summary;
}

export interface ConsentAndActionHealth {
  funnel: ConsentFunnelSummary;
  actions: ActionsSummary;
}

/**
 * One-call entry point: reconstructs cycles/actions from the raw audit log,
 * narrows both to the trailing `windowHours` ending at `nowMs`, and
 * aggregates each into its dashboard summary - see design.md "Computed at
 * render time, same pattern as clusterCounts.ts/costSeries.ts".
 *
 * Reconstruction runs over entries within `LINEAGE_LOOKBACK_HOURS` of the
 * window, not the full unbounded audit log - see that constant's comment.
 */
export function summarizeConsentAndActionHealth(
  entries: AuditLogEntry[],
  nowMs: number,
  windowHours: number = DEFAULT_WINDOW_HOURS,
): ConsentAndActionHealth {
  const windowStartMs = nowMs - windowHours * HOUR_MS;
  const lookbackStartMs = windowStartMs - LINEAGE_LOOKBACK_HOURS * HOUR_MS;
  const relevantEntries = entries.filter((e) => new Date(e.takenAt).getTime() >= lookbackStartMs);
  const { cycles, actions } = reconstructConsentAndActionHistory(relevantEntries);
  return {
    funnel: summarizeFunnel(cyclesStartedWithin(cycles, windowStartMs)),
    actions: summarizeActions(actionsWithin(actions, windowStartMs)),
  };
}
