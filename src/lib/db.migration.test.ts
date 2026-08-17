/**
 * Guard rails for the schema-upgrade path - see the schema-migration-safety
 * spec.
 *
 * This path is the one branch of `bootstrapSchema` that no other test reaches:
 * a freshly created database always takes the `version === 0` branch and
 * builds the current schema wholesale from SCHEMA_STATEMENTS, so every test,
 * CI run and new clone skips the migration branch entirely. Only an existing
 * user's database ever runs it, exactly once, on data that matters.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { columnNames, schemaSnapshot } from "../test/schemaSnapshot";
import { makeClusterRecord } from "../test/factories";

let db: DatabaseSync;

// store.ts's getDb() is redirected at this test's own in-memory database, so
// nothing here touches the real ./data/store.sqlite3.
vi.mock("./db", async () => {
  const actual = await vi.importActual<typeof import("./db")>("./db");
  return { ...actual, getDb: () => db };
});

const { bootstrapSchema, CLUSTER_RECORD_COLUMNS } = await import("./db");
const { appendHistory, clusterRecordToRow, readClusters, readHistory, upsertClusters } = await import("./store");

const SCHEMA_V1_SQL = fs.readFileSync(new URL("../test/__fixtures__/schema-v1.sql", import.meta.url), "utf8");

/** The two columns MIGRATIONS[1] adds to both `clusters` and `history`. */
const V2_ADDED_COLUMNS = ["consentStatusChangedAtMs", "workflowNote"];

/** A database at exactly schema version 1, built from the frozen fixture. */
function openV1Database(): DatabaseSync {
  const fresh = new DatabaseSync(":memory:");
  fresh.exec(SCHEMA_V1_SQL);
  return fresh;
}

/** A database at the current schema version, reached by fresh creation. */
function openFreshDatabase(): DatabaseSync {
  const fresh = new DatabaseSync(":memory:");
  bootstrapSchema(fresh);
  return fresh;
}

describe("the frozen v1 fixture", () => {
  it("really is version 1 - the starting point the upgrade must handle", () => {
    const v1 = openV1Database();
    const snapshot = schemaSnapshot(v1);

    expect(snapshot.userVersion).toBe(1);
    // If this fixture ever drifted forward to already contain the v2 columns,
    // every test below would pass vacuously without exercising the upgrade.
    for (const column of V2_ADDED_COLUMNS) {
      expect(columnNames(snapshot, "clusters")).not.toContain(column);
      expect(columnNames(snapshot, "history")).not.toContain(column);
    }
  });
});

describe("an upgraded database is structurally identical to a fresh one", () => {
  it("produces an identical schema snapshot", () => {
    const migrated = openV1Database();
    bootstrapSchema(migrated);

    // The whole guarantee, in one assertion. This is what fails the moment
    // someone bumps SCHEMA_VERSION with an incomplete migration: the upgrade
    // chain runs from v1 forward through every step, so a missing step leaves
    // the migrated database short of whatever the fresh one has.
    expect(schemaSnapshot(migrated)).toEqual(schemaSnapshot(openFreshDatabase()));
  });

  it("reports the same schema version by either route", () => {
    const migrated = openV1Database();
    bootstrapSchema(migrated);

    expect(schemaSnapshot(migrated).userVersion).toBe(schemaSnapshot(openFreshDatabase()).userVersion);
  });

  it("adds exactly the columns the current build expects, to both record-shaped tables", () => {
    const migrated = openV1Database();
    bootstrapSchema(migrated);

    // `history` mirrors `clusters` column-for-column plus its own event
    // metadata (db.ts's shared CLUSTER_RECORD_COLUMNS_SQL), so a migration
    // that updated only one of the two would be a live bug.
    for (const column of V2_ADDED_COLUMNS) {
      expect(columnNames(schemaSnapshot(migrated), "clusters")).toContain(column);
      expect(columnNames(schemaSnapshot(migrated), "history")).toContain(column);
    }
  });

  it("upgrades on first open, with no separate command or user action", () => {
    const migrated = openV1Database();
    expect(schemaSnapshot(migrated).userVersion).toBe(1);

    bootstrapSchema(migrated);

    expect(schemaSnapshot(migrated).userVersion).toBeGreaterThan(1);
  });
});

describe("an already-current database is left alone", () => {
  it("applies nothing and leaves the schema unchanged", () => {
    const current = openFreshDatabase();
    const before = schemaSnapshot(current);

    bootstrapSchema(current);

    expect(schemaSnapshot(current)).toEqual(before);
  });

  it("is unchanged across repeated calls", () => {
    const current = openFreshDatabase();
    const before = schemaSnapshot(current);

    for (let i = 0; i < 5; i += 1) bootstrapSchema(current);

    expect(schemaSnapshot(current)).toEqual(before);
  });
});

describe("a failed upgrade leaves the recorded version unchanged", () => {
  /**
   * Provokes a real failure with no injected hook: a version-1 database that
   * already carries the *first* column the upgrade adds. The real
   * `ALTER TABLE clusters ADD COLUMN consentStatusChangedAtMs` then fails on a
   * duplicate column name partway through the upgrade, which is exactly the
   * shape of failure the transaction exists to contain.
   */
  function openV1DatabaseWithConflictingColumn(): DatabaseSync {
    const conflicted = openV1Database();
    conflicted.exec("ALTER TABLE clusters ADD COLUMN consentStatusChangedAtMs INTEGER");
    return conflicted;
  }

  it("rolls back and stays at the previous version", () => {
    const conflicted = openV1DatabaseWithConflictingColumn();

    expect(() => bootstrapSchema(conflicted)).toThrow();

    expect(schemaSnapshot(conflicted).userVersion).toBe(1);
  });

  it("leaves no partially applied schema change behind", () => {
    const conflicted = openV1DatabaseWithConflictingColumn();

    expect(() => bootstrapSchema(conflicted)).toThrow();

    // The statements after the failing one must not have taken effect: the
    // pre-existing column is still there (it was never ours to add), but
    // nothing else from this upgrade is.
    const snapshot = schemaSnapshot(conflicted);
    expect(columnNames(snapshot, "clusters")).toContain("consentStatusChangedAtMs");
    expect(columnNames(snapshot, "clusters")).not.toContain("workflowNote");
    expect(columnNames(snapshot, "history")).not.toContain("consentStatusChangedAtMs");
    expect(columnNames(snapshot, "history")).not.toContain("workflowNote");
  });

  it("re-attempts the same upgrade on a later open rather than skipping it", () => {
    const conflicted = openV1DatabaseWithConflictingColumn();
    expect(() => bootstrapSchema(conflicted)).toThrow();

    // Still at version 1, so the upgrade is still pending - a second open must
    // try again and fail the same way, not treat it as already applied.
    expect(() => bootstrapSchema(conflicted)).toThrow();
    expect(schemaSnapshot(conflicted).userVersion).toBe(1);
  });
});

describe("existing data survives an upgrade", () => {
  /**
   * Works on a copy: `bootstrapSchema` mutates the database it's given, and
   * the committed fixture has to stay at version 1 for every later run.
   */
  function openUpgradedGoldenFixture(): DatabaseSync {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "capella-housekeeper-migration-"));
    const copy = path.join(tempDir, "store.sqlite3");
    fs.copyFileSync(new URL("../test/__fixtures__/db-v1.sqlite3", import.meta.url), copy);

    const opened = new DatabaseSync(copy);
    expect(schemaSnapshot(opened).userVersion).toBe(1);
    bootstrapSchema(opened);
    return opened;
  }

  beforeEach(() => {
    db = openUpgradedGoldenFixture();
  });

  it("keeps every stored cluster readable", async () => {
    const clusters = await readClusters();

    expect(clusters.map((c) => c.clusterId).sort()).toEqual(["fixture-cluster-1", "fixture-cluster-2"]);
  });

  it("preserves the field values a pre-upgrade record held", async () => {
    const clusters = await readClusters();
    const record = clusters.find((c) => c.clusterId === "fixture-cluster-1");

    expect(record).toMatchObject({
      clusterName: "fixture-cluster",
      orgId: "org-fixture",
      orgConfigId: "cfg-fixture",
      projectName: "Fixture Project",
      ownerDerived: "fixture-owner@example.com",
      createdAt: "2026-01-01T00:00:00.000Z",
      lastActivityAt: "2026-01-05T12:00:00.000Z",
      lastActivitySource: "activity-log",
      consentStatus: "pending",
      consentCycleStartedAt: "2026-01-05T00:00:00.000Z",
      remindersSent: 1,
      consentTierAtDecision: "Stale",
      lastNotifiedAgeStatus: "Stale",
      slackChannelId: "D0FIXTURE",
      slackMessageTs: "1767571200.000100",
    });
    expect(record?.config).toEqual({
      cloudProvider: "aws",
      region: "eu-west-1",
      couchbaseVersion: "7.6.2",
      nodeCount: 3,
      nodeSpec: { compute: { cpu: 4, ram: 16 } },
      status: "healthy",
    });
    expect(record?.actualCost).toEqual({
      amountUsd: 42.5,
      asOf: "2026-01-05T12:00:00.000Z",
      unavailableReason: undefined,
    });
  });

  it("preserves a snoozed record's justification and count", async () => {
    const clusters = await readClusters();
    const snoozed = clusters.find((c) => c.clusterId === "fixture-cluster-2");

    expect(snoozed).toMatchObject({
      consentStatus: "snoozed",
      snoozeUntil: "2026-01-20T00:00:00.000Z",
      snoozeJustification: "still needed for a POC through end of month",
      snoozeCount: 2,
    });
    expect(snoozed?.actualCost).toEqual({ amountUsd: null, asOf: "2026-01-05T12:00:00.000Z", unavailableReason: "credits-based" });
  });

  it("reads fields introduced by the upgrade as null, not undefined or an error", async () => {
    const clusters = await readClusters();

    for (const record of clusters) {
      // rowToClusterRecord's `?? null` on workflowNote exists precisely for
      // this case - a row written before the column existed. Nothing tested
      // it until now.
      expect(record.workflowNote).toBeNull();
      expect(record.consentStatusChangedAt).toBeNull();
    }
  });

  it("keeps every stored history entry readable, with its trigger and lifecycle flag intact", async () => {
    const history = await readHistory();

    expect(history).toHaveLength(3);
    expect(history.map((h) => h.trigger)).toEqual(["sync", "slack-decision", "sync"]);
    // Fixed at write time under v1 and never re-derived - see the
    // cluster-history-ui spec.
    expect(history.map((h) => h.isLifecycleChange)).toEqual([false, true, true]);
    expect(history.map((h) => h.takenAt)).toEqual([
      "2026-01-02T00:00:00.000Z",
      "2026-01-05T00:00:00.000Z",
      "2026-01-06T00:00:00.000Z",
    ]);
  });

  it("preserves a tombstoned history entry's deletedAt", async () => {
    const history = await readHistory();
    const tombstone = history.find((h) => h.clusterId === "fixture-cluster-deleted");

    expect(tombstone?.record.deletedAt).toBe("2026-01-06T00:00:00.000Z");
  });

  it("reads history fields introduced by the upgrade as null too", async () => {
    const history = await readHistory();

    for (const entry of history) {
      expect(entry.record.workflowNote).toBeNull();
      expect(entry.record.consentStatusChangedAt).toBeNull();
    }
  });
});

describe("writing to a database that reached the current version by upgrade", () => {
  beforeEach(() => {
    db = openV1Database();
    bootstrapSchema(db);
  });

  it("round-trips a cluster record including the columns the upgrade introduced", async () => {
    const record = makeClusterRecord({
      consentStatusChangedAt: "2026-02-01T00:00:00.000Z",
      workflowNote: "turned off automatically - no response received",
    });

    await upsertClusters([record]);

    const [stored] = await readClusters();
    expect(stored).toEqual(record);
    expect(stored.consentStatusChangedAt).toBe("2026-02-01T00:00:00.000Z");
    expect(stored.workflowNote).toBe("turned off automatically - no response received");
  });

  it("round-trips a history entry including those columns", async () => {
    const record = makeClusterRecord({
      consentStatusChangedAt: "2026-03-01T00:00:00.000Z",
      workflowNote: "the maximum of 3 snooze(s) was reached",
    });

    await appendHistory([
      { clusterId: record.clusterId, takenAt: "2026-03-01T00:00:00.000Z", record, trigger: "auto-turnoff-decision" },
    ]);

    const [entry] = await readHistory();
    expect(entry.record.consentStatusChangedAt).toBe("2026-03-01T00:00:00.000Z");
    expect(entry.record.workflowNote).toBe("the maximum of 3 snooze(s) was reached");
    expect(entry.trigger).toBe("auto-turnoff-decision");
  });
});

describe("schema drift guard", () => {
  it("keeps CLUSTER_RECORD_COLUMNS in step with the row the record maps to", () => {
    // Adding a field to ClusterRecord means adding it to clusterRecordToRow;
    // this fails until the matching column is declared too - which is the
    // moment a SCHEMA_VERSION bump and a migration entry become due.
    expect([...CLUSTER_RECORD_COLUMNS].sort()).toEqual(
      Object.keys(clusterRecordToRow(makeClusterRecord())).sort(),
    );
  });

  it("declares every one of those columns on both record-shaped tables", () => {
    const snapshot = schemaSnapshot(openFreshDatabase());

    for (const column of CLUSTER_RECORD_COLUMNS) {
      expect(columnNames(snapshot, "clusters")).toContain(column);
      expect(columnNames(snapshot, "history")).toContain(column);
    }
  });
});
