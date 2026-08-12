/** When a cluster existed. `deletedAtMs` is null while it still exists. A cluster that is merely turned off is still "existing" - only deletion ends a lifetime. */
export interface ClusterLifetime {
  clusterId: string;
  createdAtMs: number;
  deletedAtMs: number | null;
}

/**
 * Peak number of clusters that existed simultaneously during each day.
 *
 * Counts clusters that exist, regardless of whether they are running or
 * turned off - only deletion removes one from the count.
 *
 * `dayBoundariesMs` must be ascending, length n+1 for n days: day i spans
 * `[dayBoundariesMs[i], dayBoundariesMs[i+1])`. Boundaries are supplied by the
 * caller because which calendar day a timestamp falls into depends on the
 * viewer's timezone, which only the browser knows.
 *
 * The daily figure is the maximum concurrent count, not the number that
 * existed at any point in the day: if one cluster is deleted in the morning
 * and another created in the afternoon, the peak is 1, not 2. Creations are
 * applied before deletions at an identical timestamp, so the peak is never
 * understated by tie ordering.
 */
export function maxClustersPerDay(lifetimes: ClusterLifetime[], dayBoundariesMs: number[]): number[] {
  const dayCount = Math.max(0, dayBoundariesMs.length - 1);
  if (dayCount === 0) return [];

  const perDay: number[] = [];
  for (let day = 0; day < dayCount; day++) {
    const start = dayBoundariesMs[day];
    const end = dayBoundariesMs[day + 1];

    let running = 0;
    const events: { atMs: number; delta: number }[] = [];
    for (const lifetime of lifetimes) {
      const aliveAtStart =
        lifetime.createdAtMs <= start && (lifetime.deletedAtMs === null || lifetime.deletedAtMs > start);
      if (aliveAtStart) running++;
      if (lifetime.createdAtMs > start && lifetime.createdAtMs < end) {
        events.push({ atMs: lifetime.createdAtMs, delta: 1 });
      }
      if (lifetime.deletedAtMs !== null && lifetime.deletedAtMs > start && lifetime.deletedAtMs < end) {
        events.push({ atMs: lifetime.deletedAtMs, delta: -1 });
      }
    }

    events.sort((a, b) => a.atMs - b.atMs || b.delta - a.delta);
    let peak = running;
    for (const event of events) {
      running += event.delta;
      if (running > peak) peak = running;
    }
    perDay.push(peak);
  }

  return perDay;
}
