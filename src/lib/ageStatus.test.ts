/**
 * The tier classifier. Twenty-seven lines that decide which clusters get
 * turned off and deleted, previously reached only transitively by other
 * suites' tests.
 */
import { describe, expect, it } from "vitest";
import { computeAgeStatus } from "./ageStatus";
import { makeSettings } from "../test/factories";

const settings = makeSettings({ activityGraceHours: 24, forgottenHours: 72 });

const NOW = new Date("2026-03-01T00:00:00.000Z").getTime();
const HOUR = 60 * 60 * 1000;

/** `lastActivityMs` for activity `hours` before now. */
const hoursAgo = (hours: number) => NOW - hours * HOUR;

describe("activity holds a cluster In Use", () => {
  it("counts activity inside the grace window, however old the cluster is", () => {
    expect(computeAgeStatus(10_000, hoursAgo(1), "activity-log", NOW, settings)).toBe("In Use");
  });

  it("counts activity exactly at the grace boundary", () => {
    // `<=` in the implementation - the boundary hour still counts as In Use.
    expect(computeAgeStatus(10_000, hoursAgo(24), "activity-log", NOW, settings)).toBe("In Use");
  });

  it("does not count activity past the grace boundary", () => {
    expect(computeAgeStatus(10_000, hoursAgo(25), "activity-log", NOW, settings)).toBe("Forgotten");
  });

  it("holds a young cluster In Use via its own creation date standing in", () => {
    // sync.ts seeds lastActivityAt from createdAt when there is no real signal,
    // so a freshly created cluster is In Use from its first sync - see
    // resolveActivityFromSyncObservation.
    expect(computeAgeStatus(2, hoursAgo(2), "sync-observed", NOW, settings)).toBe("In Use");
  });
});

describe("unobservable clusters tier on age alone", () => {
  it("ignores an activity timestamp whose source is unknown", () => {
    // An unobservable cluster must not be assumed active - see the comment on
    // computeAgeStatus.
    expect(computeAgeStatus(10_000, hoursAgo(1), "unknown", NOW, settings)).toBe("Forgotten");
  });

  it("ignores a null activity timestamp", () => {
    expect(computeAgeStatus(10_000, null, "activity-log", NOW, settings)).toBe("Forgotten");
  });

  it("still tiers a young unobservable cluster as Stale rather than Forgotten", () => {
    expect(computeAgeStatus(1, null, "unknown", NOW, settings)).toBe("Stale");
  });
});

describe("the Stale / Forgotten boundary", () => {
  it("is Stale below the threshold", () => {
    expect(computeAgeStatus(71, null, "unknown", NOW, settings)).toBe("Stale");
  });

  it("is Forgotten at exactly the threshold", () => {
    // `<` in the implementation, so the threshold hour itself is Forgotten.
    expect(computeAgeStatus(72, null, "unknown", NOW, settings)).toBe("Forgotten");
  });

  it("is Forgotten above the threshold", () => {
    expect(computeAgeStatus(73, null, "unknown", NOW, settings)).toBe("Forgotten");
  });

  it("respects a reconfigured threshold rather than a hardcoded one", () => {
    const strict = makeSettings({ activityGraceHours: 24, forgottenHours: 1 });
    expect(computeAgeStatus(2, null, "unknown", NOW, strict)).toBe("Forgotten");

    const lenient = makeSettings({ activityGraceHours: 24, forgottenHours: 10_000 });
    expect(computeAgeStatus(500, null, "unknown", NOW, lenient)).toBe("Stale");
  });

  it("treats a zero-hour-old cluster with no activity signal as Stale", () => {
    expect(computeAgeStatus(0, null, "unknown", NOW, settings)).toBe("Stale");
  });
});

describe("activity in the future", () => {
  it("does not throw a cluster out of In Use for a slightly-ahead timestamp", () => {
    // Clock skew between Capella and this host is plausible; a negative age
    // must not read as "older than the grace window".
    expect(computeAgeStatus(10_000, NOW + HOUR, "activity-log", NOW, settings)).toBe("In Use");
  });
});
