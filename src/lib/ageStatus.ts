import { ageDaysBetween } from "./format";
import type { AgeStatus, LastActivitySource, Settings } from "../types";

/**
 * Known-and-recent activity holds a cluster at "Established" regardless of
 * age; unknown activity is ignored entirely, so an unobservable cluster
 * tiers purely on age instead of being assumed active or inactive.
 */
export function computeAgeStatus(
  ageDays: number,
  lastActivityMs: number | null,
  lastActivitySource: LastActivitySource,
  nowMs: number,
  settings: Settings,
): AgeStatus {
  const baseTier: AgeStatus =
    ageDays < settings.newDays
      ? "New"
      : ageDays < settings.staleDays
        ? "Established"
        : ageDays < settings.forgottenDays
          ? "Stale"
          : "Forgotten";

  if (baseTier === "New" || baseTier === "Established") return baseTier;

  const heldByRecentActivity =
    lastActivitySource !== "unknown" &&
    lastActivityMs !== null &&
    ageDaysBetween(lastActivityMs, nowMs) <= settings.inactivityGraceDays;

  return heldByRecentActivity ? "Established" : baseTier;
}
