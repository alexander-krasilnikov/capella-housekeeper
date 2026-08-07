import { ageHoursBetween } from "./format";
import type { AgeStatus, LastActivitySource, Settings } from "../types";

/**
 * A cluster is "In Use" whenever its last-known activity - real, or its
 * own creation date standing in when no real signal exists yet (see
 * sync.ts's resolveActivityFromSyncObservation) - is within the grace
 * window, checked from the first sync rather than only as a rescue once a
 * cluster is already old. Unknown activity is ignored entirely, so an
 * unobservable cluster tiers purely on age instead of being assumed active.
 */
export function computeAgeStatus(
  ageHoursSinceCreation: number,
  lastActivityMs: number | null,
  lastActivitySource: LastActivitySource,
  nowMs: number,
  settings: Settings,
): AgeStatus {
  const heldByActivity =
    lastActivitySource !== "unknown" &&
    lastActivityMs !== null &&
    ageHoursBetween(lastActivityMs, nowMs) <= settings.activityGraceHours;

  if (heldByActivity) return "In Use";

  return ageHoursSinceCreation < settings.forgottenHours ? "Stale" : "Forgotten";
}
