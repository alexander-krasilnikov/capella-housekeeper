import { config } from "../config";
import { runSyncCycle } from "./sync";

let started = false;

/**
 * Starts the interval-driven sync loop once, in-process. Relies on this app
 * always running as a single long-lived Node server (see design.md) - there
 * is no cross-instance coordination.
 */
export function startSyncScheduler(): void {
  if (started) return;
  started = true;

  const tick = async () => {
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
  };

  tick();
  setInterval(tick, config.syncIntervalMs);
}
