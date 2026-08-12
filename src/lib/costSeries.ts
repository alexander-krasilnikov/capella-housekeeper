/** A cost reading for one cluster at one moment - `amountUsd` is Capella's month-to-date figure, or null when it wasn't available (no billing access, credits-based org, or a fetch error). */
export interface CostSnapshot {
  clusterId: string;
  takenAtMs: number;
  amountUsd: number | null;
}

/**
 * Per-day spend derived from month-to-date cost readings.
 *
 * Capella's billing endpoint reports spend cumulatively from the 1st of the
 * current month (see `getBillingUsage` in capellaClient.ts), so a day's spend
 * is the *increase* in that running total across the day, not the value
 * itself. A decrease means the total reset for a new billing month, in which
 * case the day's spend is the new total.
 *
 * `dayBoundariesMs` must be ascending, length n+1 for n days - day i spans
 * `[dayBoundariesMs[i], dayBoundariesMs[i+1])`. Boundaries are supplied by the
 * caller rather than computed here because which calendar day a timestamp
 * falls into depends on the viewer's timezone, which only the browser knows.
 *
 * Returns one entry per day. An entry is `null` - not `0` - when the readings
 * don't support a figure for that day, so "we don't know" is never rendered as
 * "nothing was spent". Readings are carried forward across gaps (a null
 * reading means the number was unavailable at that instant, not that spend
 * dropped to zero), but a day whose *start* has no known reading yields null:
 * a month-to-date total already includes spend from earlier in the month, so
 * attributing all of it to the first day it was observed would overstate that
 * day.
 */
export function dailySpendFromSnapshots(
  snapshots: CostSnapshot[],
  dayBoundariesMs: number[],
): (number | null)[] {
  const dayCount = Math.max(0, dayBoundariesMs.length - 1);
  if (dayCount === 0) return [];

  const byCluster = new Map<string, CostSnapshot[]>();
  for (const snapshot of snapshots) {
    const existing = byCluster.get(snapshot.clusterId);
    if (existing) existing.push(snapshot);
    else byCluster.set(snapshot.clusterId, [snapshot]);
  }

  const totals: (number | null)[] = Array.from({ length: dayCount }, () => null);

  for (const readings of byCluster.values()) {
    const ordered = [...readings].sort((a, b) => a.takenAtMs - b.takenAtMs);

    // Last known month-to-date total at each day boundary.
    const runningTotal: (number | null)[] = [];
    let cursor = 0;
    let lastKnown: number | null = null;
    for (const boundary of dayBoundariesMs) {
      while (cursor < ordered.length && ordered[cursor].takenAtMs <= boundary) {
        const { amountUsd } = ordered[cursor];
        if (amountUsd !== null) lastKnown = amountUsd;
        cursor++;
      }
      runningTotal.push(lastKnown);
    }

    for (let day = 0; day < dayCount; day++) {
      const start = runningTotal[day];
      const end = runningTotal[day + 1];
      if (start === null || end === null) continue;
      const spend = end >= start ? end - start : end;
      totals[day] = (totals[day] ?? 0) + spend;
    }
  }

  return totals;
}
