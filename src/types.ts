export interface OrgConfig {
  orgId: string;
  /** Fallback label if the org name can't be fetched from the API (e.g. transient error). */
  orgName?: string;
  apiKey: string;
}

export interface NodeSpec {
  compute: {
    cpu: number;
    ram: number;
  };
  storage?: {
    type?: string;
    sizeGb?: number;
    iops?: number;
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
  /** When the current consent cycle started, for expiry - null when consentStatus is "none". */
  consentCycleStartedAt: string | null;
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
}

export interface ClusterSnapshot {
  clusterId: string;
  takenAt: string;
  record: ClusterRecord;
}

export interface StoreData {
  clusters: ClusterRecord[];
  history: ClusterSnapshot[];
}

export type AgeStatus = "New" | "Established" | "Stale" | "Forgotten";

export interface TierNotificationConfig {
  notify: boolean;
  askTurnOff: boolean;
  askDelete: boolean;
}

/** "New" clusters are never notification-eligible - too young to be a housekeeping candidate - so it's excluded from configuration entirely rather than merely defaulted off. */
export type NotifiableAgeStatus = Exclude<AgeStatus, "New">;

export type NotificationsByTier = Record<NotifiableAgeStatus, TierNotificationConfig>;

export interface Settings {
  newDays: number;
  staleDays: number;
  forgottenDays: number;
  inactivityGraceDays: number;
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
}

const DEFAULT_TIER_NOTIFICATION_CONFIG: TierNotificationConfig = {
  notify: false,
  askTurnOff: false,
  askDelete: false,
};

const DEFAULT_NOTIFICATIONS_BY_TIER: NotificationsByTier = {
  Established: { ...DEFAULT_TIER_NOTIFICATION_CONFIG },
  Stale: { ...DEFAULT_TIER_NOTIFICATION_CONFIG },
  Forgotten: { ...DEFAULT_TIER_NOTIFICATION_CONFIG },
};

/**
 * Excludes `sessionSecret` deliberately - it must never be a shared static
 * value baked into source (every install needs its own), so it's generated
 * fresh at first-seed time in settings.ts instead of living here.
 */
export const DEFAULT_SETTINGS: Omit<Settings, "sessionSecret"> = {
  newDays: 1,
  staleDays: 2,
  forgottenDays: 3,
  inactivityGraceDays: 1,
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
};
