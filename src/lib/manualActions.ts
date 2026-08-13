import { turnOffCluster, turnOnCluster, deleteCluster, CapellaApiError, TRANSITIONAL_STATUS } from "./capellaClient";
import { getCluster, upsertClusters, removeClusters, appendHistoryIfChanged } from "./store";
import { readSettings } from "./settings";
import { supersedeLiveMessage } from "./notifications";
import type { ClusterRecord, HistoryTrigger, OrgConfig, Settings } from "../types";

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
 * than one configured entry. Returns `undefined` if the org has since been
 * removed from Settings entirely - shared by manualActions' own resolution
 * below and reconciliation.ts's, so the two never resolve credentials
 * differently for the same record.
 */
export function resolveOrgConfig(record: ClusterRecord, settings: Settings): OrgConfig | undefined {
  return (
    settings.capellaOrgs.find((o) => o.id === record.orgConfigId) ??
    settings.capellaOrgs.find((o) => o.orgId === record.orgId)
  );
}

async function resolveClusterAndOrg(
  clusterId: string,
): Promise<
  | { ok: true; record: ClusterRecord; settings: Settings; org: OrgConfig }
  | { ok: false; result: ManualActionResult }
> {
  const [record, settings] = await Promise.all([getCluster(clusterId), readSettings()]);
  if (!record) return { ok: false, result: { ok: false, message: "Cluster not found." } };
  const org = resolveOrgConfig(record, settings);
  if (!org) {
    return {
      ok: false,
      result: { ok: false, message: `${record.orgId} is no longer configured in Settings.` },
    };
  }
  return { ok: true, record, settings, org };
}

interface PowerDirectionConfig {
  /**
   * Capella's own in-progress state for this direction (see
   * capellaClient.ts's TRANSITIONAL_STATUS) - written immediately after the
   * Capella call succeeds, not the direction's terminal state, since
   * Capella's 202 response confirms nothing about whether the transition
   * has actually finished. A later sync cycle overwrites this with
   * whatever Capella reports once it has.
   */
  status: string;
  /** Lowercase, for error text - "Couldn't turn on/off ...". */
  verb: string;
  /** Capitalized past tense, for success text - "Turned on/off ...". */
  pastTense: string;
  /** For the "Superseded by a manual ..." message sent to any live Slack request. */
  supersedeNoun: string;
  trigger: HistoryTrigger;
  capellaCall: typeof turnOnCluster;
  /**
   * Whether a successful call resets the whole consent cycle, not just
   * `config.status` - turning a cluster back on can otherwise leave a
   * stale `approved-turnoff`/`approved-delete` decision in place, which the
   * reconciliation loop would then re-verify against age/activity alone
   * (it never looks at power state) and act on again, silently reversing
   * the operator's own turn-on within one reconciliation pass. Turning off
   * has the equivalent problem in the other direction: a pending/snoozed/
   * approved cycle left in place after a manual turn-off keeps reminding
   * (or, for an approved-delete decision, would eventually still delete) a
   * cluster an operator already turned off with no fresh consent behind it -
   * so both directions reset, per manual-cluster-actions spec "Manual
   * turn-off and turn-on clear any active consent cycle."
   */
  resetConsentCycle: boolean;
}

const POWER_DIRECTIONS: Record<"on" | "off", PowerDirectionConfig> = {
  off: {
    status: TRANSITIONAL_STATUS.turningOff,
    verb: "turn off",
    pastTense: "Turned off",
    supersedeNoun: "turn-off",
    trigger: "manual-turn-off",
    capellaCall: turnOffCluster,
    resetConsentCycle: true,
  },
  on: {
    status: TRANSITIONAL_STATUS.turningOn,
    verb: "turn on",
    pastTense: "Turned on",
    supersedeNoun: "turn-on",
    trigger: "manual-turn-on",
    capellaCall: turnOnCluster,
    resetConsentCycle: true,
  },
};

/**
 * Turns a cluster on or off directly, immediately, independent of the
 * owner-consent workflow - see the manual-cluster-actions spec. Re-reads
 * the record fresh before writing back its own fields only, same
 * clobber-avoidance discipline as reconciliation.ts's applyActionOutcome,
 * since the Capella write below can take up to 120s. Turning on is only
 * reachable while the developer-options "manual cluster turn-on" toggle is
 * enabled - enforced here (not just by the UI hiding the button) so the
 * server action itself refuses the call regardless of caller.
 */
async function setClusterPower(clusterId: string, direction: "on" | "off"): Promise<ManualActionResult> {
  const resolved = await resolveClusterAndOrg(clusterId);
  if (!resolved.ok) return resolved.result;
  const { record, settings, org } = resolved;
  const config = POWER_DIRECTIONS[direction];

  if (direction === "on" && !settings.developerTurnOnEnabled) {
    return { ok: false, message: "Manual cluster turn-on is disabled in Settings." };
  }

  await supersedeLiveMessage(
    record,
    settings,
    `Superseded by a manual ${config.supersedeNoun} of *${record.clusterName}*.`,
  );

  try {
    await config.capellaCall(org, settings.capellaApiBaseUrl, record.projectId, clusterId);
  } catch (err) {
    if (!(err instanceof CapellaApiError)) throw err;
    return { ok: false, message: `Couldn't ${config.verb} ${record.clusterName}: ${err.message}` };
  }

  const fresh = await getCluster(clusterId);
  if (fresh) {
    const prior = { ...fresh };
    fresh.config = { ...fresh.config, status: config.status };
    if (config.resetConsentCycle) {
      fresh.consentStatus = "none";
      fresh.consentCycleStartedAt = null;
      fresh.consentStatusChangedAt = new Date().toISOString();
      fresh.workflowNote = null;
      fresh.remindersSent = 0;
      fresh.consentTierAtDecision = null;
      fresh.actionOutcome = "none";
      fresh.slackChannelId = null;
      fresh.slackMessageTs = null;
      fresh.snoozeUntil = null;
      fresh.snoozeJustification = null;
      fresh.snoozeCount = 0;
    }
    await upsertClusters([fresh]);
    await appendHistoryIfChanged(prior, fresh, config.trigger, new Date().toISOString());
  }

  return { ok: true, message: `${config.pastTense} ${record.clusterName}.` };
}

export async function manualTurnOff(clusterId: string): Promise<ManualActionResult> {
  return setClusterPower(clusterId, "off");
}

/** Only reachable while the developer-options "manual cluster turn-on" toggle is enabled - see setClusterPower above. */
export async function manualTurnOn(clusterId: string): Promise<ManualActionResult> {
  return setClusterPower(clusterId, "on");
}

/**
 * Deletes a cluster directly, immediately, independent of the
 * owner-consent workflow - see the manual-cluster-actions spec. Same
 * re-read-fresh-before-writing discipline as setClusterPower above.
 */
export async function manualDelete(clusterId: string): Promise<ManualActionResult> {
  const resolved = await resolveClusterAndOrg(clusterId);
  if (!resolved.ok) return resolved.result;
  const { record, settings, org } = resolved;

  await supersedeLiveMessage(record, settings, `Superseded by a manual delete of *${record.clusterName}*.`);

  try {
    await deleteCluster(org, settings.capellaApiBaseUrl, record.projectId, clusterId);
  } catch (err) {
    if (!(err instanceof CapellaApiError)) throw err;
    return { ok: false, message: `Couldn't delete ${record.clusterName}: ${err.message}` };
  }

  const fresh = await getCluster(clusterId);
  if (fresh) {
    const now = new Date().toISOString();
    const deleted = { ...fresh, deletedAt: now, lastSyncedAt: now };
    await appendHistoryIfChanged(fresh, deleted, "manual-delete", now);
    await removeClusters([clusterId]);
  }

  return { ok: true, message: `Deleted ${record.clusterName}.` };
}
