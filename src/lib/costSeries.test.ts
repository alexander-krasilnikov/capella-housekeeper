import { describe, expect, it } from "vitest";
import { dailySpendFromSnapshots, type CostSnapshot } from "./costSeries";

const DAY = 24 * 60 * 60 * 1000;
/** Three day buckets: day 0 = [0, DAY), day 1 = [DAY, 2*DAY), day 2 = [2*DAY, 3*DAY). */
const BOUNDARIES = [0, DAY, 2 * DAY, 3 * DAY];

function snapshot(takenAtMs: number, amountUsd: number | null, clusterId = "c1"): CostSnapshot {
  return { clusterId, takenAtMs, amountUsd };
}

describe("dailySpendFromSnapshots", () => {
  it("reports the increase in the month-to-date total, not the total itself", () => {
    const result = dailySpendFromSnapshots(
      [snapshot(0, 10), snapshot(DAY, 25), snapshot(2 * DAY, 40), snapshot(3 * DAY, 45)],
      BOUNDARIES,
    );
    expect(result).toEqual([15, 15, 5]);
  });

  it("treats a decrease as a new billing month, crediting the day with the new total", () => {
    const result = dailySpendFromSnapshots(
      [snapshot(0, 10), snapshot(DAY, 300), snapshot(2 * DAY, 4), snapshot(3 * DAY, 9)],
      BOUNDARIES,
    );
    // Day 1 resets from 300 to 4 - that day's spend is the new total, not -296.
    expect(result).toEqual([290, 4, 5]);
  });

  it("sums across clusters", () => {
    const result = dailySpendFromSnapshots(
      [
        snapshot(0, 10, "a"),
        snapshot(DAY, 20, "a"),
        snapshot(0, 100, "b"),
        snapshot(DAY, 130, "b"),
      ],
      [0, DAY],
    );
    expect(result).toEqual([40]);
  });

  it("carries a reading forward across days with no snapshot", () => {
    // Nothing recorded during day 1; the day-0 total still stands at its end.
    const result = dailySpendFromSnapshots([snapshot(0, 10), snapshot(3 * DAY, 10)], BOUNDARIES);
    expect(result).toEqual([0, 0, 0]);
  });

  it("returns null - not 0 - until a day has a known total at both ends", () => {
    // The first reading lands inside day 1, so day 1 has no total at its start:
    // the 50 it reports is month-to-date and covers spend from before the
    // window, which must not be attributed to day 1 alone. Day 2 has known
    // totals at both ends (50 -> 60) and is the first day with a real figure.
    const result = dailySpendFromSnapshots([snapshot(DAY + 1, 50), snapshot(2 * DAY + 1, 60)], BOUNDARIES);
    expect(result).toEqual([null, null, 10]);
  });

  it("returns all nulls when no reading ever carried a value", () => {
    const result = dailySpendFromSnapshots(
      [snapshot(0, null), snapshot(DAY, null), snapshot(2 * DAY, null)],
      BOUNDARIES,
    );
    expect(result).toEqual([null, null, null]);
  });

  it("ignores unavailable readings rather than treating them as zero spend", () => {
    // The null at day 1 must not read as "total dropped to 0" (which would
    // otherwise look like a billing-month reset and invent a spend figure).
    const result = dailySpendFromSnapshots(
      [snapshot(0, 10), snapshot(DAY, null), snapshot(2 * DAY, 30)],
      BOUNDARIES,
    );
    expect(result).toEqual([0, 20, 0]);
  });

  it("returns an empty series when given fewer than two boundaries", () => {
    expect(dailySpendFromSnapshots([snapshot(0, 10)], [0])).toEqual([]);
    expect(dailySpendFromSnapshots([snapshot(0, 10)], [])).toEqual([]);
  });
});
