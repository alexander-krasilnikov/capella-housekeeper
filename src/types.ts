export interface OrgConfig {
  /**
   * Stable identity for this specific credential entry, assigned once
   * (generated client-side for a new row, or backfilled by settings.ts's
   * migration for a pre-existing entry) and never changed thereafter - see
   * ClusterRecord.orgConfigId for why this exists: `orgId` alone isn't
   * unique when multiple project-scoped API keys share one Capella org.
   */
  id: string;
  orgId: string;
  /** Fallback label if the org name can't be fetched from the API (e.g. transient error). */
  orgName?: string;
  /** Fallback label if the project summary can't be fetched - either a single project's name, or "All projects" when the key can see more than one. */
  projectSummary?: string;
  apiKey: string;
}

export interface NodeSpec {
  compute: {
    cpu: number;
    ram: number;
  };
}

export interface ClusterConfig {
  cloudProvider: string;
  region: string;
  couchbaseVersion?: string;
  nodeCount: number;
  nodeSpec: NodeSpec;
  /** Raw operational state from the Capella API (e.g. running vs. turned off), or null if unavailable. */
  status: string | null;
}

export type LastActivitySource = "activity-log" | "sync-observed" | "unknown";

export type ConsentStatus =
  | "none"
  | "pending"
  | "approved-turnoff"
  | "approved-delete"
  | "expired"
  | "snoozed";

export type ConsentActionOutcome = "none" | "performed" | "skipped" | "failed";

export interface ClusterRecord {
  clusterId: string;
  clusterName: string;
  orgId: string;
  orgName: string;
  /**
   * Which of settings' (possibly several, same-`orgId`) `capellaOrgs`
   * entries actually saw this cluster during sync - `orgId` alone is
   * ambiguous once more than one project-scoped API key shares an org, so
   * manual/reconciled actions must write back through this exact entry, not
   * re-derive one by `orgId`. Absent (undefined) for records synced before
   * this field existed; self-heals on the next sync cycle.
   */
  orgConfigId?: string;
  projectId: string;
  projectName: string;

  config: ClusterConfig;
  createdAt: string;

  ownerDerived: string | null;

  lastActivityAt: string | null;
  lastActivitySource: LastActivitySource;

  actualCost: {
    amountUsd: number | null;
    asOf: string | null;
    /** Why amountUsd is null - absent (undefined) for records synced before this field existed. */
    unavailableReason?: "credits-based" | "no-access" | "error";
  };

  deletedAt: string | null;

  lastSyncedAt: string;
  /** Fingerprint of config used to detect changes when the Activity Log is unavailable. */
  lastObservedFingerprint: string;

  /** Age status as of the last sync cycle - the edge-trigger baseline for the next cycle's transition check, absent (undefined) for records synced before this field existed. */
  lastNotifiedAgeStatus: AgeStatus | null;
  /** Where the current consent cycle (if any) stands - see cluster-consent-notifications spec. */
  consentStatus: ConsentStatus;
  /** When the current consent cycle started, for expiry - null when consentStatus is "none". Anchors reminder/expiry timing only - see consentStatusChangedAt for a general "when did the current status last change" timestamp that doesn't affect that timing. */
  consentCycleStartedAt: string | null;
  /** When `consentStatus` most recently changed, updated on every transition (including ones consentCycleStartedAt doesn't touch, like entering snoozed or expiring) - display-only, for "since when has this been snoozed/approved/expired" in the dashboard/audit log. Never read by reminder/expiry logic. */
  consentStatusChangedAt: string | null;
  /** Reminder re-sends issued so far in the current consent cycle. */
  remindersSent: number;
  /** The age-status tier active when consent was granted - re-checked by the reconciliation loop before acting. */
  consentTierAtDecision: AgeStatus | null;
  /** Whether the reconciliation loop has carried out an approved decision - see cluster-lifecycle-actions spec. */
  actionOutcome: ConsentActionOutcome;
  /** Channel/timestamp of the currently-live Slack message (if any) for this cluster's consent cycle, so a decision or a newer reminder can update it in place. Null when there is no live message. */
  slackChannelId: string | null;
  slackMessageTs: string | null;
  /** When a "snoozed" decision's delay ends - re-prompted after this even without a tier change. Null unless consentStatus is (or was most recently) "snoozed". */
  snoozeUntil: string | null;
  /** Optional free-text reason the owner gave when snoozing - persists (for visibility in the dashboard) until the next tier transition clears the whole consent cycle, not just until the snooze ends. */
  snoozeJustification: string | null;
  /** Snoozes recorded since the last tier transition - deliberately survives a snoozed cycle resuming (unlike remindersSent), so a tier's configured maxSnoozes is enforced across the whole tier, not reset by every individual snooze ending. */
  snoozeCount: number;
  /** Free-text explanation for the current consentStatus/actionOutcome, written only when the *system* (not the owner or an operator) drove the transition - an auto-turnoff's reason, a reconciliation skip's reason, or a Capella failure's error text. Single-valued and system-written: overwritten by the next system-driven transition, cleared (null) by any owner-driven, manual, or reset transition. Null when there's nothing to explain. */
  workflowNote: string | null;
}

/** What caused a history entry to be written - narration-only, see cluster-sync spec "History entries are written at the moment a mutation occurs". */
export type HistoryTrigger =
  | "sync"
  | "manual-turn-off"
  | "manual-delete"
  | "slack-decision"
  | "manual-consent-request"
  | "reconciliation"
  | "manual-turn-on"
  /** A snooze attempt was refused because the tier's configured maxSnoozes was already reached, and auto-turn-off fired immediately instead - see auto-turnoff-on-inaction design.md. The expiry-triggered case of the same auto-turn-off decision is tagged "sync" instead, since it's detected inside the regular sync-cycle batch rather than at an isolated moment like this one. */
  | "auto-turnoff-decision";

export interface ClusterSnapshot {
  clusterId: string;
  takenAt: string;
  record: ClusterRecord;
  /** Absent (undefined) for entries written before this field existed - readHistory() defaults those to "sync", the only writer that existed at the time. */
  trigger?: HistoryTrigger;
  /**
   * Whether this entry counts as a consent/lifecycle change for the audit
   * log - computed once, at write time, from the prior record the writer
   * already has in hand (see historyFields.ts isLifecycleChange). Absent
   * when the caller doesn't know the prior record; appendHistory() then
   * falls back to computing it itself from the immediately-preceding stored
   * row for the same cluster. See cluster-history-ui spec "Cross-cluster
   * lifecycle audit log" for why this is fixed at write time rather than
   * re-evaluated on every read.
   */
  isLifecycleChange?: boolean;
}

export interface StoreData {
  clusters: ClusterRecord[];
  history: ClusterSnapshot[];
}

export type AgeStatus = "In Use" | "Stale" | "Forgotten";

export interface TierNotificationConfig {
  notify: boolean;
  askTurnOff: boolean;
  askDelete: boolean;
  /** Turn the cluster off automatically - as if the owner had approved it - once a pending request expires with no response, or once the owner exhausts maxSnoozes. Only takes effect where askTurnOff is also true and the cluster isn't already off. */
  autoTurnOffOnInaction: boolean;
  /** Snoozes allowed before auto turn-off fires early, instead of waiting for expiry. Only enforced while autoTurnOffOnInaction is true. */
  maxSnoozes: number;
}

/** "In Use" clusters are never notification-eligible - there's nothing to ask about a cluster with evidence of active use - so it's excluded from configuration entirely rather than merely defaulted off. */
export type NotifiableAgeStatus = Exclude<AgeStatus, "In Use">;

export type NotificationsByTier = Record<NotifiableAgeStatus, TierNotificationConfig>;

export interface Settings {
  /** How fresh a cluster's last-known activity (real, or its own creation date standing in when no real signal exists) must be to count as "In Use". */
  activityGraceHours: number;
  /** How long with no evidence of use before a cluster escalates from "Stale" to "Forgotten". */
  forgottenHours: number;
  capellaOrgs: OrgConfig[];
  capellaApiBaseUrl: string;
  syncIntervalHours: number;
  retentionDays: number;
  dashboardUsername: string;
  dashboardPassword: string;
  /** HMAC key for session cookies. Never rendered by the settings UI - see dashboard-settings spec. */
  sessionSecret: string;
  /** Slack bot token (chat:write, users:read.email, and im:write - the last two confirmed necessary by hitting missing_scope on users.lookupByEmail/conversations.open respectively) used to DM cluster owners. Empty string means notifications are off regardless of per-tier config. */
  slackBotToken: string;
  /** Slack app-level token (connections:write scope) used to receive button clicks over Socket Mode. Empty string means clicks can't be received even if slackBotToken is set - notifications won't be sent in that case either, since a click with nowhere to land isn't useful. */
  slackAppToken: string;
  /** Per age-status tier: whether a transition into it notifies, and whether the notification offers a turn-off and/or delete consent ask. */
  notificationsByTier: NotificationsByTier;
  /** Max reminder re-sends for a pending consent request before it expires. */
  consentReminderMax: number;
  /** Days a pending consent request may go unanswered before it expires. */
  consentExpiryDays: number;
  /** Selectable snooze durations (in days) offered in the Slack "Snooze" modal - a non-empty list of distinct positive integers, ascending. */
  snoozeDayOptions: number[];
  /** Developer-options toggle, off by default: whether a manual "Turn on" control is offered for clusters, for use only during the current test period - see manual-cluster-actions spec. */
  developerTurnOnEnabled: boolean;
}

const DEFAULT_TIER_NOTIFICATION_CONFIG: TierNotificationConfig = {
  notify: false,
  askTurnOff: false,
  askDelete: false,
  autoTurnOffOnInaction: false,
  maxSnoozes: 3,
};

const DEFAULT_NOTIFICATIONS_BY_TIER: NotificationsByTier = {
  Stale: { ...DEFAULT_TIER_NOTIFICATION_CONFIG },
  Forgotten: { ...DEFAULT_TIER_NOTIFICATION_CONFIG },
};

/**
 * Excludes `sessionSecret` deliberately - it must never be a shared static
 * value baked into source (every install needs its own), so it's generated
 * fresh at first-seed time in settings.ts instead of living here.
 */
export const DEFAULT_SETTINGS: Omit<Settings, "sessionSecret"> = {
  activityGraceHours: 24,
  forgottenHours: 72,
  capellaOrgs: [],
  capellaApiBaseUrl: "https://cloudapi.cloud.couchbase.com/v4",
  syncIntervalHours: 1,
  retentionDays: 7,
  dashboardUsername: "admin",
  dashboardPassword: "change-me",
  slackBotToken: "",
  slackAppToken: "",
  notificationsByTier: DEFAULT_NOTIFICATIONS_BY_TIER,
  consentReminderMax: 2,
  consentExpiryDays: 7,
  snoozeDayOptions: [1, 2, 3],
  developerTurnOnEnabled: false,
};
