/**
 * Integration coverage for the sync cycle: fake Capella and Slack, real
 * everything else, in-memory SQLite.
 *
 * The mock registrations below are the arrangement described in
 * src/test/integrationHarness.ts - each factory spreads `importActual` so only
 * the boundary-crossing functions are replaced and every pure helper in those
 * modules keeps running for real.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildCapellaFake,
  buildSlackFake,
  capella,
  capellaCalls,
  createGate,
  givenSingleOrg,
  harnessDb,
  makeApiCluster,
  resetHarness,
  slack,
} from "../test/integrationHarness";
import { makeSettings } from "../test/factories";
import type { Settings } from "../types";

vi.mock("./db", async () => {
  const actual = await vi.importActual<typeof import("./db")>("./db");
  // Read through a getter so each test's fresh database is picked up without
  // re-registering the mock - see integrationHarness.resetHarness().
  return { ...actual, getDb: () => harnessDbRef() };
});

vi.mock("./capellaClient", async () => {
  const actual = await vi.importActual<typeof import("./capellaClient")>("./capellaClient");
  return { ...actual, ...buildCapellaFake(actual.CapellaApiError) };
});

vi.mock("./slack", async () => {
  const actual = await vi.importActual<typeof import("./slack")>("./slack");
  return { ...actual, ...buildSlackFake() };
});

let settings: Settings;
vi.mock("./settings", () => ({ readSettings: async () => settings }));

const { runSyncCycle } = await import("./sync");
const { readClusters, readHistory, getCluster, upsertClusters } = await import("./store");

/** Indirection so the hoisted db mock resolves the *current* harness database. */
function harnessDbRef() {
  return harnessDb;
}

beforeEach(() => {
  resetHarness();
  settings = makeSettings({
    capellaOrgs: [{ id: "cfg-1", orgId: "org-1", apiKey: "key-1" }],
    activityGraceHours: 24,
    forgottenHours: 72,
  });
});

// Several tests below move the clock with vi.setSystemTime. Restoring it here
// rather than only at the end of each test means a mid-test failure can't leak
// a mocked clock into whatever runs next.
afterEach(() => {
  vi.useRealTimers();
});

describe("harness smoke test", () => {
  it("persists one record and one history entry for a single cluster", async () => {
    givenSingleOrg([makeApiCluster({ id: "c1", name: "alpha" })]);

    const result = await runSyncCycle();

    expect(result).toMatchObject({ syncedClusters: 1, orgsSynced: 1, removedClusterIds: [], failedOrgIds: [] });

    const clusters = await readClusters();
    expect(clusters).toHaveLength(1);
    expect(clusters[0]).toMatchObject({
      clusterId: "c1",
      clusterName: "alpha",
      orgId: "org-1",
      orgName: "Org One",
      orgConfigId: "cfg-1",
      projectId: "proj-1",
      projectName: "Project One",
    });

    expect(await readHistory()).toHaveLength(1);
  });

  it("maps the Capella payload into the stored config shape", async () => {
    givenSingleOrg([
      makeApiCluster({
        id: "c1",
        cloudProvider: { type: "gcp", region: "europe-west1" },
        couchbaseServer: { version: "7.6.2" },
        serviceGroups: [{ node: { compute: { cpu: 8, ram: 32 } }, numOfNodes: 5 }],
        currentState: "turnedOff",
      }),
    ]);

    await runSyncCycle();

    const [record] = await readClusters();
    expect(record.config).toEqual({
      cloudProvider: "gcp",
      region: "europe-west1",
      couchbaseVersion: "7.6.2",
      nodeCount: 5,
      nodeSpec: { compute: { cpu: 8, ram: 32 } },
      status: "turnedOff",
    });
  });

  it("runs against the harness database, not the real one", async () => {
    givenSingleOrg([makeApiCluster({ id: "c1" })]);

    await runSyncCycle();

    // Straight off the in-memory handle, bypassing store.ts.
    const rows = harnessDb.prepare("SELECT clusterId FROM clusters").all() as { clusterId: string }[];
    expect(rows).toEqual([{ clusterId: "c1" }]);
  });

  it("falls back to the configured org name when getOrganization fails", async () => {
    givenSingleOrg([makeApiCluster({ id: "c1" })]);
    // `name: undefined` makes the harness's getOrganization throw a
    // CapellaApiError, which sync.ts swallows in favour of the configured label.
    capella.orgs["org-1"].name = undefined;
    settings = makeSettings({ capellaOrgs: [{ id: "cfg-1", orgId: "org-1", apiKey: "key-1", orgName: "Configured Label" }] });

    await runSyncCycle();

    expect((await readClusters())[0].orgName).toBe("Configured Label");
  });

  it("tolerates zero configured organizations", async () => {
    settings = makeSettings({ capellaOrgs: [] });

    const result = await runSyncCycle();

    expect(result).toMatchObject({ syncedClusters: 0, orgsSynced: 0 });
    expect(await readClusters()).toEqual([]);
  });
});

describe("history gating across repeated cycles", () => {
  it("accumulates exactly one entry for an unchanged cluster, not one per cycle", async () => {
    givenSingleOrg([makeApiCluster({ id: "c1" })]);

    for (let i = 0; i < 10; i += 1) await runSyncCycle();

    // The bug this guards against produced a "No change recorded" entry per
    // cycle - see cluster-sync spec "Existing cluster unchanged".
    expect(await readHistory()).toHaveLength(1);
  });

  it("appends one further entry when a compared field actually changes", async () => {
    givenSingleOrg([makeApiCluster({ id: "c1", serviceGroups: [{ node: { compute: { cpu: 4, ram: 16 } }, numOfNodes: 3 }] })]);
    await runSyncCycle();
    await runSyncCycle();
    expect(await readHistory()).toHaveLength(1);

    // Scale up: nodeCount is a compared field.
    givenSingleOrg([makeApiCluster({ id: "c1", serviceGroups: [{ node: { compute: { cpu: 4, ram: 16 } }, numOfNodes: 6 }] })]);
    await runSyncCycle();
    await runSyncCycle();

    const history = await readHistory();
    expect(history).toHaveLength(2);
    expect(history.map((h) => h.record.config.nodeCount)).toEqual([3, 6]);
  });

  it("does not append for a pure lastSyncedAt/fingerprint refresh", async () => {
    givenSingleOrg([makeApiCluster({ id: "c1" })]);
    await runSyncCycle();
    const firstSyncedAt = (await readClusters())[0].lastSyncedAt;

    vi.setSystemTime(new Date("2026-06-01T00:00:00.000Z"));
    await runSyncCycle();
    vi.useRealTimers();

    // The live record moved forward...
    expect((await readClusters())[0].lastSyncedAt).not.toBe(firstSyncedAt);
    // ...but that alone is excluded from the comparison.
    expect(await readHistory()).toHaveLength(1);
  });

  it("classifies a routine config change as a non-lifecycle history entry", async () => {
    // A fixed activity-log timestamp is essential here. Without one, sync falls
    // back to fingerprint comparison, so *changing the config is itself
    // observed activity* - which pulls the cluster back to "Fresh" and makes
    // the entry a genuine tier transition (and therefore a lifecycle change).
    // Pinning activity to the log keeps the tier stable, isolating the routine
    // config diff this test is actually about.
    capella.activityByCluster["c1"] = [{ timestamp: "2026-01-02T00:00:00.000Z" }];
    givenSingleOrg([makeApiCluster({ id: "c1", serviceGroups: [{ node: { compute: { cpu: 4, ram: 16 } }, numOfNodes: 3 }] })]);
    await runSyncCycle();
    givenSingleOrg([makeApiCluster({ id: "c1", serviceGroups: [{ node: { compute: { cpu: 4, ram: 16 } }, numOfNodes: 4 }] })]);
    await runSyncCycle();

    const history = await readHistory();
    expect(history.at(-1)?.record.config.nodeCount).toBe(4);
    // isLifecycleChange is fixed at write time - see cluster-history-ui spec.
    expect(history.at(-1)?.isLifecycleChange).toBe(false);
  });

  it("treats a config change as observed activity when there is no activity log", async () => {
    // The other side of the coin, made explicit because it is surprising: with
    // no activity signal available, a scale-up is the only evidence of use there
    // is, so it legitimately returns the cluster to "Fresh".
    //
    // The clock is pinned to two distinct instants deliberately. On the real
    // clock both cycles can land in the same millisecond, and then the tier
    // reset writes an identical consentStatusChangedAt to the one already
    // stored - leaving only the routine config diff, so the entry is flagged
    // non-lifecycle. That made this test pass or fail depending on how fast the
    // machine was.
    vi.setSystemTime(new Date("2026-06-01T00:00:00.000Z"));
    givenSingleOrg([makeApiCluster({ id: "c1", serviceGroups: [{ node: { compute: { cpu: 4, ram: 16 } }, numOfNodes: 3 }] })]);
    await runSyncCycle();
    expect((await readClusters())[0].lastNotifiedRecency).toBe("Old");

    vi.setSystemTime(new Date("2026-06-02T00:00:00.000Z"));
    givenSingleOrg([makeApiCluster({ id: "c1", serviceGroups: [{ node: { compute: { cpu: 4, ram: 16 } }, numOfNodes: 4 }] })]);
    await runSyncCycle();

    const [record] = await readClusters();
    expect(record.lastActivitySource).toBe("sync-observed");
    expect(record.lastActivityAt).toBe("2026-06-02T00:00:00.000Z");
    expect(record.lastNotifiedRecency).toBe("Fresh");
    // Old -> Fresh resets the consent cycle, which moves
    // consentStatusChangedAt and makes this a lifecycle entry.
    expect((await readHistory()).at(-1)?.isLifecycleChange).toBe(true);
  });
});

describe("owner derivation", () => {
  it("resolves the creator's id to an email via the users lookup", async () => {
    capella.users["user-uuid-1"] = { id: "user-uuid-1", email: "creator@example.com", name: "Creator" };
    givenSingleOrg([
      makeApiCluster({ id: "c1", audit: { createdAt: "2026-01-01T00:00:00.000Z", createdBy: "user-uuid-1" } }),
    ]);

    await runSyncCycle();

    expect((await readClusters())[0].ownerDerived).toBe("creator@example.com");
  });

  it("caches the lookup across clusters sharing a creator within one cycle", async () => {
    capella.users["user-uuid-1"] = { id: "user-uuid-1", email: "creator@example.com" };
    const audit = { createdAt: "2026-01-01T00:00:00.000Z", createdBy: "user-uuid-1" };
    givenSingleOrg([
      makeApiCluster({ id: "c1", audit }),
      makeApiCluster({ id: "c2", audit }),
      makeApiCluster({ id: "c3", audit }),
    ]);

    await runSyncCycle();

    // One person often creates many clusters - see resolveOwner's comment.
    expect(capellaCalls.getUser).toEqual(["user-uuid-1"]);
    const owners = (await readClusters()).map((c) => c.ownerDerived);
    expect(owners).toEqual(["creator@example.com", "creator@example.com", "creator@example.com"]);
  });

  it("falls back to the raw id when the lookup fails, and does not retry it within the cycle", async () => {
    // No entry in capella.users, so getUser throws a CapellaApiError.
    const audit = { createdAt: "2026-01-01T00:00:00.000Z", createdBy: "unknown-uuid" };
    givenSingleOrg([makeApiCluster({ id: "c1", audit }), makeApiCluster({ id: "c2", audit })]);

    await runSyncCycle();

    expect((await readClusters()).map((c) => c.ownerDerived)).toEqual(["unknown-uuid", "unknown-uuid"]);
    expect(capellaCalls.getUser).toEqual(["unknown-uuid"]);
  });

  it("keeps a previously stored owner when the payload carries no createdBy", async () => {
    capella.users["user-uuid-1"] = { id: "user-uuid-1", email: "creator@example.com" };
    givenSingleOrg([
      makeApiCluster({ id: "c1", audit: { createdAt: "2026-01-01T00:00:00.000Z", createdBy: "user-uuid-1" } }),
    ]);
    await runSyncCycle();

    givenSingleOrg([makeApiCluster({ id: "c1", audit: { createdAt: "2026-01-01T00:00:00.000Z" } })]);
    await runSyncCycle();

    expect((await readClusters())[0].ownerDerived).toBe("creator@example.com");
  });

  it("prefers the user's name when no email is present", async () => {
    capella.users["user-uuid-1"] = { id: "user-uuid-1", name: "Just A Name" };
    givenSingleOrg([
      makeApiCluster({ id: "c1", audit: { createdAt: "2026-01-01T00:00:00.000Z", createdBy: "user-uuid-1" } }),
    ]);

    await runSyncCycle();

    expect((await readClusters())[0].ownerDerived).toBe("Just A Name");
  });
});

describe("clusters that disappear from Capella", () => {
  it("writes one final tombstoned history snapshot and removes the live record", async () => {
    givenSingleOrg([makeApiCluster({ id: "c1" }), makeApiCluster({ id: "c2" })]);
    await runSyncCycle();
    expect(await readClusters()).toHaveLength(2);

    givenSingleOrg([makeApiCluster({ id: "c1" })]);
    const result = await runSyncCycle();

    expect(result.removedClusterIds).toEqual(["c2"]);
    // Removed outright from the live table, not left as a tombstone in place -
    // see cluster-sync spec "Deletion writes a final history snapshot".
    expect((await readClusters()).map((c) => c.clusterId)).toEqual(["c1"]);
    expect(await getCluster("c2")).toBeNull();

    const c2History = (await readHistory()).filter((h) => h.clusterId === "c2");
    expect(c2History).toHaveLength(2);
    expect(c2History.at(-1)?.record.deletedAt).not.toBeNull();
  });

  it("sweeps a removed cluster only once across later cycles", async () => {
    givenSingleOrg([makeApiCluster({ id: "c1" }), makeApiCluster({ id: "c2" })]);
    await runSyncCycle();
    givenSingleOrg([makeApiCluster({ id: "c1" })]);
    await runSyncCycle();

    const afterFirstSweep = (await readHistory()).filter((h) => h.clusterId === "c2").length;
    const second = await runSyncCycle();
    const third = await runSyncCycle();

    expect(second.removedClusterIds).toEqual([]);
    expect(third.removedClusterIds).toEqual([]);
    expect((await readHistory()).filter((h) => h.clusterId === "c2")).toHaveLength(afterFirstSweep);
  });

  it("reuses an existing deletedAt rather than overwriting it when sweeping a pre-existing tombstone", async () => {
    givenSingleOrg([makeApiCluster({ id: "c1" }), makeApiCluster({ id: "c2" })]);
    await runSyncCycle();

    // Simulate a record tombstoned before the sweep behaviour existed.
    const existing = await getCluster("c2");
    const tombstonedAt = "2026-01-02T03:04:05.000Z";
    await upsertClusters([{ ...existing!, deletedAt: tombstonedAt }]);

    givenSingleOrg([makeApiCluster({ id: "c1" })]);
    await runSyncCycle();

    const finalEntry = (await readHistory()).filter((h) => h.clusterId === "c2").at(-1);
    expect(finalEntry?.record.deletedAt).toBe(tombstonedAt);
  });
});

describe("partial org failures never look like deletions", () => {
  it("leaves the other projects' clusters untouched and reports the org as failed", async () => {
    capella.orgs["org-1"] = {
      name: "Org One",
      projects: [
        { id: "proj-ok", name: "Healthy Project" },
        { id: "proj-broken", name: "Broken Project" },
      ],
      clustersByProject: {
        "proj-ok": [makeApiCluster({ id: "c-ok" })],
        "proj-broken": [makeApiCluster({ id: "c-broken" })],
      },
    };
    await runSyncCycle();
    expect((await readClusters()).map((c) => c.clusterId).sort()).toEqual(["c-broken", "c-ok"]);

    // Now one project's listing starts failing.
    capella.orgs["org-1"].failingProjectIds = ["proj-broken"];
    const result = await runSyncCycle();

    // The cluster we simply failed to re-fetch must not be treated as deleted.
    expect(result.removedClusterIds).toEqual([]);
    expect(result.failedOrgIds).toEqual(["org-1"]);
    expect(result.orgsSynced).toBe(0);
    expect((await readClusters()).map((c) => c.clusterId).sort()).toEqual(["c-broken", "c-ok"]);
    expect(await getCluster("c-broken")).not.toBeNull();
  });

  it("skips an org whose project listing fails outright, without touching its records", async () => {
    givenSingleOrg([makeApiCluster({ id: "c1" })]);
    await runSyncCycle();
    const before = await readClusters();

    capella.orgs["org-1"].failProjects = true;
    const result = await runSyncCycle();

    expect(result.failedOrgIds).toEqual(["org-1"]);
    expect(result.removedClusterIds).toEqual([]);
    expect(await readClusters()).toEqual(before);
  });

  it("still syncs a healthy org when a different one fails", async () => {
    settings = makeSettings({
      capellaOrgs: [
        { id: "cfg-1", orgId: "org-1", apiKey: "key-1" },
        { id: "cfg-2", orgId: "org-2", apiKey: "key-2" },
      ],
    });
    givenSingleOrg([makeApiCluster({ id: "c1" })], { orgId: "org-1", projectId: "proj-1" });
    givenSingleOrg([makeApiCluster({ id: "c2" })], { orgId: "org-2", projectId: "proj-2" });
    capella.orgs["org-1"].failProjects = true;

    const result = await runSyncCycle();

    expect(result.failedOrgIds).toEqual(["org-1"]);
    expect(result.orgsSynced).toBe(1);
    expect((await readClusters()).map((c) => c.clusterId)).toEqual(["c2"]);
  });
});

describe("last-activity resolution precedence", () => {
  it("prefers the activity log's most recent event", async () => {
    capella.activityByCluster["c1"] = [{ timestamp: "2026-05-05T10:00:00.000Z", summary: "query" }];
    givenSingleOrg([
      makeApiCluster({
        id: "c1",
        audit: { createdAt: "2026-01-01T00:00:00.000Z", modifiedAt: "2026-02-02T00:00:00.000Z" },
      }),
    ]);

    await runSyncCycle();

    const [record] = await readClusters();
    expect(record.lastActivityAt).toBe("2026-05-05T10:00:00.000Z");
    expect(record.lastActivitySource).toBe("activity-log");
  });

  it("falls back to audit.modifiedAt when the activity log is unreachable", async () => {
    // No activityByCluster entry, so the harness throws a CapellaApiError.
    givenSingleOrg([
      makeApiCluster({
        id: "c1",
        audit: { createdAt: "2026-01-01T00:00:00.000Z", modifiedAt: "2026-02-02T00:00:00.000Z" },
      }),
    ]);

    await runSyncCycle();

    const [record] = await readClusters();
    expect(record.lastActivityAt).toBe("2026-02-02T00:00:00.000Z");
    expect(record.lastActivitySource).toBe("sync-observed");
  });

  it("falls back to the creation date for a brand-new cluster with no other signal", async () => {
    givenSingleOrg([makeApiCluster({ id: "c1", audit: { createdAt: "2026-01-01T00:00:00.000Z" } })]);

    await runSyncCycle();

    const [record] = await readClusters();
    expect(record.lastActivityAt).toBe("2026-01-01T00:00:00.000Z");
    expect(record.lastActivitySource).toBe("sync-observed");
  });

  it("preserves the prior activity timestamp when the fingerprint is unchanged", async () => {
    givenSingleOrg([makeApiCluster({ id: "c1", audit: { createdAt: "2026-01-01T00:00:00.000Z" } })]);
    await runSyncCycle();
    const first = (await readClusters())[0];

    vi.setSystemTime(new Date("2026-08-01T00:00:00.000Z"));
    await runSyncCycle();
    vi.useRealTimers();

    const second = (await readClusters())[0];
    expect(second.lastActivityAt).toBe(first.lastActivityAt);
    expect(second.lastActivitySource).toBe(first.lastActivitySource);
  });

  it("treats an observed config change as activity when no other signal exists", async () => {
    givenSingleOrg([
      makeApiCluster({
        id: "c1",
        audit: { createdAt: "2026-01-01T00:00:00.000Z" },
        serviceGroups: [{ node: { compute: { cpu: 4, ram: 16 } }, numOfNodes: 3 }],
      }),
    ]);
    await runSyncCycle();

    const observedAt = "2026-08-01T00:00:00.000Z";
    vi.setSystemTime(new Date(observedAt));
    givenSingleOrg([
      makeApiCluster({
        id: "c1",
        audit: { createdAt: "2026-01-01T00:00:00.000Z" },
        serviceGroups: [{ node: { compute: { cpu: 4, ram: 16 } }, numOfNodes: 8 }],
      }),
    ]);
    await runSyncCycle();
    vi.useRealTimers();

    const [record] = await readClusters();
    expect(record.lastActivityAt).toBe(observedAt);
    expect(record.lastActivitySource).toBe("sync-observed");
  });
});

describe("billing", () => {
  it("stores a successful amount", async () => {
    capella.billingByCluster["c1"] = { ok: true, amountUsd: 12.34, asOf: "2026-01-05T00:00:00.000Z" };
    givenSingleOrg([makeApiCluster({ id: "c1" })]);

    await runSyncCycle();

    expect((await readClusters())[0].actualCost).toEqual({
      amountUsd: 12.34,
      asOf: "2026-01-05T00:00:00.000Z",
      unavailableReason: undefined,
    });
  });

  it("carries the prior amount forward with a reason when billing stops being available", async () => {
    capella.billingByCluster["c1"] = { ok: true, amountUsd: 42, asOf: "2026-01-05T00:00:00.000Z" };
    givenSingleOrg([makeApiCluster({ id: "c1" })]);
    await runSyncCycle();

    capella.billingByCluster["c1"] = { ok: false, reason: "no-access" };
    await runSyncCycle();

    // The last known figure is more useful than a sudden null, as long as the
    // reason travels with it.
    expect((await readClusters())[0].actualCost).toEqual({
      amountUsd: 42,
      asOf: "2026-01-05T00:00:00.000Z",
      unavailableReason: "no-access",
    });
  });

  it("records a credits-based org as unavailable with no invented amount", async () => {
    capella.billingByCluster["c1"] = { ok: false, reason: "credits-based" };
    givenSingleOrg([makeApiCluster({ id: "c1" })]);

    await runSyncCycle();

    expect((await readClusters())[0].actualCost).toEqual({
      amountUsd: null,
      asOf: null,
      unavailableReason: "credits-based",
    });
  });
});

describe("history retention", () => {
  it("purges entries older than the retention window during a cycle", async () => {
    settings = makeSettings({
      capellaOrgs: [{ id: "cfg-1", orgId: "org-1", apiKey: "key-1" }],
      retentionDays: 30,
    });
    givenSingleOrg([makeApiCluster({ id: "c1" })]);

    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    await runSyncCycle();
    expect(await readHistory()).toHaveLength(1);

    // Change something so a second entry is written, well beyond the window.
    vi.setSystemTime(new Date("2026-06-01T00:00:00.000Z"));
    givenSingleOrg([
      makeApiCluster({ id: "c1", serviceGroups: [{ node: { compute: { cpu: 4, ram: 16 } }, numOfNodes: 9 }] }),
    ]);
    await runSyncCycle();
    vi.useRealTimers();

    // January's entry is past retention; only the fresh one survives.
    const history = await readHistory();
    expect(history).toHaveLength(1);
    expect(history[0].record.config.nodeCount).toBe(9);
  });

  it("purges a deleted cluster's history on the same rule as an active one", async () => {
    settings = makeSettings({
      capellaOrgs: [{ id: "cfg-1", orgId: "org-1", apiKey: "key-1" }],
      retentionDays: 30,
    });

    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    givenSingleOrg([makeApiCluster({ id: "c1" }), makeApiCluster({ id: "c2" })]);
    await runSyncCycle();
    givenSingleOrg([makeApiCluster({ id: "c1" })]);
    await runSyncCycle();
    expect((await readHistory()).filter((h) => h.clusterId === "c2")).not.toHaveLength(0);

    vi.setSystemTime(new Date("2026-06-01T00:00:00.000Z"));
    await runSyncCycle();
    vi.useRealTimers();

    // Retention is independent of deletion - see cluster-sync spec.
    expect((await readHistory()).filter((h) => h.clusterId === "c2")).toHaveLength(0);
  });
});
