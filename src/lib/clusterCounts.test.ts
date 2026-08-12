import { describe, expect, it } from "vitest";
import { maxClustersPerDay, type ClusterLifetime } from "./clusterCounts";

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
/** Three day buckets: day 0 = [0, DAY), day 1 = [DAY, 2*DAY), day 2 = [2*DAY, 3*DAY). */
const BOUNDARIES = [0, DAY, 2 * DAY, 3 * DAY];

function lifetime(createdAtMs: number, deletedAtMs: number | null, clusterId = "c1"): ClusterLifetime {
  return { clusterId, createdAtMs, deletedAtMs };
}

describe("maxClustersPerDay", () => {
  it("counts a cluster that spans the whole window on every day", () => {
    expect(maxClustersPerDay([lifetime(-DAY, null)], BOUNDARIES)).toEqual([1, 1, 1]);
  });

  it("counts turned-off clusters - only deletion ends a lifetime", () => {
    // No notion of running/off here at all: an existing cluster counts, and
    // this test pins that intent so a future "exclude stopped" change is loud.
    expect(maxClustersPerDay([lifetime(0, null), lifetime(0, null, "c2")], [0, DAY])).toEqual([2]);
  });

  it("includes a cluster from the day it is created", () => {
    const result = maxClustersPerDay([lifetime(DAY + 6 * HOUR, null)], BOUNDARIES);
    expect(result).toEqual([0, 1, 1]);
  });

  it("drops a cluster from days after it is deleted", () => {
    const result = maxClustersPerDay([lifetime(-DAY, DAY + 6 * HOUR)], BOUNDARIES);
    // Still present at the start of day 1, so day 1's peak is 1.
    expect(result).toEqual([1, 1, 0]);
  });

  it("reports the peak, not the number that existed at some point in the day", () => {
    // One deleted at 06:00, another created at 18:00 - never concurrent.
    const result = maxClustersPerDay(
      [lifetime(-DAY, 6 * HOUR, "gone"), lifetime(18 * HOUR, null, "new")],
      [0, DAY],
    );
    expect(result).toEqual([1]);
  });

  it("counts a cluster created and deleted within the same day", () => {
    const result = maxClustersPerDay(
      [lifetime(-DAY, null, "steady"), lifetime(6 * HOUR, 8 * HOUR, "brief")],
      [0, DAY],
    );
    expect(result).toEqual([2]);
  });

  it("ignores lifetimes entirely outside the window", () => {
    const result = maxClustersPerDay(
      [lifetime(-5 * DAY, -4 * DAY, "old"), lifetime(10 * DAY, null, "future")],
      BOUNDARIES,
    );
    expect(result).toEqual([0, 0, 0]);
  });

  it("treats a cluster created exactly on a boundary as present that day, without double counting", () => {
    expect(maxClustersPerDay([lifetime(DAY, null)], BOUNDARIES)).toEqual([0, 1, 1]);
  });

  it("returns an empty series when given fewer than two boundaries", () => {
    expect(maxClustersPerDay([lifetime(0, null)], [0])).toEqual([]);
    expect(maxClustersPerDay([lifetime(0, null)], [])).toEqual([]);
  });
});
