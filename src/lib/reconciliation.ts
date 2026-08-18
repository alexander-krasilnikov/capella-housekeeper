import { turnOffCluster, deleteCluster, CapellaApiError, TRANSITIONAL_STATUS } from "./capellaClient";
import { readClusters, getCluster, upsertClusters, appendHistoryIfChanged } from "./store";
import { readSettings } from "./settings";
import { computeRecordRecency } from "./notifications";
import { resolveOrgConfig } from "./manualActions";
import { updateMessage } from "./slack";
import type { ConsentActionOutcome, ConsentStatus, Settings } from "../types";

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
 * Identifies which live Slack message (if any) to edit with the outcome,
 * captured from the record *before* the (possibly up-to-120s) Capella write
 * began - not re-derived from the post-write "fresh" record. A concurrent
 * sync cycle can send a whole new, unrelated consent request for the same
 * cluster while that write is in flight, overwriting slackChannelId/
 * slackMessageTs - editing *that* new message with this decision's outcome
 * would clobber a pending ask the owner still needs to answer. Using the
 * pre-write snapshot means the outcome always lands on the message tied to
 * the decision that actually caused it, whether or not the record has since
 * moved on.
 */
interface NotifyTarget {
  clusterName: string;
  consentStatus: ConsentStatus;
  slackChannelId: string | null;
  slackMessageTs: string | null;
}

/**
 * Writes `actionOutcome` (and `workflowNote`), re-reading the cluster fresh
 * right before the write rather than upserting the whole record this pass
 * started with. turnOffCluster/deleteCluster can take up to 120s (see
 * capellaClient.ts); writing back the caller's full in-memory snapshot after
 * a wait that long would silently clobber any other field (including
 * consent state) changed elsewhere - by a sync cycle or a Slack click -
 * during that window. Same principle as sync.ts's guard around its own
 * final upsertClusters call. `notifyTarget` is passed through rather than
 * read off `fresh` - see its own comment. The Slack edit isn't awaited - its
 * own failure is already discarded and its result unused, so blocking the
 * reconciliation loop's next cluster on a Slack round trip buys nothing.
 *
 * `status`, when given, is written onto `config.status` alongside the
 * outcome - Capella's own in-progress state for the action just performed
 * (see capellaClient.ts's TRANSITIONAL_STATUS), not an assumed terminal
 * state, since the Capella call's success only confirms it was accepted,
 * not that the transition has finished. Only ever passed for a "performed"
 * outcome - a skipped or failed pass leaves `config.status` untouched, per
 * cluster-lifecycle-actions spec.
 *
 * `note`, when given, is written to `workflowNote` - the re-verification
 * reason for a skip, or the underlying Capella error for a failure - per
 * cluster-lifecycle-actions spec's persisted-explanation requirement.
 * Omitted (cleared to null) for a "performed" outcome, which needs no
 * explanation.
 */
async function applyActionOutcome(
  clusterId: string,
  outcome: ConsentActionOutcome,
  settings: Settings,
  notifyTarget: NotifyTarget,
  status?: string,
  note?: string,
): Promise<void> {
  const fresh = await getCluster(clusterId);
  if (!fresh) return;
  const prior = { ...fresh };
  fresh.actionOutcome = outcome;
  fresh.workflowNote = note ?? null;
  if (status !== undefined) fresh.config = { ...fresh.config, status };
  await upsertClusters([fresh]);
  await appendHistoryIfChanged(prior, fresh, "reconciliation", new Date().toISOString());
  void notifyActionOutcome(notifyTarget, outcome, settings);
}

/**
 * Tells the cluster's owner what actually happened once an approved action
 * resolves - performed, skipped (re-verification found it no longer
 * warranted it), or failed (will retry) - regardless of whether the
 * original decision was an owner's Slack click or a system-triggered auto
 * turn-off. Edits the same live message in place, same as every other
 * consent-lifecycle update, using whatever channel/message `target`
 * identifies. Silently does nothing if there's no live message to update
 * (already superseded by other activity) or Slack isn't configured - see
 * "Owner is notified once an approved action resolves" in the
 * cluster-lifecycle-actions spec.
 */
async function notifyActionOutcome(target: NotifyTarget, outcome: ConsentActionOutcome, settings: Settings): Promise<void> {
  if (!target.slackChannelId || !target.slackMessageTs || !settings.slackBotToken) return;
  const action = target.consentStatus === "approved-delete" ? "delete" : "turn off";
  const text =
    outcome === "performed"
      ? `*${target.clusterName}*: Done - ${target.consentStatus === "approved-delete" ? "deleted" : "turned off"}.`
      : outcome === "skipped"
        ? `*${target.clusterName}*: No action taken - the cluster became active again before we acted.`
        : `*${target.clusterName}*: Couldn't ${action} - will retry.`;
  await updateMessage(settings.slackBotToken, target.slackChannelId, target.slackMessageTs, text).catch(
    () => undefined,
  );
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

  const result: ReconciliationResult = { performed: 0, skipped: 0, failed: 0 };

  for (const record of clusters) {
    // "performed"/"skipped" are terminal for this consent cycle; "failed"
    // stays eligible so a transient Capella error gets retried on a later
    // pass, per the cluster-lifecycle-actions spec.
    if (record.actionOutcome === "performed" || record.actionOutcome === "skipped") continue;
    if (record.consentStatus !== "approved-turnoff" && record.consentStatus !== "approved-delete") continue;

    // Captured now, before any write - see NotifyTarget's own comment.
    const notifyTarget: NotifyTarget = {
      clusterName: record.clusterName,
      consentStatus: record.consentStatus,
      slackChannelId: record.slackChannelId,
      slackMessageTs: record.slackMessageTs,
    };

    const currentTier = computeRecordRecency(record, settings, nowMs);
    if (currentTier !== record.consentTierAtDecision) {
      result.skipped += 1;
      await applyActionOutcome(
        record.clusterId,
        "skipped",
        settings,
        notifyTarget,
        undefined,
        "the cluster no longer warranted the action by the time of re-verification",
      );
      continue;
    }

    // Same resolution policy as manual actions (manualActions.ts's
    // resolveOrgConfig) - kept as one shared function so the two paths can
    // never resolve credentials differently for the same record.
    const org = resolveOrgConfig(record, settings);
    if (!org) {
      // Org removed from settings since consent was granted - nothing to
      // authenticate the write with, and it won't reappear on retry.
      result.failed += 1;
      await applyActionOutcome(
        record.clusterId,
        "failed",
        settings,
        notifyTarget,
        undefined,
        `${record.orgId} is no longer configured in Settings.`,
      );
      continue;
    }

    try {
      if (record.consentStatus === "approved-turnoff") {
        await turnOffCluster(org, settings.capellaApiBaseUrl, record.projectId, record.clusterId);
      } else {
        await deleteCluster(org, settings.capellaApiBaseUrl, record.projectId, record.clusterId);
      }
      result.performed += 1;
      const inProgressStatus =
        record.consentStatus === "approved-turnoff" ? TRANSITIONAL_STATUS.turningOff : TRANSITIONAL_STATUS.destroying;
      await applyActionOutcome(record.clusterId, "performed", settings, notifyTarget, inProgressStatus);
    } catch (err) {
      if (!(err instanceof CapellaApiError)) throw err;
      result.failed += 1;
      await applyActionOutcome(record.clusterId, "failed", settings, notifyTarget, undefined, err.message);
    }
  }

  return result;
}
