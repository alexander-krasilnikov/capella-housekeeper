import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

/** Not a setting - see design.md in the migrate-storage-to-sqlite change. Matches the JSON-era DATA_DIR convention. */
const DATA_DIR = "./data";
const DB_FILE = "store.sqlite3";

export function dbPath(): string {
  return path.join(DATA_DIR, DB_FILE);
}

/**
 * Column set shared verbatim by `clusters` and `history` - see design.md
 * Decision 4: `history` mirrors `clusters` column-for-column (a full typed
 * snapshot per row) plus its own event metadata, rather than a JSON blob.
 * `NodeSpec.compute` is flattened into `nodeCpu`/`nodeRam` (Decision 4);
 * every timestamp is `INTEGER` epoch-milliseconds (Decision 5); every
 * boolean-shaped value is `INTEGER` 0/1 (Decision 6).
 */
const CLUSTER_RECORD_COLUMNS_SQL = `
  clusterId TEXT NOT NULL,
  clusterName TEXT NOT NULL,
  orgId TEXT NOT NULL,
  orgName TEXT NOT NULL,
  orgConfigId TEXT,
  projectId TEXT NOT NULL,
  projectName TEXT NOT NULL,
  cloudProvider TEXT NOT NULL,
  region TEXT NOT NULL,
  couchbaseVersion TEXT,
  nodeCount INTEGER NOT NULL,
  nodeCpu REAL NOT NULL,
  nodeRam REAL NOT NULL,
  status TEXT,
  createdAtMs INTEGER NOT NULL,
  ownerDerived TEXT,
  lastActivityAtMs INTEGER,
  lastActivitySource TEXT NOT NULL,
  actualCostAmountUsd REAL,
  actualCostAsOfMs INTEGER,
  actualCostUnavailableReason TEXT,
  deletedAtMs INTEGER,
  lastSyncedAtMs INTEGER NOT NULL,
  lastObservedFingerprint TEXT NOT NULL,
  lastNotifiedAgeStatus TEXT,
  consentStatus TEXT NOT NULL,
  consentCycleStartedAtMs INTEGER,
  remindersSent INTEGER NOT NULL,
  consentTierAtDecision TEXT,
  actionOutcome TEXT NOT NULL,
  slackChannelId TEXT,
  slackMessageTs TEXT,
  snoozeUntilMs INTEGER,
  snoozeJustification TEXT,
  snoozeCount INTEGER NOT NULL
`;

/** Every column name in `CLUSTER_RECORD_COLUMNS_SQL`, in declaration order - used to build INSERT/UPDATE statements without repeating the list. */
export const CLUSTER_RECORD_COLUMNS = CLUSTER_RECORD_COLUMNS_SQL
  .split(",")
  .map((line) => line.trim().split(/\s+/)[0])
  .filter(Boolean);

const SCHEMA_STATEMENTS = [
  `CREATE TABLE settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    activityGraceHours INTEGER NOT NULL,
    forgottenHours INTEGER NOT NULL,
    capellaApiBaseUrl TEXT NOT NULL,
    syncIntervalHours INTEGER NOT NULL,
    retentionDays INTEGER NOT NULL,
    dashboardUsername TEXT NOT NULL,
    dashboardPassword TEXT NOT NULL,
    sessionSecret TEXT NOT NULL,
    slackBotToken TEXT NOT NULL,
    slackAppToken TEXT NOT NULL,
    consentReminderMax INTEGER NOT NULL,
    consentExpiryDays INTEGER NOT NULL,
    developerTurnOnEnabled INTEGER NOT NULL CHECK (developerTurnOnEnabled IN (0, 1))
  )`,
  // A genuine one-to-many relation, not a scalar - see design.md Decision 3.
  // This is specifically the field the org-credential-resolution-fix
  // incident wiped; isolating it in its own table means a write to
  // `settings` cannot touch it even in principle.
  `CREATE TABLE org_configs (
    id TEXT PRIMARY KEY,
    orgId TEXT NOT NULL,
    orgName TEXT,
    projectSummary TEXT,
    apiKey TEXT NOT NULL,
    position INTEGER NOT NULL
  )`,
  `CREATE TABLE tier_notifications (
    tier TEXT PRIMARY KEY CHECK (tier IN ('Stale', 'Forgotten')),
    notify INTEGER NOT NULL CHECK (notify IN (0, 1)),
    askTurnOff INTEGER NOT NULL CHECK (askTurnOff IN (0, 1)),
    askDelete INTEGER NOT NULL CHECK (askDelete IN (0, 1)),
    autoTurnOffOnInaction INTEGER NOT NULL CHECK (autoTurnOffOnInaction IN (0, 1)),
    maxSnoozes INTEGER NOT NULL
  )`,
  `CREATE TABLE snooze_day_options (
    position INTEGER PRIMARY KEY,
    days INTEGER NOT NULL
  )`,
  `CREATE TABLE clusters (
    ${CLUSTER_RECORD_COLUMNS_SQL},
    PRIMARY KEY (clusterId)
  )`,
  `CREATE TABLE history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    takenAtMs INTEGER NOT NULL,
    trigger TEXT NOT NULL,
    isLifecycleChange INTEGER NOT NULL CHECK (isLifecycleChange IN (0, 1)),
    ${CLUSTER_RECORD_COLUMNS_SQL}
  )`,
  `CREATE INDEX idx_history_cluster ON history (clusterId, takenAtMs)`,
  `CREATE INDEX idx_history_lifecycle ON history (isLifecycleChange, takenAtMs)`,
];

/** Creates every table/index if the schema hasn't been created yet (`PRAGMA user_version` < 1). Exported so tests can bootstrap a fresh in-memory database identically to the real one - see db.test setup in store.test.ts/settings.test.ts. */
export function bootstrapSchema(db: DatabaseSync): void {
  const { user_version: version } = db.prepare("PRAGMA user_version").get() as { user_version: number };
  if (version >= 1) return;

  db.exec("BEGIN");
  try {
    for (const statement of SCHEMA_STATEMENTS) db.exec(statement);
    db.exec("PRAGMA user_version = 1");
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

let dbInstance: DatabaseSync | null = null;

/** Opens (creating and bootstrapping the schema on first use) the single shared SQLite connection for this process. */
export function getDb(): DatabaseSync {
  if (dbInstance) return dbInstance;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const db = new DatabaseSync(dbPath());
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  bootstrapSchema(db);
  dbInstance = db;
  return db;
}

/** Epoch-milliseconds for a column value - see design.md Decision 5. `null` in, `null` out. */
export function toEpochMs(iso: string | null | undefined): number | null {
  if (iso === null || iso === undefined) return null;
  return new Date(iso).getTime();
}

export function fromEpochMs(ms: number | null | undefined): string | null {
  if (ms === null || ms === undefined) return null;
  return new Date(ms).toISOString();
}

export function toSqliteBool(value: boolean): 0 | 1 {
  return value ? 1 : 0;
}

export function fromSqliteBool(value: number): boolean {
  return value !== 0;
}
