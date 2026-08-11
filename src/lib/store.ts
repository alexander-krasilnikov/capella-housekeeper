import { promises as fs } from "node:fs";
import path from "node:path";
import type { ClusterRecord, ClusterSnapshot, HistoryTrigger } from "../types";
import { historyEntriesDiffer } from "./historyFields";

export { historyEntriesDiffer } from "./historyFields";

const CLUSTERS_FILE = "clusters.json";
const HISTORY_FILE = "history.json";

/** Not a setting - see design.md in the eliminate-env-config change. */
const DATA_DIR = "./data";

function clustersPath(): string {
  return path.join(DATA_DIR, CLUSTERS_FILE);
}

function historyPath(): string {
  return path.join(DATA_DIR, HISTORY_FILE);
}

async function ensureDataDir(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return fallback;
    }
    throw err;
  }
}

/** Write-then-rename so a crash mid-write never leaves a truncated/corrupt file. */
async function writeJsonFileAtomic(filePath: string, data: unknown): Promise<void> {
  await ensureDataDir();
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), "utf8");
  await fs.rename(tmpPath, filePath);
}

// A single in-process mutex is enough: this app runs as one always-on Node
// process, so the only concurrent writers are within this same process.
let writeQueue: Promise<unknown> = Promise.resolve();

function serialize<T>(fn: () => Promise<T>): Promise<T> {
  const result = writeQueue.then(fn, fn);
  writeQueue = result.catch(() => undefined);
  return result;
}

/** Fills in defaults for consent/notification fields absent on records written before this feature existed - see design.md Migration Plan. */
function withConsentDefaults(record: ClusterRecord): ClusterRecord {
  // The on-disk record may actually be missing these fields despite the
  // static type claiming otherwise (older data pre-dates them) - read
  // through a Partial view so the `??` fallbacks below are meaningful.
  const partial = record as Partial<ClusterRecord>;
  return {
    ...record,
    lastNotifiedAgeStatus: partial.lastNotifiedAgeStatus ?? null,
    consentStatus: partial.consentStatus ?? "none",
    consentCycleStartedAt: partial.consentCycleStartedAt ?? null,
    remindersSent: partial.remindersSent ?? 0,
    consentTierAtDecision: partial.consentTierAtDecision ?? null,
    actionOutcome: partial.actionOutcome ?? "none",
    slackChannelId: partial.slackChannelId ?? null,
    slackMessageTs: partial.slackMessageTs ?? null,
    snoozeUntil: partial.snoozeUntil ?? null,
    snoozeJustification: partial.snoozeJustification ?? null,
  };
}

export async function readClusters(): Promise<ClusterRecord[]> {
  const records = await readJsonFile<ClusterRecord[]>(clustersPath(), []);
  return records.map(withConsentDefaults);
}

/** Entries written before `trigger` existed default to "sync" - the only writer that existed at the time. */
function withHistoryTriggerDefault(snapshot: ClusterSnapshot): ClusterSnapshot {
  return { ...snapshot, trigger: snapshot.trigger ?? "sync" };
}

export async function readHistory(): Promise<ClusterSnapshot[]> {
  const snapshots = await readJsonFile<ClusterSnapshot[]>(historyPath(), []);
  return snapshots.map(withHistoryTriggerDefault);
}

export async function appendHistory(snapshots: ClusterSnapshot[]): Promise<void> {
  if (snapshots.length === 0) return;
  return serialize(async () => {
    const existing = await readJsonFile<ClusterSnapshot[]>(historyPath(), []);
    await writeJsonFileAtomic(historyPath(), [...existing, ...snapshots]);
  });
}

/**
 * Single-record gated append for call sites outside the sync cycle (which
 * batches many records through `historyEntriesDiffer` itself before one
 * combined `appendHistory` call - see sync.ts). `prior` is the live record
 * as it was immediately before this mutation; `null` means "not previously
 * known" and always appends, same as a newly-discovered cluster during sync.
 */
export async function appendHistoryIfChanged(
  prior: ClusterRecord | null,
  next: ClusterRecord,
  trigger: HistoryTrigger,
  takenAt: string,
): Promise<void> {
  if (prior && !historyEntriesDiffer(prior, next)) return;
  await appendHistory([{ clusterId: next.clusterId, takenAt, record: next, trigger }]);
}

/** Merge one org/project sync pass into the flat cross-org collection. */
export async function upsertClusters(incoming: ClusterRecord[]): Promise<void> {
  return serialize(async () => {
    const existing = await readJsonFile<ClusterRecord[]>(clustersPath(), []);
    const byId = new Map(existing.map((c) => [c.clusterId, c]));
    for (const record of incoming) {
      byId.set(record.clusterId, record);
    }
    await writeJsonFileAtomic(clustersPath(), Array.from(byId.values()));
  });
}

/** Removes clusters from the live collection outright - used once a cluster's final state has been captured to history, rather than leaving a tombstone in place. `upsertClusters` only ever merges/overwrites; it has no way to make an entry disappear. */
export async function removeClusters(clusterIds: string[]): Promise<void> {
  if (clusterIds.length === 0) return;
  return serialize(async () => {
    const existing = await readJsonFile<ClusterRecord[]>(clustersPath(), []);
    const toRemove = new Set(clusterIds);
    const kept = existing.filter((c) => !toRemove.has(c.clusterId));
    if (kept.length !== existing.length) {
      await writeJsonFileAtomic(clustersPath(), kept);
    }
  });
}

/**
 * Trims history snapshots older than the retention window, for every
 * cluster, active or deleted alike - without this, an active cluster's
 * history grows by one entry per sync cycle forever, since nothing else
 * ever prunes it. A deleted cluster's final snapshot (see sync.ts/
 * manualActions.ts) ages out the same way as any other, once removed from
 * the live store there's no separate tombstone to purge here anymore.
 */
export async function purgeExpiredHistory(now: Date, retentionDays: number): Promise<{
  purgedSnapshotCount: number;
}> {
  return serialize(async () => {
    const history = await readJsonFile<ClusterSnapshot[]>(historyPath(), []);
    const cutoffMs = retentionDays * 24 * 60 * 60 * 1000;

    const keptHistory = history.filter(
      (h) => now.getTime() - new Date(h.takenAt).getTime() <= cutoffMs,
    );

    if (keptHistory.length !== history.length) {
      await writeJsonFileAtomic(historyPath(), keptHistory);
    }

    return { purgedSnapshotCount: history.length - keptHistory.length };
  });
}
