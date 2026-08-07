import { turnOffCluster, deleteCluster, CapellaApiError } from "./capellaClient";
import { readClusters, upsertClusters, removeClusters, appendHistory } from "./store";
import { readSettings } from "./settings";
import { supersedeLiveMessage } from "./notifications";
import type { ClusterRecord, Settings } from "../types";

export interface ManualActionResult {
  ok: boolean;
  message: string;
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
  const org = settings.capellaOrgs.find((o) => o.orgId === record.orgId)!;

  await supersedeLiveMessage(record, settings, `Superseded by a manual turn-off of *${record.clusterName}*.`);

  try {
    await turnOffCluster(org, settings.capellaApiBaseUrl, record.projectId, clusterId);
  } catch (err) {
    if (!(err instanceof CapellaApiError)) throw err;
    return { ok: false, message: `Couldn't turn off ${record.clusterName}: ${err.message}` };
  }

  const fresh = (await readClusters()).find((c) => c.clusterId === clusterId);
  if (fresh) {
    fresh.config = { ...fresh.config, status: "turnedOff" };
    await upsertClusters([fresh]);
  }

  return { ok: true, message: `Turned off ${record.clusterName}.` };
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
  const org = settings.capellaOrgs.find((o) => o.orgId === record.orgId)!;

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
    await appendHistory([{ clusterId, takenAt: now, record: { ...fresh, deletedAt: now, lastSyncedAt: now } }]);
    await removeClusters([clusterId]);
  }

  return { ok: true, message: `Deleted ${record.clusterName}.` };
}
