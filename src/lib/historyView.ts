import { getClusterHistoryEntries, getLifecycleHistoryEntries, getPreviousHistoryEntry } from "./store";
import { computeFieldChanges, type AuditLogEntry, type FieldChange } from "./historyFields";
import type { ClusterSnapshot, HistoryTrigger } from "../types";

// Re-exported so existing importers (app/page.tsx, app/actions.ts,
// ClusterHistoryButton.tsx) don't need to know these live in historyFields.ts -
// they're pure/no-I/O there specifically so a Client Component can import them
// directly without pulling this file's `node:fs`-backed functions into the
// browser bundle (see historyFields.ts's comment on TRIGGER_LABEL).
export { TRIGGER_LABEL, describeAuditEntry, type AuditLogEntry } from "./historyFields";

export interface HistoryTimelineEntry {
  takenAt: string;
  trigger: HistoryTrigger;
  clusterName: string;
  /** Includes a "Workflow note" entry whenever workflowNote changed - no separate field needed, the generic diff already surfaces the persisted explanation (see historyFields.ts's HISTORY_FIELDS). */
  changes: FieldChange[];
}

/**
 * A cluster's recorded history entries, most recent first, each diffed
 * against the entry immediately before it in time - see cluster-history-ui
 * spec "Per-cluster history timeline". Diffing is done in chronological
 * (oldest-first) order so each entry compares against its true predecessor,
 * then the result is reversed for display; the chronologically-first entry
 * (last in the returned list) always has an empty `changes` list (nothing to
 * compare against yet), not a fabricated "everything changed" diff against a
 * non-existent predecessor.
 */
export async function getClusterHistory(clusterId: string): Promise<HistoryTimelineEntry[]> {
  const forCluster = await getClusterHistoryEntries(clusterId);

  const entries: HistoryTimelineEntry[] = [];
  let prior: ClusterSnapshot | null = null;
  for (const snapshot of forCluster) {
    entries.push({
      takenAt: snapshot.takenAt,
      // Defaulted by readHistory() itself for entries written before this field existed.
      trigger: snapshot.trigger ?? "sync",
      clusterName: snapshot.record.clusterName,
      changes: computeFieldChanges(prior?.record ?? null, snapshot.record),
    });
    prior = snapshot;
  }
  return entries.reverse();
}

/**
 * Every history entry, across every cluster (including ones since deleted),
 * whose diff from the previous entry for that same cluster touched a
 * consent/lifecycle field - not routine config/cost drift. Most-recent-first.
 * See cluster-history-ui spec "Cross-cluster lifecycle audit log".
 *
 * `isLifecycleChange` is read directly off each stored entry rather than
 * recomputed here - it was already decided once, at write time, from the
 * `prior`/`next` records the writer had in hand (see store.ts
 * `appendHistoryIfChanged`/sync.ts, and design.md Decision 7). This is an
 * indexed lookup of exactly the qualifying rows, not a full-table scan/
 * group/diff. Whether the classification rules change later does not
 * retroactively affect entries already recorded - see the modified
 * "Cross-cluster lifecycle audit log" requirement in this change's spec.
 */
export async function getLifecycleAuditLog(): Promise<AuditLogEntry[]> {
  const lifecycleEntries = await getLifecycleHistoryEntries();

  const entries: AuditLogEntry[] = [];
  for (const snapshot of lifecycleEntries) {
    const prior = await getPreviousHistoryEntry(snapshot.clusterId, snapshot.takenAt);
    entries.push({
      clusterId: snapshot.clusterId,
      clusterName: snapshot.record.clusterName,
      orgName: snapshot.record.orgName,
      projectName: snapshot.record.projectName,
      takenAt: snapshot.takenAt,
      trigger: snapshot.trigger ?? "sync",
      consentStatus: snapshot.record.consentStatus,
      actionOutcome: snapshot.record.actionOutcome,
      workflowNote: snapshot.record.workflowNote,
      changes: computeFieldChanges(prior?.record ?? null, snapshot.record),
    });
  }

  return entries;
}
