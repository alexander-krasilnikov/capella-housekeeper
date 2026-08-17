-- Schema version 1, frozen verbatim from SCHEMA_STATEMENTS in src/lib/db.ts
-- at commit fed71f0 ("Migrate storage from JSON files to SQLite"), with the
-- CLUSTER_RECORD_COLUMNS_SQL template literal expanded inline.
--
-- Do not edit. This is a historical artifact: it records what version 1
-- actually looked like on the disks of everyone who ran that build. Editing it
-- would defeat the schema-identity check in db.migration.test.ts, whose whole
-- job is to prove the live upgrade path reproduces the current schema from
-- exactly this starting point.
--
-- Every SCHEMA_VERSION bump freezes the outgoing schema as a new file here.
-- See src/lib/db.ts's comment above MIGRATIONS.

CREATE TABLE settings (
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
  );

CREATE TABLE org_configs (
    id TEXT PRIMARY KEY,
    orgId TEXT NOT NULL,
    orgName TEXT,
    projectSummary TEXT,
    apiKey TEXT NOT NULL,
    position INTEGER NOT NULL
  );

CREATE TABLE tier_notifications (
    tier TEXT PRIMARY KEY CHECK (tier IN ('Stale', 'Forgotten')),
    notify INTEGER NOT NULL CHECK (notify IN (0, 1)),
    askTurnOff INTEGER NOT NULL CHECK (askTurnOff IN (0, 1)),
    askDelete INTEGER NOT NULL CHECK (askDelete IN (0, 1)),
    autoTurnOffOnInaction INTEGER NOT NULL CHECK (autoTurnOffOnInaction IN (0, 1)),
    maxSnoozes INTEGER NOT NULL
  );

CREATE TABLE snooze_day_options (
    position INTEGER PRIMARY KEY,
    days INTEGER NOT NULL
  );

CREATE TABLE clusters (
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
  snoozeCount INTEGER NOT NULL,
    PRIMARY KEY (clusterId)
  );

CREATE TABLE history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    takenAtMs INTEGER NOT NULL,
    trigger TEXT NOT NULL,
    isLifecycleChange INTEGER NOT NULL CHECK (isLifecycleChange IN (0, 1)),
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
  );

CREATE INDEX idx_history_cluster ON history (clusterId, takenAtMs);

CREATE INDEX idx_history_lifecycle ON history (isLifecycleChange, takenAtMs);

PRAGMA user_version = 1;
