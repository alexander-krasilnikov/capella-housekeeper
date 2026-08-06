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
}

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
};
