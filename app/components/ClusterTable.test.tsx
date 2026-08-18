// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import ClusterTable, { type ClusterRow } from "./ClusterTable";

// Node's own built-in `localStorage` global shadows jsdom's per-window
// implementation and is unusable, leaving `window.localStorage` undefined -
// ClusterTable persists its column config there, so stub it before mounting.
// See DashboardTabs.test.tsx for the same stub.
beforeAll(() => {
  const store = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: (key: string) => store.delete(key),
      clear: () => store.clear(),
    },
  });
});

afterEach(cleanup);

const ROW: ClusterRow = {
  clusterId: "c1",
  orgId: "org1",
  projectId: "proj1",
  org: "Org",
  project: "Project",
  name: "test-cluster",
  createdAtMs: Date.parse("2026-01-01T00:00:00.000Z"),
  ageLabel: "1d",
  ageDays: 1,
  lastActivityMs: null,
  owner: "owner@example.com",
  configSummary: "1x 4vCPU/16GB, aws/us-east-1",
  couchbaseVersion: "8.0.0",
  actualCost: null,
  actualCostAsOfMs: null,
  actualCostUnavailableReason: null,
  statusLabel: "Healthy",
  statusBucket: "active",
  statusIsOff: false,
  ownerEligibleForAsk: true,
  recency: "Aging",
  consentStatus: "none",
  actionOutcome: "none",
  snoozeUntilMs: null,
  snoozeJustification: null,
  consentStatusChangedAtMs: null,
  workflowNote: null,
  lastSyncedAtMs: Date.parse("2026-01-01T00:00:00.000Z"),
};

describe("ClusterTable with a persisted column config from before a column rename", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("does not log a console error for a stale sorting/columnOrder id no column has anymore", () => {
    // Simulates an operator who customized sorting/order before the
    // rename-age-status-to-recency change renamed the "ageStatus" column to
    // "recency" - their saved blob still names the old id.
    window.localStorage.setItem(
      "capella-housekeeper:table-config:v1",
      JSON.stringify({
        sorting: [{ id: "ageStatus", desc: true }],
        columnOrder: ["name", "ageStatus", "owner"],
      }),
    );

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    render(<ClusterTable rows={[ROW]} />);

    const tableColumnErrors = errorSpy.mock.calls.filter(([msg]) =>
      typeof msg === "string" && msg.includes("does not exist"),
    );
    expect(tableColumnErrors).toEqual([]);

    errorSpy.mockRestore();
  });
});
