import { turnOffCluster, deleteCluster, CapellaApiError } from "./capellaClient";
import { readClusters, upsertClusters, appendHistoryIfChanged } from "./store";
import { readSettings } from "./settings";
import { computeRecordAgeStatus } from "./notifications";
import type { ConsentActionOutcome } from "../types";

let started = false;

/**
 * Independent of (and much shorter than) the configurable sync interval -
 * this is the window an approved-but-not-yet-actioned cluster could sit in
 * before its pre-action re-check runs, so it's kept short rather than
 * user-configurable. See design.md "Re-verification is a live re-check."
 */
const RECONCILE_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Starts the reconciliation loop once, in-process - structurally identical
 * to startSyncScheduler (src/lib/scheduler.ts), kept as a separate loop so a
 * slow or failing Capella write call can't delay the read-only sync cycle
 * everything else depends on for fresh data.
 */
export function startReconciliationLoop(): void {
  if (started) return;
  started = true;

  const scheduleNext = async () => {
    try {
      const { performed, skipped, failed } = await runReconciliationPass();
      if (performed || skipped || failed) {
        console.log(
          `[reconciliation] performed ${performed}, skipped ${skipped} (recovered before action), failed ${failed}`,
        );
      }
    } catch (err) {
      console.error("[reconciliation] pass failed:", err);
    }
    setTimeout(scheduleNext, RECONCILE_INTERVAL_MS);
  };

  scheduleNext();
}

export interface ReconciliationResult {
  performed: number;
  skipped: number;
  failed: number;
}

/**
 * Writes only `actionOutcome`, re-reading the cluster fresh right before
 * the write rather than upserting the whole record this pass started with.
 * turnOffCluster/deleteCluster can take up to 120s (see capellaClient.ts);
 * writing back the caller's full in-memory snapshot after a wait that long
 * would silently clobber any other field (including consent state) changed
 * elsewhere - by a sync cycle or a Slack click - during that window. Same
 * principle as sync.ts's guard around its own final upsertClusters call.
 */
async function applyActionOutcome(clusterId: string, outcome: ConsentActionOutcome): Promise<void> {
  const fresh = (await readClusters()).find((c) => c.clusterId === clusterId);
  if (!fresh) return;
  const prior = { ...fresh };
  fresh.actionOutcome = outcome;
  await upsertClusters([fresh]);
  await appendHistoryIfChanged(prior, fresh, "reconciliation", new Date().toISOString());
}

/**
 * Finds clusters with an approved-but-not-yet-actioned consent decision,
 * re-verifies each is still in the tier that triggered the decision, and
 * performs the corresponding Capella action if so. See
 * cluster-lifecycle-actions spec.
 */
export async function runReconciliationPass(): Promise<ReconciliationResult> {
  const [clusters, settings] = await Promise.all([readClusters(), readSettings()]);
  const nowMs = Date.now();
  const orgsById = new Map(settings.capellaOrgs.map((org) => [org.orgId, org]));

  const result: ReconciliationResult = { performed: 0, skipped: 0, failed: 0 };

  for (const record of clusters) {
    // "performed"/"skipped" are terminal for this consent cycle; "failed"
    // stays eligible so a transient Capella error gets retried on a later
    // pass, per the cluster-lifecycle-actions spec.
    if (record.actionOutcome === "performed" || record.actionOutcome === "skipped") continue;
    if (record.consentStatus !== "approved-turnoff" && record.consentStatus !== "approved-delete") continue;

    const currentTier = computeRecordAgeStatus(record, settings, nowMs);
    if (currentTier !== record.consentTierAtDecision) {
      result.skipped += 1;
      await applyActionOutcome(record.clusterId, "skipped");
      continue;
    }

    const org = orgsById.get(record.orgId);
    if (!org) {
      // Org removed from settings since consent was granted - nothing to
      // authenticate the write with, and it won't reappear on retry.
      result.failed += 1;
      await applyActionOutcome(record.clusterId, "failed");
      continue;
    }

    try {
      if (record.consentStatus === "approved-turnoff") {
        await turnOffCluster(org, settings.capellaApiBaseUrl, record.projectId, record.clusterId);
      } else {
        await deleteCluster(org, settings.capellaApiBaseUrl, record.projectId, record.clusterId);
      }
      result.performed += 1;
      await applyActionOutcome(record.clusterId, "performed");
    } catch (err) {
      if (!(err instanceof CapellaApiError)) throw err;
      result.failed += 1;
      await applyActionOutcome(record.clusterId, "failed");
    }
  }

  return result;
}
