import { beforeEach, describe, expect, it, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import {
  makeClusterRecord as makeRecord,
  makeClusterSnapshot as snapshot,
} from "../test/factories";

// Same in-memory-database pattern as store.test.ts/settings.test.ts.
let db: DatabaseSync;

vi.mock("./db", async () => {
  const actual = await vi.importActual<typeof import("./db")>("./db");
  return { ...actual, getDb: () => db };
});

const { appendHistory } = await import("./store");
const { describeAuditEntry, getClusterHistory, getLifecycleAuditLog } = await import("./historyView");
const { bootstrapSchema } = await import("./db");

beforeEach(() => {
  db = new DatabaseSync(":memory:");
  bootstrapSchema(db);
});

describe("getClusterHistory", () => {
  it("returns entries most-recent-first, diffed in chronological order, with an empty diff on the oldest entry", async () => {
    await appendHistory([
      snapshot({ record: makeRecord({ consentStatus: "none" }), takenAt: "2026-01-02T00:00:00.000Z" }),
      snapshot({ record: makeRecord({ consentStatus: "pending" }), takenAt: "2026-01-01T00:00:00.000Z" }),
    ]);
    const entries = await getClusterHistory("c1");
    expect(entries).toHaveLength(2);
    expect(entries[0].takenAt).toBe("2026-01-02T00:00:00.000Z");
    expect(entries[0].changes.map((c) => c.field)).toEqual(["consentStatus"]);
    expect(entries[1].takenAt).toBe("2026-01-01T00:00:00.000Z");
    expect(entries[1].changes).toEqual([]);
  });

  it("only returns entries for the requested cluster", async () => {
    await appendHistory([
      snapshot({ record: makeRecord({ clusterId: "c1" }) }),
      snapshot({ record: makeRecord({ clusterId: "c2" }) }),
    ]);
    expect(await getClusterHistory("c1")).toHaveLength(1);
    expect(await getClusterHistory("c2")).toHaveLength(1);
  });
});

describe("getLifecycleAuditLog", () => {
  it("excludes entries whose only differences are routine config/cost drift", async () => {
    await appendHistory([
      snapshot({ record: makeRecord(), takenAt: "2026-01-01T00:00:00.000Z" }),
      snapshot({
        record: makeRecord({ config: { ...makeRecord().config, nodeCount: 4 } }),
        takenAt: "2026-01-02T00:00:00.000Z",
      }),
    ]);
    expect(await getLifecycleAuditLog()).toEqual([]);
  });

  it("includes entries with a consent/lifecycle field change, most recent first", async () => {
    await appendHistory([
      snapshot({ record: makeRecord({ consentStatus: "none" }), takenAt: "2026-01-01T00:00:00.000Z" }),
      snapshot({ record: makeRecord({ consentStatus: "pending" }), takenAt: "2026-01-02T00:00:00.000Z" }),
      snapshot({
        record: makeRecord({ consentStatus: "approved-turnoff" }),
        takenAt: "2026-01-03T00:00:00.000Z",
        trigger: "slack-decision",
      }),
    ]);
    const log = await getLifecycleAuditLog();
    expect(log.map((e) => e.takenAt)).toEqual(["2026-01-03T00:00:00.000Z", "2026-01-02T00:00:00.000Z"]);
  });

  it("carries the record's persisted workflowNote onto the audit entry", async () => {
    await appendHistory([
      snapshot({ record: makeRecord({ consentStatus: "pending" }), takenAt: "2026-01-01T00:00:00.000Z" }),
      snapshot({
        record: makeRecord({
          consentStatus: "approved-turnoff",
          workflowNote: "no response was received within the configured window",
        }),
        takenAt: "2026-01-02T00:00:00.000Z",
      }),
    ]);
    const log = await getLifecycleAuditLog();
    const entry = log.find((e) => e.takenAt === "2026-01-02T00:00:00.000Z");
    expect(entry?.workflowNote).toBe("no response was received within the configured window");
  });

  it("includes a deleted cluster's lifecycle entries (no join against live clusters.json)", async () => {
    await appendHistory([
      snapshot({ record: makeRecord({ clusterId: "gone", consentStatus: "none" }), takenAt: "2026-01-01T00:00:00.000Z" }),
      snapshot({
        record: makeRecord({ clusterId: "gone", consentStatus: "approved-delete" }),
        takenAt: "2026-01-02T00:00:00.000Z",
      }),
      snapshot({
        record: makeRecord({ clusterId: "gone", consentStatus: "approved-delete", actionOutcome: "performed", deletedAt: "2026-01-03T00:00:00.000Z" }),
        takenAt: "2026-01-03T00:00:00.000Z",
        trigger: "reconciliation",
      }),
    ]);
    const log = await getLifecycleAuditLog();
    expect(log.some((e) => e.clusterId === "gone")).toBe(true);
  });
});

function makeAuditEntry(overrides: Partial<Parameters<typeof describeAuditEntry>[0]> = {}): Parameters<typeof describeAuditEntry>[0] {
  return {
    clusterId: "c1",
    clusterName: "test-cluster",
    orgName: "Org",
    projectName: "Project",
    takenAt: "2026-01-01T00:00:00.000Z",
    trigger: "sync",
    consentStatus: "none",
    actionOutcome: "none",
    workflowNote: null,
    changes: [],
    ...overrides,
  };
}

describe("describeAuditEntry", () => {
  it("narrates a consent notification with the trigger phrase", () => {
    const text = describeAuditEntry(
      makeAuditEntry({
        consentStatus: "pending",
        changes: [{ field: "consentStatus", label: "Consent status", from: "none", to: "pending" }],
      }),
    );
    expect(text).toBe("Notified owner - detected during sync");
  });

  it("narrates an owner's own Slack approval distinctly from a system-triggered one", () => {
    const text = describeAuditEntry(
      makeAuditEntry({
        trigger: "slack-decision",
        consentStatus: "approved-turnoff",
        changes: [{ field: "consentStatus", label: "Consent status", from: "pending", to: "approved-turnoff" }],
      }),
    );
    expect(text).toBe("Owner approved turn-off - via Slack");
  });

  it("narrates an expiry-triggered auto turn-off (detected during the sync batch) distinctly from an owner's own approval", () => {
    const text = describeAuditEntry(
      makeAuditEntry({
        trigger: "sync",
        consentStatus: "approved-turnoff",
        changes: [{ field: "consentStatus", label: "Consent status", from: "pending", to: "approved-turnoff" }],
      }),
    );
    expect(text).toBe("Auto turn-off triggered - detected during sync");
  });

  it("narrates a snooze-cap-triggered auto turn-off with its own distinct trigger phrase", () => {
    const text = describeAuditEntry(
      makeAuditEntry({
        trigger: "auto-turnoff-decision",
        consentStatus: "approved-turnoff",
        changes: [{ field: "consentStatus", label: "Consent status", from: "pending", to: "approved-turnoff" }],
      }),
    );
    expect(text).toBe("Auto turn-off triggered - snooze limit reached");
  });

  it("appends the persisted workflowNote to an auto-triggered turn-off, but not to an owner's own Slack approval", () => {
    const auto = describeAuditEntry(
      makeAuditEntry({
        trigger: "sync",
        consentStatus: "approved-turnoff",
        workflowNote: "no response was received within the configured window",
        changes: [{ field: "consentStatus", label: "Consent status", from: "pending", to: "approved-turnoff" }],
      }),
    );
    expect(auto).toBe(
      "Auto turn-off triggered - detected during sync (no response was received within the configured window)",
    );

    const ownerClick = describeAuditEntry(
      makeAuditEntry({
        trigger: "slack-decision",
        consentStatus: "approved-turnoff",
        workflowNote: null,
        changes: [{ field: "consentStatus", label: "Consent status", from: "pending", to: "approved-turnoff" }],
      }),
    );
    expect(ownerClick).toBe("Owner approved turn-off - via Slack");
  });

  it("appends the persisted workflowNote to a skipped or failed reconciliation outcome", () => {
    const skipped = describeAuditEntry(
      makeAuditEntry({
        trigger: "reconciliation",
        consentStatus: "approved-turnoff",
        actionOutcome: "skipped",
        workflowNote: "the cluster no longer warranted the action by the time of re-verification",
        changes: [{ field: "actionOutcome", label: "Action outcome", from: "none", to: "skipped" }],
      }),
    );
    expect(skipped).toBe(
      "Turn-off skipped (tier changed) - reconciliation (the cluster no longer warranted the action by the time of re-verification)",
    );

    const failed = describeAuditEntry(
      makeAuditEntry({
        trigger: "reconciliation",
        consentStatus: "approved-delete",
        actionOutcome: "failed",
        workflowNote: "500: internal error",
        changes: [{ field: "actionOutcome", label: "Action outcome", from: "none", to: "failed" }],
      }),
    );
    expect(failed).toBe("Delete failed - reconciliation (500: internal error)");
  });

  it("narrates a reconciliation-performed turn-off using the record's current consentStatus, not the raw actionOutcome delta", () => {
    const text = describeAuditEntry(
      makeAuditEntry({
        trigger: "reconciliation",
        consentStatus: "approved-turnoff",
        actionOutcome: "performed",
        changes: [{ field: "actionOutcome", label: "Action outcome", from: "none", to: "performed" }],
      }),
    );
    expect(text).toBe("Turned off - reconciliation");
  });

  it("narrates a reconciliation-performed delete distinctly from a turn-off", () => {
    const text = describeAuditEntry(
      makeAuditEntry({
        trigger: "reconciliation",
        consentStatus: "approved-delete",
        actionOutcome: "performed",
        changes: [{ field: "actionOutcome", label: "Action outcome", from: "none", to: "performed" }],
      }),
    );
    expect(text).toBe("Deleted - reconciliation");
  });

  it("regression: a tier-change reset (actionOutcome -> none alongside consentStatus -> none) never prints the raw \"none\" value", () => {
    // A previously-resolved decision (approved-turnoff/performed) whose tier
    // changed again later - applyConsentNotifications resets both fields to
    // "none" in the same entry. This is the exact shape that used to render
    // as the literal string "none" before this fix.
    const text = describeAuditEntry(
      makeAuditEntry({
        consentStatus: "none",
        actionOutcome: "none",
        changes: [
          { field: "consentStatus", label: "Consent status", from: "approved-turnoff", to: "none" },
          { field: "actionOutcome", label: "Action outcome", from: "performed", to: "none" },
        ],
      }),
    );
    expect(text).toBe("Consent cycle cleared - detected during sync");
    expect(text).not.toContain("none -");
  });
});
