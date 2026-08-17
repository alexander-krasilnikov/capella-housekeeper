import { describe, expect, it } from "vitest";
import { computeFieldChanges, isLifecycleChange } from "./historyFields";
import { makeClusterRecord as makeRecord } from "../test/factories";

describe("computeFieldChanges", () => {
  it("returns no changes for the first entry (no prior)", () => {
    expect(computeFieldChanges(null, makeRecord())).toEqual([]);
  });

  it("returns no changes when nothing meaningful differs", () => {
    const a = makeRecord();
    const b = makeRecord({ lastSyncedAt: "2026-02-01T00:00:00.000Z" });
    expect(computeFieldChanges(a, b)).toEqual([]);
  });

  it("describes a configuration change in human-readable form", () => {
    const a = makeRecord();
    const b = makeRecord({ config: { ...a.config, nodeCount: 4 } });
    const changes = computeFieldChanges(a, b);
    expect(changes).toHaveLength(1);
    expect(changes[0].field).toBe("config");
    expect(changes[0].from).toContain("3×");
    expect(changes[0].to).toContain("4×");
  });

  it("describes a consent status change", () => {
    const a = makeRecord({ consentStatus: "pending" });
    const b = makeRecord({ consentStatus: "approved-turnoff" });
    const changes = computeFieldChanges(a, b);
    expect(changes).toEqual([{ field: "consentStatus", label: "Consent status", from: "pending", to: "approved-turnoff" }]);
  });

  it("describes a snooze-count change", () => {
    const a = makeRecord({ snoozeCount: 1 });
    const b = makeRecord({ snoozeCount: 2 });
    expect(computeFieldChanges(a, b)).toEqual([{ field: "snoozeCount", label: "Snoozes used", from: "1", to: "2" }]);
  });

  it("reports every changed field when several differ at once", () => {
    const a = makeRecord({ consentStatus: "pending", remindersSent: 0 });
    const b = makeRecord({ consentStatus: "pending", remindersSent: 1 });
    // Only remindersSent actually differs here - sanity check multi-field detection separately below.
    expect(computeFieldChanges(a, b).map((c) => c.field)).toEqual(["remindersSent"]);

    const c = makeRecord({ consentStatus: "pending", actionOutcome: "none" });
    const d = makeRecord({ consentStatus: "approved-delete", actionOutcome: "performed" });
    expect(computeFieldChanges(c, d).map((change) => change.field).sort()).toEqual(["actionOutcome", "consentStatus"]);
  });
});

describe("isLifecycleChange", () => {
  it("is false when only routine config/cost fields changed", () => {
    const a = makeRecord();
    const b = makeRecord({ config: { ...a.config, nodeCount: 5 }, actualCost: { amountUsd: 200, asOf: a.actualCost.asOf } });
    expect(isLifecycleChange(computeFieldChanges(a, b))).toBe(false);
  });

  it("is true when a consent/lifecycle field changed", () => {
    const a = makeRecord({ consentStatus: "none" });
    const b = makeRecord({ consentStatus: "pending" });
    expect(isLifecycleChange(computeFieldChanges(a, b))).toBe(true);
  });

  it("is true when a lifecycle field changes alongside a routine one", () => {
    const a = makeRecord({ consentStatus: "approved-turnoff", actionOutcome: "none" });
    const b = makeRecord({
      consentStatus: "approved-turnoff",
      actionOutcome: "performed",
      config: { ...a.config, status: "turnedOff" },
    });
    expect(isLifecycleChange(computeFieldChanges(a, b))).toBe(true);
  });

  it("is false for the first entry (no prior to compare against)", () => {
    expect(isLifecycleChange(computeFieldChanges(null, makeRecord()))).toBe(false);
  });
});
