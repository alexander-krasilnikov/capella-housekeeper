/**
 * Regenerates `db-v2.sqlite3` - a real schema-version-2 database file holding
 * a few rows, used by db.migration.test.ts's data-survival test for the
 * rename-age-status-to-recency migration.
 *
 *   node src/test/__fixtures__/generate-db-v2.mjs
 *
 * Committed as a binary fixture on purpose: reconstructing a v2 database from
 * `schema-v2.sql` proves the *schema* upgrade works, but only a real file with
 * real rows - carrying the pre-rename tier strings this migration must rewrite
 * ("In Use"/"Stale"/"Forgotten") - proves stored data survives it.
 *
 * `journal_mode = DELETE` is essential. Under the WAL mode the application
 * uses, recent writes live in a separate `-wal` sidecar rather than the main
 * file, so committing `db-v2.sqlite3` alone would ship a nearly empty
 * database. (This is not hypothetical - the working tree's own
 * data/store.sqlite3 is 4 KB against a 2 MB -wal.) DELETE mode keeps
 * everything in the single file this script writes.
 */
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

const here = path.dirname(new URL(import.meta.url).pathname);
const target = path.join(here, "db-v2.sqlite3");
const schemaSql = fs.readFileSync(path.join(here, "schema-v2.sql"), "utf8");

fs.rmSync(target, { force: true });
fs.rmSync(`${target}-wal`, { force: true });
fs.rmSync(`${target}-shm`, { force: true });

const db = new DatabaseSync(target);
// See the note above - NOT the WAL mode the application runs in.
db.exec("PRAGMA journal_mode = DELETE");
db.exec(schemaSql);

/** Fixed timestamps so regenerating this file produces identical content. */
const T = (iso) => new Date(iso).getTime();

/** The 37 columns schema version 2 defines, in declaration order. */
const V2_COLUMNS = [
  "clusterId", "clusterName", "orgId", "orgName", "orgConfigId", "projectId", "projectName",
  "cloudProvider", "region", "couchbaseVersion", "nodeCount", "nodeCpu", "nodeRam", "status",
  "createdAtMs", "ownerDerived", "lastActivityAtMs", "lastActivitySource",
  "actualCostAmountUsd", "actualCostAsOfMs", "actualCostUnavailableReason",
  "deletedAtMs", "lastSyncedAtMs", "lastObservedFingerprint",
  "lastNotifiedAgeStatus", "consentStatus", "consentCycleStartedAtMs", "remindersSent",
  "consentTierAtDecision", "actionOutcome", "slackChannelId", "slackMessageTs",
  "snoozeUntilMs", "snoozeJustification", "snoozeCount",
  "consentStatusChangedAtMs", "workflowNote",
];

function v2Row(overrides = {}) {
  return {
    clusterId: "fixture-cluster-1",
    clusterName: "fixture-cluster",
    orgId: "org-fixture",
    orgName: "Fixture Org",
    orgConfigId: "cfg-fixture",
    projectId: "proj-fixture",
    projectName: "Fixture Project",
    cloudProvider: "aws",
    region: "eu-west-1",
    couchbaseVersion: "7.6.2",
    nodeCount: 3,
    nodeCpu: 4,
    nodeRam: 16,
    status: "healthy",
    createdAtMs: T("2026-01-01T00:00:00.000Z"),
    ownerDerived: "fixture-owner@example.com",
    lastActivityAtMs: T("2026-01-05T12:00:00.000Z"),
    lastActivitySource: "activity-log",
    actualCostAmountUsd: 42.5,
    actualCostAsOfMs: T("2026-01-05T12:00:00.000Z"),
    actualCostUnavailableReason: null,
    deletedAtMs: null,
    lastSyncedAtMs: T("2026-01-05T12:00:00.000Z"),
    lastObservedFingerprint: "fixture-fingerprint-aaa",
    lastNotifiedAgeStatus: "Stale",
    consentStatus: "pending",
    consentCycleStartedAtMs: T("2026-01-05T00:00:00.000Z"),
    remindersSent: 1,
    consentTierAtDecision: "Stale",
    actionOutcome: "none",
    slackChannelId: "D0FIXTURE",
    slackMessageTs: "1767571200.000100",
    snoozeUntilMs: null,
    snoozeJustification: null,
    snoozeCount: 0,
    consentStatusChangedAtMs: T("2026-01-05T00:00:00.000Z"),
    workflowNote: null,
    ...overrides,
  };
}

const clusterInsert = db.prepare(
  `INSERT INTO clusters (${V2_COLUMNS.join(", ")})
   VALUES (${V2_COLUMNS.map((c) => `@${c}`).join(", ")})`,
);
const historyInsert = db.prepare(
  `INSERT INTO history (takenAtMs, trigger, isLifecycleChange, ${V2_COLUMNS.join(", ")})
   VALUES (@takenAtMs, @trigger, @isLifecycleChange, ${V2_COLUMNS.map((c) => `@${c}`).join(", ")})`,
);

// Three live clusters: one mid-consent-cycle in "Stale", one snoozed with a
// justification, one already "Forgotten" - so the rename migration has all
// three old tier strings to rewrite across `lastNotifiedAgeStatus` and
// `consentTierAtDecision`.
clusterInsert.run(v2Row());
clusterInsert.run(
  v2Row({
    clusterId: "fixture-cluster-2",
    clusterName: "fixture-cluster-snoozed",
    consentStatus: "snoozed",
    snoozeUntilMs: T("2026-01-20T00:00:00.000Z"),
    snoozeJustification: "still needed for a POC through end of month",
    snoozeCount: 2,
    lastObservedFingerprint: "fixture-fingerprint-bbb",
    actualCostAmountUsd: null,
    actualCostUnavailableReason: "credits-based",
  }),
);
clusterInsert.run(
  v2Row({
    clusterId: "fixture-cluster-3",
    clusterName: "fixture-cluster-forgotten",
    lastNotifiedAgeStatus: "Forgotten",
    consentTierAtDecision: "Forgotten",
    consentStatus: "expired",
    lastObservedFingerprint: "fixture-fingerprint-ccc-live",
    workflowNote: "expired - no response received",
  }),
);

// Three history entries, including a lifecycle-flagged one and a tombstone for
// a cluster that is no longer live, each carrying an old tier string too.
historyInsert.run({
  takenAtMs: T("2026-01-02T00:00:00.000Z"),
  trigger: "sync",
  isLifecycleChange: 0,
  ...v2Row({ consentStatus: "none", consentCycleStartedAtMs: null, remindersSent: 0, consentTierAtDecision: null, lastNotifiedAgeStatus: null, slackChannelId: null, slackMessageTs: null, consentStatusChangedAtMs: null }),
});
historyInsert.run({
  takenAtMs: T("2026-01-05T00:00:00.000Z"),
  trigger: "slack-decision",
  isLifecycleChange: 1,
  ...v2Row(),
});
historyInsert.run({
  takenAtMs: T("2026-01-06T00:00:00.000Z"),
  trigger: "sync",
  isLifecycleChange: 1,
  ...v2Row({
    clusterId: "fixture-cluster-deleted",
    clusterName: "fixture-cluster-gone",
    deletedAtMs: T("2026-01-06T00:00:00.000Z"),
    lastObservedFingerprint: "fixture-fingerprint-ccc",
    lastNotifiedAgeStatus: "Forgotten",
    consentTierAtDecision: "Forgotten",
  }),
});

db.close();

const { size } = fs.statSync(target);
for (const sidecar of [`${target}-wal`, `${target}-shm`]) {
  if (fs.existsSync(sidecar)) throw new Error(`unexpected sidecar left behind: ${sidecar}`);
}
console.log(`wrote ${target} (${size} bytes, single file, no -wal/-shm sidecar)`);
