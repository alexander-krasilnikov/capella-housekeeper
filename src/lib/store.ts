import type { ClusterRecord, ClusterSnapshot, HistoryTrigger } from "../types";
import { computeFieldChanges, historyEntriesDiffer, isLifecycleChange } from "./historyFields";
import { CLUSTER_RECORD_COLUMNS, fromEpochMs, fromSqliteBool, getDb, toEpochMs, toSqliteBool } from "./db";

export { historyEntriesDiffer } from "./historyFields";

/** A `clusters`/`history` row shaped exactly like the shared column list in db.ts - see design.md Decision 4. */
type ClusterRow = Record<string, unknown>;

/** `ClusterRecord` -> the flat, typed column values `db.ts`'s shared schema expects - see design.md Decisions 4-6. */
export function clusterRecordToRow(record: ClusterRecord): ClusterRow {
  return {
    clusterId: record.clusterId,
    clusterName: record.clusterName,
    orgId: record.orgId,
    orgName: record.orgName,
    orgConfigId: record.orgConfigId ?? null,
    projectId: record.projectId,
    projectName: record.projectName,
    cloudProvider: record.config.cloudProvider,
    region: record.config.region,
    couchbaseVersion: record.config.couchbaseVersion ?? null,
    nodeCount: record.config.nodeCount,
    nodeCpu: record.config.nodeSpec.compute.cpu,
    nodeRam: record.config.nodeSpec.compute.ram,
    status: record.config.status,
    createdAtMs: toEpochMs(record.createdAt),
    ownerDerived: record.ownerDerived,
    lastActivityAtMs: toEpochMs(record.lastActivityAt),
    lastActivitySource: record.lastActivitySource,
    actualCostAmountUsd: record.actualCost.amountUsd,
    actualCostAsOfMs: toEpochMs(record.actualCost.asOf),
    actualCostUnavailableReason: record.actualCost.unavailableReason ?? null,
    deletedAtMs: toEpochMs(record.deletedAt),
    lastSyncedAtMs: toEpochMs(record.lastSyncedAt),
    lastObservedFingerprint: record.lastObservedFingerprint,
    lastNotifiedRecency: record.lastNotifiedRecency,
    consentStatus: record.consentStatus,
    consentCycleStartedAtMs: toEpochMs(record.consentCycleStartedAt),
    remindersSent: record.remindersSent,
    consentTierAtDecision: record.consentTierAtDecision,
    actionOutcome: record.actionOutcome,
    slackChannelId: record.slackChannelId,
    slackMessageTs: record.slackMessageTs,
    snoozeUntilMs: toEpochMs(record.snoozeUntil),
    snoozeJustification: record.snoozeJustification,
    snoozeCount: record.snoozeCount,
    consentStatusChangedAtMs: toEpochMs(record.consentStatusChangedAt),
    workflowNote: record.workflowNote,
  };
}

/** The inverse of `clusterRecordToRow` - a `clusters`/`history` row back into a `ClusterRecord`. */
export function rowToClusterRecord(row: ClusterRow): ClusterRecord {
  return {
    clusterId: row.clusterId as string,
    clusterName: row.clusterName as string,
    orgId: row.orgId as string,
    orgName: row.orgName as string,
    orgConfigId: (row.orgConfigId as string | null) ?? undefined,
    projectId: row.projectId as string,
    projectName: row.projectName as string,
    config: {
      cloudProvider: row.cloudProvider as string,
      region: row.region as string,
      couchbaseVersion: (row.couchbaseVersion as string | null) ?? undefined,
      nodeCount: row.nodeCount as number,
      nodeSpec: { compute: { cpu: row.nodeCpu as number, ram: row.nodeRam as number } },
      status: row.status as string | null,
    },
    createdAt: fromEpochMs(row.createdAtMs as number) as string,
    ownerDerived: row.ownerDerived as string | null,
    lastActivityAt: fromEpochMs(row.lastActivityAtMs as number | null),
    lastActivitySource: row.lastActivitySource as ClusterRecord["lastActivitySource"],
    actualCost: {
      amountUsd: row.actualCostAmountUsd as number | null,
      asOf: fromEpochMs(row.actualCostAsOfMs as number | null),
      unavailableReason: (row.actualCostUnavailableReason as ClusterRecord["actualCost"]["unavailableReason"] | null) ?? undefined,
    },
    deletedAt: fromEpochMs(row.deletedAtMs as number | null),
    lastSyncedAt: fromEpochMs(row.lastSyncedAtMs as number) as string,
    lastObservedFingerprint: row.lastObservedFingerprint as string,
    lastNotifiedRecency: row.lastNotifiedRecency as ClusterRecord["lastNotifiedRecency"],
    consentStatus: row.consentStatus as ClusterRecord["consentStatus"],
    consentCycleStartedAt: fromEpochMs(row.consentCycleStartedAtMs as number | null),
    remindersSent: row.remindersSent as number,
    consentTierAtDecision: row.consentTierAtDecision as ClusterRecord["consentTierAtDecision"],
    actionOutcome: row.actionOutcome as ClusterRecord["actionOutcome"],
    slackChannelId: row.slackChannelId as string | null,
    slackMessageTs: row.slackMessageTs as string | null,
    snoozeUntil: fromEpochMs(row.snoozeUntilMs as number | null),
    snoozeJustification: row.snoozeJustification as string | null,
    snoozeCount: row.snoozeCount as number,
    consentStatusChangedAt: fromEpochMs(row.consentStatusChangedAtMs as number | null),
    workflowNote: (row.workflowNote as string | null | undefined) ?? null,
  };
}

function historyRowToSnapshot(row: ClusterRow): ClusterSnapshot {
  return {
    clusterId: row.clusterId as string,
    takenAt: fromEpochMs(row.takenAtMs as number) as string,
    record: rowToClusterRecord(row),
    trigger: row.trigger as HistoryTrigger,
    isLifecycleChange: fromSqliteBool(row.isLifecycleChange as number),
  };
}

const CLUSTER_INSERT_SQL = `
  INSERT INTO clusters (${CLUSTER_RECORD_COLUMNS.join(", ")})
  VALUES (${CLUSTER_RECORD_COLUMNS.map((c) => `@${c}`).join(", ")})
  ON CONFLICT(clusterId) DO UPDATE SET
    ${CLUSTER_RECORD_COLUMNS.filter((c) => c !== "clusterId").map((c) => `${c} = excluded.${c}`).join(", ")}
`;

const HISTORY_INSERT_SQL = `
  INSERT INTO history (takenAtMs, trigger, isLifecycleChange, ${CLUSTER_RECORD_COLUMNS.join(", ")})
  VALUES (@takenAtMs, @trigger, @isLifecycleChange, ${CLUSTER_RECORD_COLUMNS.map((c) => `@${c}`).join(", ")})
`;

type Db = ReturnType<typeof getDb>;

export async function readClusters(): Promise<ClusterRecord[]> {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM clusters").all() as ClusterRow[];
  return rows.map(rowToClusterRecord);
}

/** Single-cluster indexed lookup (`clusterId` is the table's primary key) - use this instead of `(await readClusters()).find(...)` wherever only one record is needed, e.g. a re-read-fresh-before-write. */
export async function getCluster(clusterId: string): Promise<ClusterRecord | null> {
  const db = getDb();
  const row = db.prepare("SELECT * FROM clusters WHERE clusterId = ?").get(clusterId) as ClusterRow | undefined;
  return row ? rowToClusterRecord(row) : null;
}

/** Non-transactional single-row upsert - the primitive `upsertClusters` builds on. */
function upsertClusterRow(db: Db, record: ClusterRecord): void {
  db.prepare(CLUSTER_INSERT_SQL).run(clusterRecordToRow(record) as Record<string, string | number | null>);
}

/** Merge one org/project sync pass into the flat cross-org collection - per-row upsert, never a whole-table rewrite (see design.md Decision 2). */
export async function upsertClusters(records: ClusterRecord[]): Promise<void> {
  if (records.length === 0) return;
  const db = getDb();
  db.exec("BEGIN");
  try {
    for (const record of records) upsertClusterRow(db, record);
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

/** Removes clusters from the live collection outright - used once a cluster's final state has been captured to history, rather than leaving a tombstone in place. */
export async function removeClusters(clusterIds: string[]): Promise<void> {
  if (clusterIds.length === 0) return;
  const db = getDb();
  const placeholders = clusterIds.map(() => "?").join(", ");
  db.prepare(`DELETE FROM clusters WHERE clusterId IN (${placeholders})`).run(...clusterIds);
}

/** The most recently recorded history row for a cluster, strictly before `beforeTakenAtMs` (or unconditionally if omitted) - used both for write-time lifecycle classification and for read-time diffing. */
function previousHistoryRow(db: Db, clusterId: string, beforeTakenAtMs?: number): ClusterRow | undefined {
  const sql =
    beforeTakenAtMs === undefined
      ? "SELECT * FROM history WHERE clusterId = ? ORDER BY takenAtMs DESC LIMIT 1"
      : "SELECT * FROM history WHERE clusterId = ? AND takenAtMs < ? ORDER BY takenAtMs DESC LIMIT 1";
  const params = beforeTakenAtMs === undefined ? [clusterId] : [clusterId, beforeTakenAtMs];
  return db.prepare(sql).get(...params) as ClusterRow | undefined;
}

/**
 * Non-transactional single-row insert - the primitive `appendHistory`
 * builds on. A snapshot's `isLifecycleChange` is normally already computed
 * by the caller (which has `prior` in hand - see `appendHistoryIfChanged`
 * and sync.ts); when it's absent (a caller with no known prior, e.g. a
 * legacy/test snapshot), it's computed here from the immediately-preceding
 * stored row for the same cluster.
 */
function insertHistoryRow(db: Db, snapshot: ClusterSnapshot): void {
  const takenAtMs = toEpochMs(snapshot.takenAt) as number;
  let lifecycle = snapshot.isLifecycleChange;
  if (lifecycle === undefined) {
    const prior = previousHistoryRow(db, snapshot.clusterId, takenAtMs);
    lifecycle = isLifecycleChange(
      computeFieldChanges(prior ? rowToClusterRecord(prior) : null, snapshot.record),
      snapshot.trigger,
    );
  }
  db.prepare(HISTORY_INSERT_SQL).run({
    takenAtMs,
    trigger: snapshot.trigger ?? "sync",
    isLifecycleChange: toSqliteBool(lifecycle),
    ...(clusterRecordToRow(snapshot.record) as Record<string, string | number | null>),
  });
}

/** Appends history rows - one INSERT per snapshot, never a read-all-rewrite-all (see design.md Decisions 2 and 7). */
export async function appendHistory(snapshots: ClusterSnapshot[]): Promise<void> {
  if (snapshots.length === 0) return;
  const db = getDb();
  db.exec("BEGIN");
  try {
    for (const snapshot of snapshots) insertHistoryRow(db, snapshot);
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

/**
 * Single-record gated append for call sites outside the sync cycle (which
 * batches many records through `historyEntriesDiffer` itself before one
 * combined `appendHistory` call - see sync.ts). `prior` is the live record
 * as it was immediately before this mutation; `null` means "not previously
 * known" and always appends, same as a newly-discovered cluster during sync.
 * Computes `isLifecycleChange` here, at write time, from the `prior`/`next`
 * already in hand - see cluster-history-ui spec "Cross-cluster lifecycle
 * audit log".
 */
export async function appendHistoryIfChanged(
  prior: ClusterRecord | null,
  next: ClusterRecord,
  trigger: HistoryTrigger,
  takenAt: string,
): Promise<void> {
  if (prior && !historyEntriesDiffer(prior, next)) return;
  const lifecycle = isLifecycleChange(computeFieldChanges(prior, next), trigger);
  await appendHistory([{ clusterId: next.clusterId, takenAt, record: next, trigger, isLifecycleChange: lifecycle }]);
}

export async function readHistory(): Promise<ClusterSnapshot[]> {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM history").all() as ClusterRow[];
  return rows.map(historyRowToSnapshot);
}

/** One cluster's history, oldest first - an indexed `WHERE clusterId = ?` query instead of filtering the full table in JS (see design.md Decision 6/point 6 and cluster-history-ui's per-cluster timeline). */
export async function getClusterHistoryEntries(clusterId: string): Promise<ClusterSnapshot[]> {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM history WHERE clusterId = ? ORDER BY takenAtMs ASC").all(clusterId) as ClusterRow[];
  return rows.map(historyRowToSnapshot);
}

/** Every history entry already classified as a lifecycle change at write time, most recent first - the indexed query that replaces getLifecycleAuditLog()'s old full-table scan/group/diff (see design.md Decision 7). */
export async function getLifecycleHistoryEntries(): Promise<ClusterSnapshot[]> {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM history WHERE isLifecycleChange = 1 ORDER BY takenAtMs DESC")
    .all() as ClusterRow[];
  return rows.map(historyRowToSnapshot);
}

/** The entry immediately preceding `beforeTakenAt` for a cluster (any entry, not just lifecycle-flagged ones) - used to describe what changed leading into a given lifecycle entry, without loading that cluster's whole history. */
export async function getPreviousHistoryEntry(clusterId: string, beforeTakenAt: string): Promise<ClusterSnapshot | null> {
  const db = getDb();
  const row = previousHistoryRow(db, clusterId, toEpochMs(beforeTakenAt) as number);
  return row ? historyRowToSnapshot(row) : null;
}

/**
 * The most recently stored entry for a cluster, unconditionally (no cutoff) -
 * null if it has no history yet. Used by sync.ts to gate a new append
 * against the same "prior" the per-cluster timeline will actually diff
 * against at read time (see historyFields.ts's HISTORY_FIELDS comment on
 * why the gate and the display must share one notion of prior), instead of
 * the live `clusters` table row, which a concurrent writer (a manual
 * action, a Slack decision, the reconciliation loop) can transiently
 * diverge from mid-cycle in ways that net out to no real change once both
 * writes land - see sync.ts's own comment at its call site.
 */
export async function getLatestHistoryEntry(clusterId: string): Promise<ClusterSnapshot | null> {
  const db = getDb();
  const row = previousHistoryRow(db, clusterId);
  return row ? historyRowToSnapshot(row) : null;
}

/**
 * Trims history snapshots older than the retention window, for every
 * cluster, active or deleted alike - a single indexed DELETE instead of
 * load-everything-filter-rewrite-everything (see design.md Decision 2/point 6).
 */
export async function purgeExpiredHistory(now: Date, retentionDays: number): Promise<{
  purgedSnapshotCount: number;
}> {
  const db = getDb();
  const cutoffMs = now.getTime() - retentionDays * 24 * 60 * 60 * 1000;
  const result = db.prepare("DELETE FROM history WHERE takenAtMs < ?").run(cutoffMs);
  return { purgedSnapshotCount: Number(result.changes) };
}
