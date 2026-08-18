/**
 * Integration coverage for the reconciliation loop against a real store.
 *
 * reconciliation.test.ts already covers the pass's decision logic with `store`
 * itself mocked. What that arrangement cannot show is whether the outcome
 * actually lands on disk correctly - `applyActionOutcome` deliberately re-reads
 * the cluster fresh right before writing (because a Capella write can take up
 * to 120s), and whether that re-read preserves concurrent changes is only
 * observable with a real store underneath.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildCapellaFake,
  buildSlackFake,
  capella,
  capellaCalls,
  createGate,
  harnessDb,
  resetHarness,
  slack,
} from "../test/integrationHarness";
import { makeClusterRecord, makeSettings } from "../test/factories";
import type { ClusterRecord, Settings } from "../types";

vi.mock("./db", async () => {
  const actual = await vi.importActual<typeof import("./db")>("./db");
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

const { runReconciliationPass } = await import("./reconciliation");
const { getCluster, readHistory, upsertClusters } = await import("./store");

function harnessDbRef() {
  return harnessDb;
}

const NOW = "2026-03-01T00:00:00.000Z";

/**
 * A cluster with an approved decision awaiting action. `createdAt` and
 * `lastActivitySource: "unknown"` put it firmly in the Old tier at `NOW`,
 * matching `consentTierAtDecision` so re-verification agrees by default.
 */
function approvedRecord(overrides: Partial<ClusterRecord> = {}): ClusterRecord {
  return makeClusterRecord({
    clusterId: "c1",
    clusterName: "doomed-cluster",
    orgId: "org-1",
    orgConfigId: "cfg-1",
    projectId: "proj-1",
    createdAt: "2026-01-01T00:00:00.000Z",
    lastActivityAt: null,
    lastActivitySource: "unknown",
    consentStatus: "approved-turnoff",
    consentTierAtDecision: "Old",
    actionOutcome: "none",
    slackChannelId: "D0HARNESS",
    slackMessageTs: "1767225600.00001",
    ...overrides,
  });
}

beforeEach(() => {
  resetHarness();
  settings = makeSettings({
    capellaOrgs: [{ id: "cfg-1", orgId: "org-1", apiKey: "key-1" }],
    slackBotToken: "xoxb-test",
    activityGraceHours: 24,
    forgottenHours: 72,
  });
  vi.setSystemTime(new Date(NOW));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("an approved turn-off whose tier still holds", () => {
  it("performs the Capella write and records the transitional status", async () => {
    await upsertClusters([approvedRecord()]);

    const result = await runReconciliationPass();

    expect(result).toEqual({ performed: 1, skipped: 0, failed: 0 });
    expect(capellaCalls.turnOffCluster).toEqual(["c1"]);

    const stored = await getCluster("c1");
    expect(stored?.actionOutcome).toBe("performed");
    // Capella's own in-progress state, not an assumed terminal one - its 202
    // confirms acceptance, not completion.
    expect(stored?.config.status).toBe("turningOff");
    expect(stored?.workflowNote).toBeNull();
  });

  it("tells the owner, on the message tied to the decision", async () => {
    await upsertClusters([approvedRecord()]);

    await runReconciliationPass();

    const update = slack.updates.at(-1);
    expect(update?.channelId).toBe("D0HARNESS");
    expect(update?.messageTs).toBe("1767225600.00001");
    expect(update?.text).toContain("turned off");
  });

  it("writes a reconciliation-tagged history entry", async () => {
    await upsertClusters([approvedRecord()]);

    await runReconciliationPass();

    const entry = (await readHistory()).at(-1);
    expect(entry?.trigger).toBe("reconciliation");
    expect(entry?.record.actionOutcome).toBe("performed");
  });

  it("does not act again on a later pass", async () => {
    await upsertClusters([approvedRecord()]);
    await runReconciliationPass();

    const second = await runReconciliationPass();

    expect(second).toEqual({ performed: 0, skipped: 0, failed: 0 });
    expect(capellaCalls.turnOffCluster).toEqual(["c1"]);
  });
});

describe("an approved delete", () => {
  it("calls delete rather than turn-off and records destroying", async () => {
    await upsertClusters([approvedRecord({ consentStatus: "approved-delete" })]);

    const result = await runReconciliationPass();

    expect(result).toEqual({ performed: 1, skipped: 0, failed: 0 });
    expect(capellaCalls.deleteCluster).toEqual(["c1"]);
    expect(capellaCalls.turnOffCluster).toEqual([]);
    expect((await getCluster("c1"))?.config.status).toBe("destroying");
    expect(slack.updates.at(-1)?.text).toContain("deleted");
  });
});

describe("re-verification before acting", () => {
  it("skips a cluster that became active again, without calling Capella", async () => {
    // Recent activity pulls it back to Fresh, so it no longer matches the
    // Old tier the decision was made in.
    await upsertClusters([
      approvedRecord({ lastActivityAt: NOW, lastActivitySource: "activity-log" }),
    ]);

    const result = await runReconciliationPass();

    expect(result).toEqual({ performed: 0, skipped: 1, failed: 0 });
    expect(capellaCalls.turnOffCluster).toEqual([]);

    const stored = await getCluster("c1");
    expect(stored?.actionOutcome).toBe("skipped");
    expect(stored?.workflowNote).toBe(
      "the cluster no longer warranted the action by the time of re-verification",
    );
    // A skip leaves the operational status untouched.
    expect(stored?.config.status).toBe("healthy");
  });

  it("tells the owner nothing was done", async () => {
    await upsertClusters([approvedRecord({ lastActivityAt: NOW, lastActivitySource: "activity-log" })]);

    await runReconciliationPass();

    expect(slack.updates.at(-1)?.text).toContain("became active again");
  });

  it("treats a skip as terminal for this cycle", async () => {
    await upsertClusters([approvedRecord({ lastActivityAt: NOW, lastActivitySource: "activity-log" })]);
    await runReconciliationPass();

    expect(await runReconciliationPass()).toEqual({ performed: 0, skipped: 0, failed: 0 });
  });
});

describe("failures", () => {
  it("records a Capella refusal as failed, with the error text, and stays retryable", async () => {
    capella.failingWriteClusterIds = ["c1"];
    await upsertClusters([approvedRecord()]);

    const first = await runReconciliationPass();

    expect(first).toEqual({ performed: 0, skipped: 0, failed: 1 });
    const stored = await getCluster("c1");
    expect(stored?.actionOutcome).toBe("failed");
    expect(stored?.workflowNote).toContain("turn-off refused for c1");
    // Status untouched - nothing actually happened to the cluster.
    expect(stored?.config.status).toBe("healthy");

    // "failed" stays eligible so a transient error is retried.
    const second = await runReconciliationPass();
    expect(second).toEqual({ performed: 0, skipped: 0, failed: 1 });
    expect(capellaCalls.turnOffCluster).toEqual(["c1", "c1"]);
  });

  it("succeeds on a retry once Capella stops refusing", async () => {
    capella.failingWriteClusterIds = ["c1"];
    await upsertClusters([approvedRecord()]);
    await runReconciliationPass();

    capella.failingWriteClusterIds = [];
    const result = await runReconciliationPass();

    expect(result).toEqual({ performed: 1, skipped: 0, failed: 0 });
    expect((await getCluster("c1"))?.actionOutcome).toBe("performed");
  });

  it("fails without calling Capella when the org is no longer configured", async () => {
    settings = makeSettings({ capellaOrgs: [], slackBotToken: "xoxb-test", forgottenHours: 72 });
    await upsertClusters([approvedRecord()]);

    const result = await runReconciliationPass();

    expect(result).toEqual({ performed: 0, skipped: 0, failed: 1 });
    expect(capellaCalls.turnOffCluster).toEqual([]);
    expect((await getCluster("c1"))?.workflowNote).toContain("org-1");
  });

  it("tells the owner it will retry", async () => {
    capella.failingWriteClusterIds = ["c1"];
    await upsertClusters([approvedRecord()]);

    await runReconciliationPass();

    expect(slack.updates.at(-1)?.text).toContain("will retry");
  });
});

describe("clusters the pass must leave alone", () => {
  it("ignores a cluster with no approved decision", async () => {
    await upsertClusters([approvedRecord({ consentStatus: "pending" })]);

    expect(await runReconciliationPass()).toEqual({ performed: 0, skipped: 0, failed: 0 });
    expect(capellaCalls.turnOffCluster).toEqual([]);
  });

  it("ignores an approved decision already performed", async () => {
    await upsertClusters([approvedRecord({ actionOutcome: "performed" })]);

    expect(await runReconciliationPass()).toEqual({ performed: 0, skipped: 0, failed: 0 });
    expect(capellaCalls.turnOffCluster).toEqual([]);
  });

  it("acts only on the approved cluster when others are present", async () => {
    await upsertClusters([
      approvedRecord(),
      approvedRecord({ clusterId: "c-untouched", consentStatus: "none", slackMessageTs: null }),
    ]);

    const result = await runReconciliationPass();

    expect(result).toEqual({ performed: 1, skipped: 0, failed: 0 });
    expect(capellaCalls.turnOffCluster).toEqual(["c1"]);
    expect((await getCluster("c-untouched"))?.actionOutcome).toBe("none");
  });
});

describe("the outcome write preserves concurrent changes", () => {
  it("does not clobber a field written while the Capella call was in flight", async () => {
    await upsertClusters([approvedRecord()]);

    // applyActionOutcome re-reads the record fresh right before writing, rather
    // than upserting the snapshot the pass started with, precisely because
    // turnOffCluster can take up to 120s. Park inside that call and write to
    // the same row to prove the re-read actually protects it.
    const gate = createGate();
    capella.hooks.beforeClusterWrite = gate.arrive;
    const pass = runReconciliationPass();
    await gate.reached;

    const inFlight = await getCluster("c1");
    await upsertClusters([
      { ...inFlight!, snoozeJustification: "written mid-flight", snoozeCount: 7 },
    ]);

    gate.release();
    const result = await pass;

    expect(result).toEqual({ performed: 1, skipped: 0, failed: 0 });
    const after = await getCluster("c1");
    // The pass's own business.
    expect(after?.actionOutcome).toBe("performed");
    expect(after?.config.status).toBe("turningOff");
    // Everything else must have survived - writing back the pass's stale
    // snapshot would have silently reverted both of these.
    expect(after?.snoozeJustification).toBe("written mid-flight");
    expect(after?.snoozeCount).toBe(7);
  });

  it("reports the outcome on the message the decision came from, not one written mid-flight", async () => {
    await upsertClusters([approvedRecord()]);

    const gate = createGate();
    capella.hooks.beforeClusterWrite = gate.arrive;
    const pass = runReconciliationPass();
    await gate.reached;

    // A concurrent sync cycle opens a whole new consent ask for the same
    // cluster while the write is in flight, moving slackMessageTs.
    const inFlight = await getCluster("c1");
    await upsertClusters([{ ...inFlight!, slackMessageTs: "9999999999.99999" }]);

    gate.release();
    await pass;

    // The outcome must land on the message tied to *this* decision - editing
    // the new one would clobber a pending ask the owner still needs to answer.
    // See NotifyTarget's comment in reconciliation.ts.
    expect(slack.updates.at(-1)?.messageTs).toBe("1767225600.00001");
  });
});
