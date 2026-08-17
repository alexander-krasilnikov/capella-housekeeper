// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ClusterHistoryButton from "./ClusterHistoryButton";
import type { HistoryTimelineEntry } from "@/lib/historyView";

const getClusterHistoryAction = vi.fn<() => Promise<HistoryTimelineEntry[]>>();
vi.mock("../actions", () => ({ getClusterHistoryAction: () => getClusterHistoryAction() }));

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

const ENTRIES: HistoryTimelineEntry[] = [
  { takenAt: "2026-01-02T00:00:00.000Z", trigger: "manual-turn-off", clusterName: "c1", changes: [] },
  { takenAt: "2026-01-01T00:00:00.000Z", trigger: "sync", clusterName: "c1", changes: [] },
];

async function openHistory() {
  fireEvent.click(screen.getByRole("button", { name: "History" }));
  await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());
  await waitFor(() => expect(screen.getByText("Showing 1–2 of 2")).toBeTruthy());
}

describe("ClusterHistoryButton", () => {
  it("shows the pagination footer alongside the table when there are matching rows", async () => {
    getClusterHistoryAction.mockResolvedValue(ENTRIES);
    render(<ClusterHistoryButton clusterId="c1" clusterName="test-cluster" />);
    await openHistory();

    expect(screen.getByText("Rows per page")).toBeTruthy();
  });

  it("hides the pagination footer (not just the table) when a search matches zero rows", async () => {
    getClusterHistoryAction.mockResolvedValue(ENTRIES);
    render(<ClusterHistoryButton clusterId="c1" clusterName="test-cluster" />);
    await openHistory();

    fireEvent.change(screen.getByPlaceholderText("Search history…"), { target: { value: "nothing-matches-this" } });

    await waitFor(() => expect(screen.getByText(/No events match/)).toBeTruthy());
    expect(screen.queryByText("Rows per page")).toBeNull();
    expect(screen.queryByText(/^Showing/)).toBeNull();
  });
});
