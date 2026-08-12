import { beforeEach, describe, expect, it, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import type { ClusterRecord, ClusterSnapshot } from "../types";

// Every test gets a fresh in-memory database - store.ts's getDb() is
// overridden below to always return this test's instance, so tests never
// touch the real ./data/store.sqlite3 this repo ships with (the same
// isolation principle the old node:fs-mocking version had, just aimed at
// the new backend - see design.md "Test impact").
let db: DatabaseSync;

vi.mock("./db", async () => {
  const actual = await vi.importActual<typeof import("./db")>("./db");
  return { ...actual, getDb: () => db };
});

const { appendHistory, appendHistoryIfChanged, historyEntriesDiffer, readHistory } = await import("./store");
const { bootstrapSchema } = await import("./db");

function makeRecord(overrides: Partial<ClusterRecord> = {}): ClusterRecord {
  return {
    clusterId: "c1",
    clusterName: "test-cluster",
    orgId: "org1",
    orgName: "Org",
    projectId: "proj1",
    projectName: "Project",
    config: {
      cloudProvider: "aws",
      region: "us-east-1",
      couchbaseVersion: "8.0.0",
      nodeCount: 3,
      nodeSpec: { compute: { cpu: 4, ram: 16 } },
      status: "healthy",
    },
    createdAt: "2026-01-01T00:00:00.000Z",
    ownerDerived: "owner@example.com",
    lastActivityAt: "2026-01-01T00:00:00.000Z",
    lastActivitySource: "sync-observed",
    actualCost: { amountUsd: 100, asOf: "2026-01-01T00:00:00.000Z" },
    deletedAt: null,
    lastSyncedAt: "2026-01-01T00:00:00.000Z",
    lastObservedFingerprint: "abc",
    lastNotifiedAgeStatus: null,
    consentStatus: "none",
    consentCycleStartedAt: null,
    remindersSent: 0,
    consentTierAtDecision: null,
    actionOutcome: "none",
    slackChannelId: null,
    slackMessageTs: null,
    snoozeUntil: null,
    snoozeJustification: null,
    snoozeCount: 0,
    ...overrides,
  };
}

beforeEach(() => {
  db = new DatabaseSync(":memory:");
  bootstrapSchema(db);
});

describe("historyEntriesDiffer", () => {
  it("returns false for identical records", () => {
    expect(historyEntriesDiffer(makeRecord(), makeRecord())).toBe(false);
  });

  it("ignores lastSyncedAt, lastObservedFingerprint, lastActivityAt, and lastActivitySource", () => {
    const a = makeRecord();
    const b = makeRecord({
      lastSyncedAt: "2026-02-01T00:00:00.000Z",
      lastObservedFingerprint: "different-fingerprint",
      lastActivityAt: "2026-01-01T00:00:00.179Z",
      lastActivitySource: "activity-log",
    });
    expect(historyEntriesDiffer(a, b)).toBe(false);
  });

  it("detects a config change", () => {
    const a = makeRecord();
    const b = makeRecord({ config: { ...a.config, nodeCount: 4 } });
    expect(historyEntriesDiffer(a, b)).toBe(true);
  });

  it("detects an actual cost change", () => {
    const a = makeRecord();
    const b = makeRecord({ actualCost: { amountUsd: 200, asOf: a.actualCost.asOf } });
    expect(historyEntriesDiffer(a, b)).toBe(true);
  });

  it("detects a consent/lifecycle field change", () => {
    const a = makeRecord({ consentStatus: "pending" });
    const b = makeRecord({ consentStatus: "approved-turnoff" });
    expect(historyEntriesDiffer(a, b)).toBe(true);
  });

  it("detects a snooze-count change", () => {
    const a = makeRecord({ snoozeCount: 0 });
    const b = makeRecord({ snoozeCount: 1 });
    expect(historyEntriesDiffer(a, b)).toBe(true);
  });

  it("treats a cluster's deletion (deletedAt null -> timestamp) as a real change", () => {
    const a = makeRecord({ deletedAt: null });
    const b = makeRecord({ deletedAt: "2026-03-01T00:00:00.000Z" });
    expect(historyEntriesDiffer(a, b)).toBe(true);
  });

  it("treats a re-swept tombstone (deletedAt reused, not overwritten) as no change", () => {
    const a = makeRecord({ deletedAt: "2026-03-01T00:00:00.000Z" });
    const b = makeRecord({ deletedAt: "2026-03-01T00:00:00.000Z" });
    expect(historyEntriesDiffer(a, b)).toBe(false);
  });
});

describe("appendHistoryIfChanged", () => {
  it("always appends when there is no prior record (newly discovered cluster)", async () => {
    await appendHistoryIfChanged(null, makeRecord(), "sync", "2026-01-01T00:00:00.000Z");
    const history = await readHistory();
    expect(history).toHaveLength(1);
    expect(history[0].trigger).toBe("sync");
  });

  it("does not append when the record hasn't meaningfully changed", async () => {
    const prior = makeRecord();
    const next = makeRecord({ lastSyncedAt: "2026-01-02T00:00:00.000Z" });
    await appendHistoryIfChanged(prior, next, "sync", "2026-01-02T00:00:00.000Z");
    expect(await readHistory()).toHaveLength(0);
  });

  it("appends, tagged with the given trigger, when the record has changed", async () => {
    const prior = makeRecord({ consentStatus: "pending" });
    const next = makeRecord({ consentStatus: "approved-turnoff" });
    await appendHistoryIfChanged(prior, next, "slack-decision", "2026-01-03T00:00:00.000Z");
    const history = await readHistory();
    expect(history).toHaveLength(1);
    expect(history[0].trigger).toBe("slack-decision");
  });

  it("repeated no-op gated appends across many cycles never accumulate duplicates", async () => {
    const record = makeRecord();
    await appendHistoryIfChanged(null, record, "sync", "2026-01-01T00:00:00.000Z");
    for (let i = 1; i <= 50; i += 1) {
      const unchanged = makeRecord({ lastSyncedAt: `2026-01-${String(i + 1).padStart(2, "0")}T00:00:00.000Z` });
      await appendHistoryIfChanged(record, unchanged, "sync", unchanged.lastSyncedAt);
    }
    expect(await readHistory()).toHaveLength(1);
  });
});

describe("readHistory", () => {
  it("defaults a missing trigger field to \"sync\" (entries written before it existed)", async () => {
    const legacyEntry = {
      clusterId: "c1",
      takenAt: "2025-01-01T00:00:00.000Z",
      record: makeRecord(),
    } as ClusterSnapshot;
    await appendHistory([legacyEntry]);
    const history = await readHistory();
    expect(history[0].trigger).toBe("sync");
  });
});

describe("write-time isLifecycleChange precomputation", () => {
  it("stores isLifecycleChange = false for a diff touching only routine (config/cost) fields", async () => {
    const prior = makeRecord();
    const next = makeRecord({ config: { ...prior.config, nodeCount: prior.config.nodeCount + 1 } });

    await appendHistoryIfChanged(prior, next, "sync", "2026-01-02T00:00:00.000Z");

    const [entry] = await readHistory();
    expect(entry.isLifecycleChange).toBe(false);
  });

  it("stores isLifecycleChange = true for a diff touching a consent/lifecycle field", async () => {
    const prior = makeRecord({ consentStatus: "pending" });
    const next = makeRecord({ consentStatus: "approved-turnoff" });

    await appendHistoryIfChanged(prior, next, "slack-decision", "2026-01-02T00:00:00.000Z");

    const [entry] = await readHistory();
    expect(entry.isLifecycleChange).toBe(true);
  });

  it("computes isLifecycleChange from the immediately-preceding stored row when a caller doesn't supply it (e.g. a legacy/bare snapshot)", async () => {
    await appendHistory([
      { clusterId: "c1", takenAt: "2026-01-01T00:00:00.000Z", record: makeRecord({ consentStatus: "none" }), trigger: "sync" },
    ]);
    // No `isLifecycleChange` on this snapshot - appendHistory must fall back
    // to diffing against the immediately-preceding stored row itself.
    await appendHistory([
      {
        clusterId: "c1",
        takenAt: "2026-01-02T00:00:00.000Z",
        record: makeRecord({ consentStatus: "pending" }),
        trigger: "sync",
      },
    ]);

    const history = await readHistory();
    expect(history.find((h) => h.takenAt === "2026-01-01T00:00:00.000Z")?.isLifecycleChange).toBe(false);
    expect(history.find((h) => h.takenAt === "2026-01-02T00:00:00.000Z")?.isLifecycleChange).toBe(true);
  });

  it("classification is fixed at write time - reading it back never re-derives it from the current record", async () => {
    // Simulates "the lifecycle-field rules changed after this entry was
    // written": the stored flag disagrees with what re-diffing the record
    // right now would produce. See the modified cluster-history-ui spec
    // scenario "Classification rules changing later does not reclassify
    // existing entries".
    await appendHistory([
      {
        clusterId: "c1",
        takenAt: "2026-01-01T00:00:00.000Z",
        record: makeRecord({ consentStatus: "pending" }),
        trigger: "sync",
        isLifecycleChange: false,
      },
    ]);

    const [entry] = await readHistory();
    expect(entry.isLifecycleChange).toBe(false);
  });
});

describe("sync cycle gating baseline (mid-cycle race)", () => {
  it("gating against the freshest state avoids duplicating an out-of-band decision", () => {
    // existingById: snapshot captured at the top of the sync cycle, before a Slack click landed.
    const existingById = makeRecord({ consentStatus: "pending" });
    // freshExisting: the real on-disk state by the time sync does its final gating check - a
    // Slack decision landed mid-cycle and already wrote its own history entry for this change.
    const freshExisting = makeRecord({ consentStatus: "approved-turnoff" });
    // This cycle's own record carries the same value forward (adoptConsentFields in sync.ts),
    // since this cycle itself made no new consent decision.
    const thisCycleRecord = makeRecord({ consentStatus: "approved-turnoff" });

    // Correct baseline: no diff against the freshest state -> no duplicate entry.
    expect(historyEntriesDiffer(freshExisting, thisCycleRecord)).toBe(false);
    // The bug design.md warns against: gating against the stale top-of-cycle snapshot
    // would look changed and duplicate an entry slackBot.ts already wrote.
    expect(historyEntriesDiffer(existingById, thisCycleRecord)).toBe(true);
  });
});
