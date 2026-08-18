import { ageHoursBetween } from "./format";
import type { Recency, LastActivitySource, Settings } from "../types";

/**
 * A cluster is "Fresh" whenever its last-known activity - real, or its
 * own creation date standing in when no real signal exists yet (see
 * sync.ts's resolveActivityFromSyncObservation) - is within the grace
 * window, checked from the first sync rather than only as a rescue once a
 * cluster is already old. Unknown activity is ignored entirely, so an
 * unobservable cluster tiers purely on age instead of being assumed active.
 */
export function computeRecency(
  ageHoursSinceCreation: number,
  lastActivityMs: number | null,
  lastActivitySource: LastActivitySource,
  nowMs: number,
  settings: Settings,
): Recency {
  const heldByActivity =
    lastActivitySource !== "unknown" &&
    lastActivityMs !== null &&
    ageHoursBetween(lastActivityMs, nowMs) <= settings.activityGraceHours;

  if (heldByActivity) return "Fresh";

  return ageHoursSinceCreation < settings.forgottenHours ? "Aging" : "Old";
}
