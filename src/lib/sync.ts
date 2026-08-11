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
  removeClusters,
  appendHistory,
  purgeExpiredHistory,
  historyEntriesDiffer,
} from "./store";
import { readSettings } from "./settings";
import { applyConsentNotifications } from "./notifications";
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
  apiBaseUrl: string,
  clusterId: string,
): Promise<ResolvedActivity | null> {
  let events: ActivityLogEvent[];
  try {
    events = await getActivityLog(org, apiBaseUrl, clusterId);
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
  apiBaseUrl: string,
  createdBy: string | undefined,
  existingOwnerDerived: string | null,
  userDisplayNameCache: Map<string, string>,
): Promise<string | null> {
  if (!createdBy) return existingOwnerDerived;

  const cached = userDisplayNameCache.get(createdBy);
  if (cached) return cached;

  try {
    const user = await getUser(org, apiBaseUrl, createdBy);
    const display = user.email ?? user.name ?? createdBy;
    userDisplayNameCache.set(createdBy, display);
    return display;
  } catch (err) {
    if (!(err instanceof CapellaApiError)) throw err;
    userDisplayNameCache.set(createdBy, createdBy);
    return createdBy;
  }
}

/**
 * Every field the Slack bot (button clicks) or the reconciliation loop can
 * write to, independently of a sync cycle. Used to detect whether *this*
 * cycle actually changed a cluster's consent state, or is just carrying
 * forward a stale snapshot from before a slow cycle started - see the
 * guard around the final upsertClusters call below.
 */
function consentFieldsEqual(a: ClusterRecord, b: ClusterRecord): boolean {
  return (
    a.lastNotifiedAgeStatus === b.lastNotifiedAgeStatus &&
    a.consentStatus === b.consentStatus &&
    a.consentCycleStartedAt === b.consentCycleStartedAt &&
    a.remindersSent === b.remindersSent &&
    a.consentTierAtDecision === b.consentTierAtDecision &&
    a.actionOutcome === b.actionOutcome &&
    a.slackChannelId === b.slackChannelId &&
    a.slackMessageTs === b.slackMessageTs &&
    a.snoozeUntil === b.snoozeUntil &&
    a.snoozeJustification === b.snoozeJustification
  );
}

function adoptConsentFields(record: ClusterRecord, source: ClusterRecord): void {
  record.lastNotifiedAgeStatus = source.lastNotifiedAgeStatus;
  record.consentStatus = source.consentStatus;
  record.consentCycleStartedAt = source.consentCycleStartedAt;
  record.remindersSent = source.remindersSent;
  record.consentTierAtDecision = source.consentTierAtDecision;
  record.actionOutcome = source.actionOutcome;
  record.slackChannelId = source.slackChannelId;
  record.slackMessageTs = source.slackMessageTs;
  record.snoozeUntil = source.snoozeUntil;
  record.snoozeJustification = source.snoozeJustification;
}

export interface SyncResult {
  syncedClusters: number;
  orgsSynced: number;
  /** Clusters no longer returned by Capella this cycle - each got a final history snapshot and was removed from the live store outright, not tombstoned in place. */
  removedClusterIds: string[];
  /** Orgs skipped (in full or in part) this cycle due to an API failure - their existing records are left untouched. */
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
  const settings = await readSettings();
  const orgs = settings.capellaOrgs;
  const apiBaseUrl = settings.capellaApiBaseUrl;
  const existingClusters = await readClusters();
  const existingById = new Map(existingClusters.map((c) => [c.clusterId, c]));

  const seenClusterIds = new Set<string>();
  const seenOrgIds = new Set<string>();
  const failedOrgIds: string[] = [];
  const records: ClusterRecord[] = [];
  const snapshots: ClusterSnapshot[] = [];
  const nowMs = Date.now();
  const now = new Date(nowMs).toISOString();
  const userDisplayNameCache = new Map<string, string>();

  for (const org of orgs) {
    let orgName = org.orgName ?? org.orgId;
    try {
      const orgInfo = await getOrganization(org, apiBaseUrl);
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
      projects = await listProjects(org, apiBaseUrl);
    } catch (err) {
      if (!(err instanceof CapellaApiError)) throw err;
      console.error(`[sync] org ${org.orgId}: failed to list projects, skipping this cycle:`, err.message);
      failedOrgIds.push(org.orgId);
      continue;
    }

    for (const project of projects) {
      let clusters: CapellaClusterConfig[];
      try {
        clusters = await listClusters(org, apiBaseUrl, project.id);
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
          apiBaseUrl,
          raw.audit?.createdBy,
          existing?.ownerDerived ?? null,
          userDisplayNameCache,
        );

        const resolvedActivity =
          (await resolveActivityFromLog(org, apiBaseUrl, raw.id)) ??
          (raw.audit?.modifiedAt
            ? { lastActivityAt: raw.audit.modifiedAt, lastActivitySource: "sync-observed" as const }
            : resolveActivityFromSyncObservation(createdAt, fp, existing, now));

        const billing = await getBillingUsage(org, apiBaseUrl, project.id, raw.id);

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
          // Carried forward from the prior sync, not re-derived here -
          // applyConsentNotifications (below) is the only thing that
          // advances these, based on the *previous* cycle's values.
          lastNotifiedAgeStatus: existing?.lastNotifiedAgeStatus ?? null,
          consentStatus: existing?.consentStatus ?? "none",
          consentCycleStartedAt: existing?.consentCycleStartedAt ?? null,
          remindersSent: existing?.remindersSent ?? 0,
          consentTierAtDecision: existing?.consentTierAtDecision ?? null,
          actionOutcome: existing?.actionOutcome ?? "none",
          slackChannelId: existing?.slackChannelId ?? null,
          slackMessageTs: existing?.slackMessageTs ?? null,
          snoozeUntil: existing?.snoozeUntil ?? null,
          snoozeJustification: existing?.snoozeJustification ?? null,
        };

        records.push(record);
        snapshots.push({ clusterId: record.clusterId, takenAt: now, record, trigger: "sync" });
      }
    }

    if (orgFullySynced) {
      seenOrgIds.add(org.orgId);
    } else {
      failedOrgIds.push(org.orgId);
    }
  }

  // A cluster no longer returned for a project we just fully synced is
  // gone - collected here by ID only; its final history snapshot (below)
  // and removal from the live store happen once the freshest available
  // copy of each is known. Deliberately not gated on `existing.deletedAt`:
  // a record already tombstoned from before this change is swept up the
  // same way, one time, instead of staying stuck in the live store forever.
  const removedClusterIds: string[] = [];
  for (const existing of existingClusters) {
    if (!seenOrgIds.has(existing.orgId)) continue;
    if (seenClusterIds.has(existing.clusterId)) continue;
    removedClusterIds.push(existing.clusterId);
  }

  await applyConsentNotifications(records, settings, nowMs);

  // This cycle's `records` carry consent fields forward from the
  // existingById snapshot taken at the very top of this function, before a
  // long sequence of awaited Capella API calls. If a Slack button click
  // (or the reconciliation loop) wrote a real decision to disk while this
  // cycle was still running, that snapshot is now stale for this cluster -
  // blindly upserting `records` would silently revert it back to whatever
  // it was before the click. So: re-read the current on-disk state right
  // before writing, and for any cluster whose consent fields *this cycle
  // left untouched* (equal to what it started with), defer to what's
  // actually on disk now instead of the stale snapshot. A cluster this
  // cycle's applyConsentNotifications genuinely changed keeps that change -
  // it's a real decision made with fresh data, not a stale carry-forward.
  const freshExisting = new Map((await readClusters()).map((c) => [c.clusterId, c]));
  for (const record of records) {
    const before = existingById.get(record.clusterId);
    if (!before || !consentFieldsEqual(record, before)) continue;
    const fresh = freshExisting.get(record.clusterId);
    if (fresh) adoptConsentFields(record, fresh);
  }

  // One final history snapshot per removed cluster, built from the
  // freshest available copy - the same clobber-avoidance reason the
  // reconciliation above re-reads before adopting: a Slack click or manual
  // action could have changed the record after this cycle's initial read.
  // Reuses an already-set `deletedAt` (a pre-existing tombstone being swept
  // up) rather than overwriting it with this cycle's time.
  for (const clusterId of removedClusterIds) {
    const fresh = freshExisting.get(clusterId) ?? existingById.get(clusterId);
    if (!fresh) continue;
    const deletedAt = fresh.deletedAt ?? now;
    snapshots.push({
      clusterId,
      takenAt: now,
      record: { ...fresh, deletedAt, lastSyncedAt: now },
      trigger: "sync",
    });
  }

  // Gated against the freshest available prior state (freshExisting, falling
  // back to the top-of-cycle existingById for a brand-new cluster that isn't
  // in either), not blindly appended - see cluster-sync spec "Cluster record
  // persistence" and design.md's note on why this must be freshExisting: a
  // Slack click or reconciliation outcome landing mid-cycle already wrote its
  // own history entry the moment it happened, and gating against the stale
  // existingById snapshot here would silently duplicate it.
  const changedSnapshots = snapshots.filter((snapshot) => {
    const prior = freshExisting.get(snapshot.clusterId) ?? existingById.get(snapshot.clusterId) ?? null;
    return !prior || historyEntriesDiffer(prior, snapshot.record);
  });

  await upsertClusters(records);
  await removeClusters(removedClusterIds);
  await appendHistory(changedSnapshots);
  await purgeExpiredHistory(new Date(now), settings.retentionDays);

  return {
    syncedClusters: records.length,
    orgsSynced: orgs.length - failedOrgIds.length,
    removedClusterIds,
    failedOrgIds,
  };
}
