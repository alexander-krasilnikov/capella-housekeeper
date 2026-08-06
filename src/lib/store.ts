import { promises as fs } from "node:fs";
import path from "node:path";
import type { ClusterRecord, ClusterSnapshot } from "../types";

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

export async function readClusters(): Promise<ClusterRecord[]> {
  return readJsonFile<ClusterRecord[]>(clustersPath(), []);
}

export async function readHistory(): Promise<ClusterSnapshot[]> {
  return readJsonFile<ClusterSnapshot[]>(historyPath(), []);
}

export async function appendHistory(snapshots: ClusterSnapshot[]): Promise<void> {
  if (snapshots.length === 0) return;
  return serialize(async () => {
    const existing = await readJsonFile<ClusterSnapshot[]>(historyPath(), []);
    await writeJsonFileAtomic(historyPath(), [...existing, ...snapshots]);
  });
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

/**
 * Removes tombstoned clusters whose deletedAt is older than the retention
 * window (along with their snapshot history), and separately trims history
 * snapshots older than that same window for every cluster, active or not -
 * without this second part, an active cluster's history grows by one entry
 * per sync cycle forever, since nothing else ever prunes it.
 */
export async function purgeExpiredTombstones(now: Date, retentionDays: number): Promise<{
  purgedClusterIds: string[];
}> {
  return serialize(async () => {
    const [clusters, history] = await Promise.all([
      readJsonFile<ClusterRecord[]>(clustersPath(), []),
      readJsonFile<ClusterSnapshot[]>(historyPath(), []),
    ]);

    const cutoffMs = retentionDays * 24 * 60 * 60 * 1000;
    const purgedClusterIds: string[] = [];

    const keptClusters = clusters.filter((c) => {
      if (!c.deletedAt) return true;
      const age = now.getTime() - new Date(c.deletedAt).getTime();
      if (age > cutoffMs) {
        purgedClusterIds.push(c.clusterId);
        return false;
      }
      return true;
    });

    const purgedSet = new Set(purgedClusterIds);
    const keptHistory = history.filter((h) => {
      if (purgedSet.has(h.clusterId)) return false;
      return now.getTime() - new Date(h.takenAt).getTime() <= cutoffMs;
    });

    if (purgedClusterIds.length > 0) {
      await writeJsonFileAtomic(clustersPath(), keptClusters);
    }
    if (keptHistory.length !== history.length) {
      await writeJsonFileAtomic(historyPath(), keptHistory);
    }

    return { purgedClusterIds };
  });
}
