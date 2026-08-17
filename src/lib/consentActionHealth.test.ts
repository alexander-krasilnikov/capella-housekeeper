import { describe, expect, it } from "vitest";
import {
  actionsWithin,
  cyclesStartedWithin,
  reconstructConsentAndActionHistory,
  summarizeActions,
  summarizeConsentAndActionHealth,
  summarizeFunnel,
  type ConsentCycle,
  type ReconstructedAction,
} from "./consentActionHealth";
import type { AuditLogEntry } from "./historyFields";
import type { ConsentActionOutcome, ConsentStatus, HistoryTrigger } from "../types";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const BASE = Date.parse("2026-01-01T00:00:00.000Z");

function entry(overrides: {
  takenAtMs: number;
  trigger: HistoryTrigger;
  consentStatus: ConsentStatus;
  actionOutcome?: ConsentActionOutcome;
  changedFields?: { field: string; from: string; to: string }[];
  clusterId?: string;
}): AuditLogEntry {
  return {
    clusterId: overrides.clusterId ?? "c1",
    clusterName: "test-cluster",
    orgName: "Org",
    projectName: "Project",
    takenAt: new Date(overrides.takenAtMs).toISOString(),
    trigger: overrides.trigger,
    consentStatus: overrides.consentStatus,
    actionOutcome: overrides.actionOutcome ?? "none",
    workflowNote: null,
    changes: (overrides.changedFields ?? []).map((c) => ({ field: c.field, label: c.field, from: c.from, to: c.to })),
  };
}

describe("reconstructConsentAndActionHistory - cycles", () => {
  it("reconstructs a cycle that starts and fully resolves, even once consentStatus has reset to none", () => {
    const entries: AuditLogEntry[] = [
      entry({
        takenAtMs: BASE,
        trigger: "sync",
        consentStatus: "pending",
        changedFields: [{ field: "consentStatus", from: "none", to: "pending" }],
      }),
      entry({
        takenAtMs: BASE + 2 * HOUR,
        trigger: "slack-decision",
        consentStatus: "approved-turnoff",
        changedFields: [{ field: "consentStatus", from: "pending", to: "approved-turnoff" }],
      }),
      entry({
        takenAtMs: BASE + 3 * HOUR,
        trigger: "reconciliation",
        consentStatus: "approved-turnoff",
        actionOutcome: "performed",
        changedFields: [{ field: "actionOutcome", from: "none", to: "performed" }],
      }),
      entry({
        takenAtMs: BASE + 3 * HOUR + 1,
        trigger: "sync",
        consentStatus: "none",
        changedFields: [{ field: "consentStatus", from: "approved-turnoff", to: "none" }],
      }),
    ];

    const { cycles } = reconstructConsentAndActionHistory(entries);
    expect(cycles).toEqual<ConsentCycle[]>([
      {
        clusterId: "c1",
        clusterName: "test-cluster",
        startedAtMs: BASE,
        outcome: "approved",
        resolvedAtMs: BASE + 2 * HOUR,
      },
    ]);
  });

  it("excludes a cycle that started before the window even though it resolves inside it", () => {
    const startedAtMs = BASE - 10 * DAY;
    const entries: AuditLogEntry[] = [
      entry({
        takenAtMs: startedAtMs,
        trigger: "sync",
        consentStatus: "pending",
        changedFields: [{ field: "consentStatus", from: "none", to: "pending" }],
      }),
      entry({
        takenAtMs: BASE - 2 * HOUR,
        trigger: "slack-decision",
        consentStatus: "approved-turnoff",
        changedFields: [{ field: "consentStatus", from: "pending", to: "approved-turnoff" }],
      }),
    ];

    const { cycles } = reconstructConsentAndActionHistory(entries);
    expect(cyclesStartedWithin(cycles, BASE - 7 * DAY)).toEqual([]);
  });

  it("reports a cycle that started within the window and has no further transition as still pending", () => {
    const startedAtMs = BASE - 1 * DAY;
    const entries: AuditLogEntry[] = [
      entry({
        takenAtMs: startedAtMs,
        trigger: "sync",
        consentStatus: "pending",
        changedFields: [{ field: "consentStatus", from: "none", to: "pending" }],
      }),
    ];

    const { cycles } = reconstructConsentAndActionHistory(entries);
    const windowed = cyclesStartedWithin(cycles, BASE - 7 * DAY);
    expect(windowed).toEqual<ConsentCycle[]>([
      { clusterId: "c1", clusterName: "test-cluster", startedAtMs, outcome: "pending", resolvedAtMs: null },
    ]);
  });

  it("recognizes a snooze-resume (snoozed -> pending) as a cycle start, not only none -> pending", () => {
    const entries: AuditLogEntry[] = [
      entry({
        takenAtMs: BASE,
        trigger: "sync",
        consentStatus: "snoozed",
        changedFields: [{ field: "consentStatus", from: "none", to: "snoozed" }],
      }),
      entry({
        takenAtMs: BASE + HOUR,
        trigger: "sync",
        consentStatus: "pending",
        changedFields: [{ field: "consentStatus", from: "snoozed", to: "pending" }],
      }),
      entry({
        takenAtMs: BASE + 2 * HOUR,
        trigger: "sync",
        consentStatus: "expired",
        changedFields: [{ field: "consentStatus", from: "pending", to: "expired" }],
      }),
    ];

    const { cycles } = reconstructConsentAndActionHistory(entries);
    expect(cycles).toEqual<ConsentCycle[]>([
      {
        clusterId: "c1",
        clusterName: "test-cluster",
        startedAtMs: BASE + HOUR,
        outcome: "expired",
        resolvedAtMs: BASE + 2 * HOUR,
      },
    ]);
  });

  it("recognizes an age-tier transition's collapsed reset (prior terminal status straight to pending) as a cycle start", () => {
    // applyConsentNotifications resets consentStatus to "none" and, in the
    // same synchronous pass, sets it to "pending" before any history
    // snapshot is written - so the persisted diff never shows "none".
    const entries: AuditLogEntry[] = [
      entry({
        takenAtMs: BASE,
        trigger: "sync",
        consentStatus: "pending",
        changedFields: [{ field: "consentStatus", from: "expired", to: "pending" }],
      }),
      entry({
        takenAtMs: BASE + HOUR,
        trigger: "slack-decision",
        consentStatus: "approved-turnoff",
        changedFields: [{ field: "consentStatus", from: "pending", to: "approved-turnoff" }],
      }),
    ];

    const { cycles } = reconstructConsentAndActionHistory(entries);
    expect(cycles).toEqual<ConsentCycle[]>([
      { clusterId: "c1", clusterName: "test-cluster", startedAtMs: BASE, outcome: "approved", resolvedAtMs: BASE + HOUR },
    ]);
  });

  it("discards a cancelled cycle (reset to none) instead of counting it as any outcome", () => {
    const entries: AuditLogEntry[] = [
      entry({
        takenAtMs: BASE,
        trigger: "sync",
        consentStatus: "pending",
        changedFields: [{ field: "consentStatus", from: "none", to: "pending" }],
      }),
      entry({
        takenAtMs: BASE + HOUR,
        trigger: "sync",
        consentStatus: "none",
        changedFields: [{ field: "consentStatus", from: "pending", to: "none" }],
      }),
    ];

    const { cycles } = reconstructConsentAndActionHistory(entries);
    expect(cycles).toEqual([]);
  });

  it("does not resurrect a cancelled cycle's stale start time as a later still-pending cycle", () => {
    const entries: AuditLogEntry[] = [
      entry({
        takenAtMs: BASE - 5 * DAY,
        trigger: "sync",
        consentStatus: "pending",
        changedFields: [{ field: "consentStatus", from: "none", to: "pending" }],
      }),
      entry({
        // Age-tier changed back before the first cycle resolved - cancelled.
        takenAtMs: BASE - 4 * DAY,
        trigger: "sync",
        consentStatus: "none",
        changedFields: [{ field: "consentStatus", from: "pending", to: "none" }],
      }),
    ];

    const { cycles } = reconstructConsentAndActionHistory(entries);
    // No trailing "still pending" cycle should be flushed using the
    // cancelled cycle's stale BASE-5*DAY start time.
    expect(cycles).toEqual([]);
  });
});

describe("summarizeFunnel", () => {
  function cycle(overrides: Partial<ConsentCycle>): ConsentCycle {
    return {
      clusterId: "c1",
      clusterName: "test-cluster",
      startedAtMs: BASE,
      outcome: "approved",
      resolvedAtMs: BASE + HOUR,
      ...overrides,
    };
  }

  it("counts mixed outcomes as raw counts, not percentages", () => {
    const cycles: ConsentCycle[] = [
      cycle({ outcome: "approved" }),
      cycle({ outcome: "approved" }),
      cycle({ outcome: "snoozed", resolvedAtMs: BASE + HOUR }),
      cycle({ outcome: "expired", resolvedAtMs: BASE + HOUR }),
      cycle({ outcome: "pending", resolvedAtMs: null }),
    ];

    const funnel = summarizeFunnel(cycles);
    expect(funnel.approved).toBe(2);
    expect(funnel.snoozed).toBe(1);
    expect(funnel.expired).toBe(1);
    expect(funnel.pending).toBe(1);
  });

  it("returns explicit zero counts for every outcome when there are no cycles", () => {
    const funnel = summarizeFunnel([]);
    expect(funnel).toEqual({ approved: 0, snoozed: 0, expired: 0, pending: 0 });
  });
});

describe("action attribution", () => {
  it("attributes a direct manual turn-off as manual, with no consent cycle involved", () => {
    const entries: AuditLogEntry[] = [
      entry({ takenAtMs: BASE, trigger: "manual-turn-off", consentStatus: "none" }),
    ];
    const { actions, cycles } = reconstructConsentAndActionHistory(entries);
    expect(cycles).toEqual([]);
    expect(actions).toEqual<ReconstructedAction[]>([
      { clusterId: "c1", clusterName: "test-cluster", performedAtMs: BASE, category: "manual" },
    ]);
  });

  it("attributes a same-entry decide-and-act snooze-limit timeout as auto-decided", () => {
    const entries: AuditLogEntry[] = [
      entry({
        takenAtMs: BASE,
        trigger: "sync",
        consentStatus: "pending",
        changedFields: [{ field: "consentStatus", from: "none", to: "pending" }],
      }),
      entry({
        takenAtMs: BASE + HOUR,
        trigger: "auto-turnoff-decision",
        consentStatus: "approved-turnoff",
        actionOutcome: "performed",
        changedFields: [
          { field: "consentStatus", from: "pending", to: "approved-turnoff" },
          { field: "actionOutcome", from: "none", to: "performed" },
        ],
      }),
    ];

    const { actions } = reconstructConsentAndActionHistory(entries);
    expect(actions).toEqual<ReconstructedAction[]>([
      { clusterId: "c1", clusterName: "test-cluster", performedAtMs: BASE + HOUR, category: "auto-decided" },
    ]);
  });

  it("attributes a Slack approval later carried out by reconciliation as slack-approved", () => {
    const entries: AuditLogEntry[] = [
      entry({
        takenAtMs: BASE,
        trigger: "sync",
        consentStatus: "pending",
        changedFields: [{ field: "consentStatus", from: "none", to: "pending" }],
      }),
      entry({
        takenAtMs: BASE + HOUR,
        trigger: "slack-decision",
        consentStatus: "approved-delete",
        changedFields: [{ field: "consentStatus", from: "pending", to: "approved-delete" }],
      }),
      entry({
        takenAtMs: BASE + 2 * HOUR,
        trigger: "reconciliation",
        consentStatus: "approved-delete",
        actionOutcome: "performed",
        changedFields: [{ field: "actionOutcome", from: "none", to: "performed" }],
      }),
    ];

    const { actions } = reconstructConsentAndActionHistory(entries);
    expect(actions).toEqual<ReconstructedAction[]>([
      { clusterId: "c1", clusterName: "test-cluster", performedAtMs: BASE + 2 * HOUR, category: "slack-approved" },
    ]);
  });

  it("attributes a Slack approval that resumed from a snooze correctly, not as auto-decided", () => {
    const entries: AuditLogEntry[] = [
      entry({
        takenAtMs: BASE,
        trigger: "sync",
        consentStatus: "snoozed",
        changedFields: [{ field: "consentStatus", from: "none", to: "snoozed" }],
      }),
      entry({
        takenAtMs: BASE + HOUR,
        trigger: "sync",
        consentStatus: "pending",
        changedFields: [{ field: "consentStatus", from: "snoozed", to: "pending" }],
      }),
      entry({
        takenAtMs: BASE + 2 * HOUR,
        trigger: "slack-decision",
        consentStatus: "approved-turnoff",
        changedFields: [{ field: "consentStatus", from: "pending", to: "approved-turnoff" }],
      }),
      entry({
        takenAtMs: BASE + 3 * HOUR,
        trigger: "reconciliation",
        consentStatus: "approved-turnoff",
        actionOutcome: "performed",
        changedFields: [{ field: "actionOutcome", from: "none", to: "performed" }],
      }),
    ];

    const { actions } = reconstructConsentAndActionHistory(entries);
    expect(actions).toEqual<ReconstructedAction[]>([
      { clusterId: "c1", clusterName: "test-cluster", performedAtMs: BASE + 3 * HOUR, category: "slack-approved" },
    ]);
  });

  it("returns explicit zero counts for every category when there are no actions", () => {
    expect(summarizeActions([])).toEqual({ manual: 0, autoDecided: 0, slackApproved: 0 });
  });

  it("windows actions by their performed timestamp", () => {
    const actions: ReconstructedAction[] = [
      { clusterId: "c1", clusterName: "old", performedAtMs: BASE - 10 * DAY, category: "manual" },
      { clusterId: "c1", clusterName: "recent", performedAtMs: BASE - 1 * HOUR, category: "manual" },
    ];
    expect(actionsWithin(actions, BASE - 7 * DAY)).toHaveLength(1);
  });
});

describe("summarizeConsentAndActionHealth", () => {
  it("composes reconstruction, windowing, and aggregation for both panels", () => {
    const entries: AuditLogEntry[] = [
      entry({
        takenAtMs: BASE - 2 * DAY,
        trigger: "sync",
        consentStatus: "pending",
        changedFields: [{ field: "consentStatus", from: "none", to: "pending" }],
      }),
      entry({
        takenAtMs: BASE - 1 * DAY,
        trigger: "slack-decision",
        consentStatus: "approved-turnoff",
        changedFields: [{ field: "consentStatus", from: "pending", to: "approved-turnoff" }],
      }),
      entry({
        takenAtMs: BASE - 12 * HOUR,
        trigger: "reconciliation",
        consentStatus: "approved-turnoff",
        actionOutcome: "performed",
        changedFields: [{ field: "actionOutcome", from: "none", to: "performed" }],
      }),
      entry({ takenAtMs: BASE - 6 * HOUR, trigger: "manual-delete", consentStatus: "none", clusterId: "c2" }),
    ];

    const health = summarizeConsentAndActionHealth(entries, BASE);
    expect(health.funnel.approved).toBe(1);
    expect(health.actions.slackApproved).toBe(1);
    expect(health.actions.manual).toBe(1);
  });

  it("still traces lineage across the window boundary via the lookback, within its bound", () => {
    // Approval happened 20 days before "now" (outside the 7-day display
    // window, but within the 30-day lookback) - the resulting action,
    // performed inside the window, must still be attributed correctly.
    const entries: AuditLogEntry[] = [
      entry({
        takenAtMs: BASE - 20 * DAY,
        trigger: "sync",
        consentStatus: "pending",
        changedFields: [{ field: "consentStatus", from: "none", to: "pending" }],
      }),
      entry({
        takenAtMs: BASE - 19 * DAY,
        trigger: "slack-decision",
        consentStatus: "approved-turnoff",
        changedFields: [{ field: "consentStatus", from: "pending", to: "approved-turnoff" }],
      }),
      entry({
        takenAtMs: BASE - 1 * HOUR,
        trigger: "reconciliation",
        consentStatus: "approved-turnoff",
        actionOutcome: "performed",
        changedFields: [{ field: "actionOutcome", from: "none", to: "performed" }],
      }),
    ];

    const health = summarizeConsentAndActionHealth(entries, BASE);
    expect(health.actions.slackApproved).toBe(1);
    expect(health.actions.autoDecided).toBe(0);
  });
});
