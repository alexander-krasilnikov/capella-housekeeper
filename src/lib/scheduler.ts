import { readSettings } from "./settings";
import { runSyncCycle } from "./sync";

let started = false;

/**
 * Starts the interval-driven sync loop once, in-process. Relies on this app
 * always running as a single long-lived Node server (see design.md) - there
 * is no cross-instance coordination.
 *
 * Self-reschedules via setTimeout rather than a single setInterval captured
 * at startup, so a sync-interval change made in Settings takes effect on the
 * next tick without a restart - the interval is re-read from settings after
 * every cycle, not fixed for the process's lifetime.
 */
export function startSyncScheduler(): void {
  if (started) return;
  started = true;

  const scheduleNext = async () => {
    try {
      const result = await runSyncCycle();
      console.log(
        `[sync] synced ${result.syncedClusters} clusters across ${result.orgsSynced} org(s)` +
          (result.purgedClusterIds.length
            ? `, purged ${result.purgedClusterIds.length} expired tombstone(s)`
            : "") +
          (result.failedOrgIds.length ? `, ${result.failedOrgIds.length} org(s) failed: ${result.failedOrgIds.join(", ")}` : ""),
      );
    } catch (err) {
      console.error("[sync] cycle failed:", err);
    }

    const { syncIntervalHours } = await readSettings();
    setTimeout(scheduleNext, syncIntervalHours * 60 * 60 * 1000);
  };

  scheduleNext();
}
