import crypto from "node:crypto";
import {
  listProjects,
  listClusters,
  getOrganization,
  getUser,
  getActivityLog,
  getBillingUsage,
  CapellaApiError,
  type CapellaClusterConfig,
  type CapellaProject,
  type ActivityLogEvent,
} from "./capellaClient";
import {
  readClusters,
  upsertClusters,
  appendHistory,
  purgeExpiredTombstones,
} from "./store";
import { loadOrgConfigs } from "../config";
import type {
  ClusterRecord,
  ClusterSnapshot,
  ClusterConfig,
  LastActivitySource,
} from "../types";

function toClusterConfig(raw: CapellaClusterConfig): ClusterConfig {
  const group = raw.serviceGroups?.[0];
  return {
    cloudProvider: raw.cloudProvider?.type ?? "unknown",
    region: raw.cloudProvider?.region ?? "unknown",
    couchbaseVersion: raw.couchbaseServer?.version,
    nodeCount: group?.numOfNodes ?? 0,
    nodeSpec: {
      compute: {
        cpu: group?.node.compute.cpu ?? 0,
        ram: group?.node.compute.ram ?? 0,
      },
      storage: group?.node.disk
        ? {
            type: group.node.disk.type,
            sizeGb: group.node.disk.storage,
            iops: group.node.disk.iops,
          }
        : undefined,
    },
    status: raw.currentState,
  };
}

function fingerprint(clusterConfig: ClusterConfig): string {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(clusterConfig))
    .digest("hex");
}

interface ResolvedActivity {
  lastActivityAt: string | null;
  lastActivitySource: LastActivitySource;
}

/** Tries the Activity Log; treats any failure as "not reachable" (e.g. insufficient key role). */
async function resolveActivityFromLog(
  org: Parameters<typeof getActivityLog>[0],
  clusterId: string,
): Promise<ResolvedActivity | null> {
  let events: ActivityLogEvent[];
  try {
    events = await getActivityLog(org, clusterId);
  } catch (err) {
    if (err instanceof CapellaApiError) return null;
    throw err;
  }
  if (events.length === 0) return null;

  // Already sorted timestamp descending, one result - see getActivityLog.
  return { lastActivityAt: events[0].timestamp, lastActivitySource: "activity-log" };
}

/** Falls back to detecting config/state changes across sync cycles when neither the Activity Log nor audit.modifiedAt is available. */
function resolveActivityFromSyncObservation(
  createdAt: string,
  fingerprintValue: string,
  existing: ClusterRecord | null,
  now: string,
): ResolvedActivity {
  if (!existing) {
    return { lastActivityAt: createdAt, lastActivitySource: "sync-observed" };
  }
  const changed = existing.lastObservedFingerprint !== fingerprintValue;
  return {
    lastActivityAt: changed ? now : existing.lastActivityAt,
    lastActivitySource: changed ? "sync-observed" : existing.lastActivitySource,
  };
}

/**
 * Resolves a cluster's owner from its creation event's user ID (a UUID,
 * not a display name), resolved to an email via the Users API and cached
 * per sync cycle since the same person often creates many clusters. Falls
 * back to the raw ID if resolution fails, and to whatever was previously
 * stored if there's no createdBy on this response at all.
 */
async function resolveOwner(
  org: Parameters<typeof getUser>[0],
  createdBy: string | undefined,
  existingOwnerDerived: string | null,
  userDisplayNameCache: Map<string, string>,
): Promise<string | null> {
  if (!createdBy) return existingOwnerDerived;

  const cached = userDisplayNameCache.get(createdBy);
  if (cached) return cached;

  try {
    const user = await getUser(org, createdBy);
    const display = user.email ?? user.name ?? createdBy;
    userDisplayNameCache.set(createdBy, display);
    return display;
  } catch (err) {
    if (!(err instanceof CapellaApiError)) throw err;
    userDisplayNameCache.set(createdBy, createdBy);
    return createdBy;
  }
}

export interface SyncResult {
  syncedClusters: number;
  orgsSynced: number;
  purgedClusterIds: string[];
  /** Orgs skipped (in full or in part) this cycle due to an API failure - their existing records are left untouched rather than tombstoned. */
  failedOrgIds: string[];
}

let cycleInFlight: Promise<SyncResult> | null = null;

/**
 * Serializes concurrent callers onto the same in-flight cycle instead of
 * letting two independent read-modify-write passes race over the JSON
 * store - the scheduler's interval tick and a user-triggered refreshAction
 * can otherwise overlap, with whichever cycle's upsertClusters call lands
 * last silently winning with a stale snapshot.
 */
export function runSyncCycle(): Promise<SyncResult> {
  if (!cycleInFlight) {
    cycleInFlight = runSyncCycleUnguarded().finally(() => {
      cycleInFlight = null;
    });
  }
  return cycleInFlight;
}

async function runSyncCycleUnguarded(): Promise<SyncResult> {
  const orgs = loadOrgConfigs();
  const existingClusters = await readClusters();
  const existingById = new Map(existingClusters.map((c) => [c.clusterId, c]));

  const seenClusterIds = new Set<string>();
  const seenOrgIds = new Set<string>();
  const failedOrgIds: string[] = [];
  const records: ClusterRecord[] = [];
  const snapshots: ClusterSnapshot[] = [];
  const now = new Date().toISOString();
  const userDisplayNameCache = new Map<string, string>();

  for (const org of orgs) {
    let orgName = org.orgName ?? org.orgId;
    try {
      const orgInfo = await getOrganization(org);
      if (orgInfo.name) orgName = orgInfo.name;
    } catch (err) {
      if (!(err instanceof CapellaApiError)) throw err;
    }

    // Only mark this org "seen" (i.e. eligible below for tombstoning any of
    // its clusters that no longer show up) once every one of its projects
    // was actually listed - a partial failure must not make clusters we
    // simply failed to re-fetch look like they were deleted from Capella.
    let orgFullySynced = true;

    let projects: CapellaProject[];
    try {
      projects = await listProjects(org);
    } catch (err) {
      if (!(err instanceof CapellaApiError)) throw err;
      console.error(`[sync] org ${org.orgId}: failed to list projects, skipping this cycle:`, err.message);
      failedOrgIds.push(org.orgId);
      continue;
    }

    for (const project of projects) {
      let clusters: CapellaClusterConfig[];
      try {
        clusters = await listClusters(org, project.id);
      } catch (err) {
        if (!(err instanceof CapellaApiError)) throw err;
        console.error(
          `[sync] org ${org.orgId} project ${project.id}: failed to list clusters, skipping:`,
          err.message,
        );
        orgFullySynced = false;
        continue;
      }

      for (const raw of clusters) {
        seenClusterIds.add(raw.id);
        const existing = existingById.get(raw.id) ?? null;
        const clusterConfig = toClusterConfig(raw);
        const fp = fingerprint(clusterConfig);
        const createdAt = raw.audit?.createdAt ?? existing?.createdAt ?? now;

        const ownerDerived = await resolveOwner(
          org,
          raw.audit?.createdBy,
          existing?.ownerDerived ?? null,
          userDisplayNameCache,
        );

        const resolvedActivity =
          (await resolveActivityFromLog(org, raw.id)) ??
          (raw.audit?.modifiedAt
            ? { lastActivityAt: raw.audit.modifiedAt, lastActivitySource: "sync-observed" as const }
            : resolveActivityFromSyncObservation(createdAt, fp, existing, now));

        const billing = await getBillingUsage(org, project.id, raw.id);

        const record: ClusterRecord = {
          clusterId: raw.id,
          clusterName: raw.name,
          orgId: org.orgId,
          orgName,
          projectId: project.id,
          projectName: project.name,
          config: clusterConfig,
          createdAt,
          ownerDerived,
          lastActivityAt: resolvedActivity.lastActivityAt,
          lastActivitySource: resolvedActivity.lastActivitySource,
          actualCost: billing.ok
            ? { amountUsd: billing.amountUsd, asOf: billing.asOf, unavailableReason: undefined }
            : {
                amountUsd: existing?.actualCost.amountUsd ?? null,
                asOf: existing?.actualCost.asOf ?? null,
                unavailableReason: billing.reason,
              },
          deletedAt: null,
          lastSyncedAt: now,
          lastObservedFingerprint: fp,
        };

        records.push(record);
        snapshots.push({ clusterId: record.clusterId, takenAt: now, record });
      }
    }

    if (orgFullySynced) {
      seenOrgIds.add(org.orgId);
    } else {
      failedOrgIds.push(org.orgId);
    }
  }

  // A cluster that was active but no longer appears for a project we just
  // fully synced is treated as deleted - tombstoned, not removed outright.
  for (const existing of existingClusters) {
    if (existing.deletedAt) continue;
    if (!seenOrgIds.has(existing.orgId)) continue;
    if (seenClusterIds.has(existing.clusterId)) continue;
    records.push({ ...existing, deletedAt: now, lastSyncedAt: now });
  }

  await upsertClusters(records);
  await appendHistory(snapshots);
  const { purgedClusterIds } = await purgeExpiredTombstones(new Date(now));

  return {
    syncedClusters: records.length,
    orgsSynced: orgs.length - failedOrgIds.length,
    purgedClusterIds,
    failedOrgIds,
  };
}
