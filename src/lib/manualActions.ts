import { turnOffCluster, turnOnCluster, deleteCluster, CapellaApiError } from "./capellaClient";
import { readClusters, upsertClusters, removeClusters, appendHistoryIfChanged } from "./store";
import { readSettings } from "./settings";
import { supersedeLiveMessage } from "./notifications";
import type { ClusterRecord, OrgConfig, Settings } from "../types";

export interface ManualActionResult {
  ok: boolean;
  message: string;
}

/**
 * Picks the exact `OrgConfig` (API key) that saw this cluster during sync,
 * via `orgConfigId` - `orgId` alone is ambiguous once more than one
 * project-scoped key shares an org (each `capellaOrgs` entry then has the
 * same `orgId`), and picking the wrong one 403s against Capella instead of
 * acting on the cluster. Falls back to an `orgId` match for records synced
 * before `orgConfigId` existed; self-heals once the next sync repopulates
 * it, and is only ambiguous in that window if `orgId` genuinely has more
 * than one configured entry.
 */
export function resolveOrgConfig(record: ClusterRecord, settings: Settings): OrgConfig {
  return (
    settings.capellaOrgs.find((o) => o.id === record.orgConfigId) ??
    settings.capellaOrgs.find((o) => o.orgId === record.orgId)!
  );
}

async function resolveClusterAndOrg(
  clusterId: string,
): Promise<
  | { ok: true; record: ClusterRecord; settings: Settings }
  | { ok: false; result: ManualActionResult }
> {
  const [clusters, settings] = await Promise.all([readClusters(), readSettings()]);
  const record = clusters.find((c) => c.clusterId === clusterId);
  if (!record) return { ok: false, result: { ok: false, message: "Cluster not found." } };
  if (!settings.capellaOrgs.some((org) => org.orgId === record.orgId)) {
    return {
      ok: false,
      result: { ok: false, message: `${record.orgId} is no longer configured in Settings.` },
    };
  }
  return { ok: true, record, settings };
}

/**
 * Turns a cluster off directly, immediately, independent of the
 * owner-consent workflow - see the manual-cluster-actions spec. Re-reads
 * the record fresh before writing back its own field only, same
 * clobber-avoidance discipline as reconciliation.ts's applyActionOutcome,
 * since the Capella write below can take up to 120s.
 */
export async function manualTurnOff(clusterId: string): Promise<ManualActionResult> {
  const resolved = await resolveClusterAndOrg(clusterId);
  if (!resolved.ok) return resolved.result;
  const { record, settings } = resolved;
  const org = resolveOrgConfig(record, settings);

  await supersedeLiveMessage(record, settings, `Superseded by a manual turn-off of *${record.clusterName}*.`);

  try {
    await turnOffCluster(org, settings.capellaApiBaseUrl, record.projectId, clusterId);
  } catch (err) {
    if (!(err instanceof CapellaApiError)) throw err;
    return { ok: false, message: `Couldn't turn off ${record.clusterName}: ${err.message}` };
  }

  const fresh = (await readClusters()).find((c) => c.clusterId === clusterId);
  if (fresh) {
    const prior = { ...fresh };
    fresh.config = { ...fresh.config, status: "turnedOff" };
    await upsertClusters([fresh]);
    await appendHistoryIfChanged(prior, fresh, "manual-turn-off", new Date().toISOString());
  }

  return { ok: true, message: `Turned off ${record.clusterName}.` };
}

/**
 * Turns a cluster back on directly, immediately, independent of the
 * owner-consent workflow - only reachable while the developer-options
 * "manual cluster turn-on" toggle is enabled (see manual-cluster-actions
 * spec); callers are responsible for that gate, same as the UI-level
 * disabled-when-inapplicable checks. Same re-read-fresh-before-writing and
 * supersede-live-message discipline as manualTurnOff above.
 */
export async function manualTurnOn(clusterId: string): Promise<ManualActionResult> {
  const resolved = await resolveClusterAndOrg(clusterId);
  if (!resolved.ok) return resolved.result;
  const { record, settings } = resolved;
  const org = resolveOrgConfig(record, settings);

  await supersedeLiveMessage(record, settings, `Superseded by a manual turn-on of *${record.clusterName}*.`);

  try {
    await turnOnCluster(org, settings.capellaApiBaseUrl, record.projectId, clusterId);
  } catch (err) {
    if (!(err instanceof CapellaApiError)) throw err;
    return { ok: false, message: `Couldn't turn on ${record.clusterName}: ${err.message}` };
  }

  const fresh = (await readClusters()).find((c) => c.clusterId === clusterId);
  if (fresh) {
    const prior = { ...fresh };
    fresh.config = { ...fresh.config, status: "healthy" };
    await upsertClusters([fresh]);
    await appendHistoryIfChanged(prior, fresh, "manual-turn-on", new Date().toISOString());
  }

  return { ok: true, message: `Turned on ${record.clusterName}.` };
}

/**
 * Deletes a cluster directly, immediately, independent of the
 * owner-consent workflow - see the manual-cluster-actions spec. Same
 * re-read-fresh-before-writing discipline as manualTurnOff above.
 */
export async function manualDelete(clusterId: string): Promise<ManualActionResult> {
  const resolved = await resolveClusterAndOrg(clusterId);
  if (!resolved.ok) return resolved.result;
  const { record, settings } = resolved;
  const org = resolveOrgConfig(record, settings);

  await supersedeLiveMessage(record, settings, `Superseded by a manual delete of *${record.clusterName}*.`);

  try {
    await deleteCluster(org, settings.capellaApiBaseUrl, record.projectId, clusterId);
  } catch (err) {
    if (!(err instanceof CapellaApiError)) throw err;
    return { ok: false, message: `Couldn't delete ${record.clusterName}: ${err.message}` };
  }

  const fresh = (await readClusters()).find((c) => c.clusterId === clusterId);
  if (fresh) {
    const now = new Date().toISOString();
    const deleted = { ...fresh, deletedAt: now, lastSyncedAt: now };
    await appendHistoryIfChanged(fresh, deleted, "manual-delete", now);
    await removeClusters([clusterId]);
  }

  return { ok: true, message: `Deleted ${record.clusterName}.` };
}
