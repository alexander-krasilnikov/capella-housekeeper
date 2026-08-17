// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import DashboardTabs from "./DashboardTabs";
import type { ConsentAndActionHealth } from "@/lib/consentActionHealth";

// Node's own built-in `localStorage` global (present without
// --localstorage-file since Node 22+) shadows jsdom's per-window
// implementation and is unusable, leaving `window.localStorage` undefined -
// ClusterTable persists its column config there, so stub it before mounting.
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

const EMPTY_HEALTH: ConsentAndActionHealth = {
  funnel: { approved: 0, snoozed: 0, expired: 0, pending: 0 },
  actions: { manual: 0, autoDecided: 0, slackApproved: 0 },
};

describe("DashboardTabs", () => {
  it("renders the existing stat-tile row alongside the new Consent & Action Health section", () => {
    render(
      <DashboardTabs
        clusterRows={[]}
        historyRows={[]}
        costSnapshots={[]}
        clusterLifetimes={[]}
        consentActionHealth={EMPTY_HEALTH}
        initialSlackStatus={{ status: "disabled", detail: "", updatedAt: 0 }}
        developerTurnOnEnabled={false}
        initialSidebarCollapsed={false}
        initialTab="clusters"
      />,
    );

    // "Total Clusters" and "Cluster Owners" are deliberately gone - see
    // consent-action-health-stats spec "Total Clusters tile is removed" /
    // "Cluster Owners tile is removed".
    expect(screen.queryByText("Total Clusters")).toBeNull();
    expect(screen.queryByText("Cluster Owners")).toBeNull();
    expect(screen.getByText("Cluster Count")).toBeTruthy();
    expect(screen.getByText("Daily Spend")).toBeTruthy();

    // New panels, in the same row as the charts above, not a separate section.
    expect(screen.getByText("Consent Cycles (7d)")).toBeTruthy();
    expect(screen.getByText("Actions Taken (7d)")).toBeTruthy();
  });
});
