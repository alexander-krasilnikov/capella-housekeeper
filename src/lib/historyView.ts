import { readHistory } from "./store";
import { computeFieldChanges, isLifecycleChange, type AuditLogEntry, type FieldChange } from "./historyFields";
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
  changes: FieldChange[];
}

/**
 * A cluster's recorded history entries, oldest first, each diffed against
 * the entry immediately before it - see cluster-history-ui spec "Per-cluster
 * history timeline". The first entry always has an empty `changes` list
 * (nothing to compare against yet), not a fabricated "everything changed"
 * diff against a non-existent predecessor.
 */
export async function getClusterHistory(clusterId: string): Promise<HistoryTimelineEntry[]> {
  const all = await readHistory();
  const forCluster = all
    .filter((s) => s.clusterId === clusterId)
    .sort((a, b) => a.takenAt.localeCompare(b.takenAt));

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
  return entries;
}

/**
 * Every history entry, across every cluster (including ones since deleted -
 * this reads history.json directly rather than joining against the live
 * clusters.json table), whose diff from the previous entry for that same
 * cluster touches a consent/lifecycle field - not routine config/cost drift.
 * Most-recent-first. See cluster-history-ui spec "Cross-cluster lifecycle
 * audit log".
 */
export async function getLifecycleAuditLog(): Promise<AuditLogEntry[]> {
  const all = await readHistory();

  const byCluster = new Map<string, ClusterSnapshot[]>();
  for (const snapshot of all) {
    const list = byCluster.get(snapshot.clusterId) ?? [];
    list.push(snapshot);
    byCluster.set(snapshot.clusterId, list);
  }

  const entries: AuditLogEntry[] = [];
  for (const snapshots of byCluster.values()) {
    snapshots.sort((a, b) => a.takenAt.localeCompare(b.takenAt));
    let prior: ClusterSnapshot | null = null;
    for (const snapshot of snapshots) {
      const changes = computeFieldChanges(prior?.record ?? null, snapshot.record);
      if (isLifecycleChange(changes)) {
        entries.push({
          clusterId: snapshot.clusterId,
          clusterName: snapshot.record.clusterName,
          orgName: snapshot.record.orgName,
          projectName: snapshot.record.projectName,
          takenAt: snapshot.takenAt,
          trigger: snapshot.trigger ?? "sync",
          consentStatus: snapshot.record.consentStatus,
          actionOutcome: snapshot.record.actionOutcome,
          changes,
        });
      }
      prior = snapshot;
    }
  }

  entries.sort((a, b) => b.takenAt.localeCompare(a.takenAt));
  return entries;
}
