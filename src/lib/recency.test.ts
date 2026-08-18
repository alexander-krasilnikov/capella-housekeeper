/**
 * The tier classifier. Twenty-seven lines that decide which clusters get
 * turned off and deleted, previously reached only transitively by other
 * suites' tests.
 */
import { describe, expect, it } from "vitest";
import { computeRecency } from "./recency";
import { makeSettings } from "../test/factories";

const settings = makeSettings({ activityGraceHours: 24, forgottenHours: 72 });

const NOW = new Date("2026-03-01T00:00:00.000Z").getTime();
const HOUR = 60 * 60 * 1000;

/** `lastActivityMs` for activity `hours` before now. */
const hoursAgo = (hours: number) => NOW - hours * HOUR;

describe("activity holds a cluster Fresh", () => {
  it("counts activity inside the grace window, however old the cluster is", () => {
    expect(computeRecency(10_000, hoursAgo(1), "activity-log", NOW, settings)).toBe("Fresh");
  });

  it("counts activity exactly at the grace boundary", () => {
    // `<=` in the implementation - the boundary hour still counts as Fresh.
    expect(computeRecency(10_000, hoursAgo(24), "activity-log", NOW, settings)).toBe("Fresh");
  });

  it("does not count activity past the grace boundary", () => {
    expect(computeRecency(10_000, hoursAgo(25), "activity-log", NOW, settings)).toBe("Old");
  });

  it("holds a young cluster Fresh via its own creation date standing in", () => {
    // sync.ts seeds lastActivityAt from createdAt when there is no real signal,
    // so a freshly created cluster is Fresh from its first sync - see
    // resolveActivityFromSyncObservation.
    expect(computeRecency(2, hoursAgo(2), "sync-observed", NOW, settings)).toBe("Fresh");
  });
});

describe("unobservable clusters tier on age alone", () => {
  it("ignores an activity timestamp whose source is unknown", () => {
    // An unobservable cluster must not be assumed active - see the comment on
    // computeRecency.
    expect(computeRecency(10_000, hoursAgo(1), "unknown", NOW, settings)).toBe("Old");
  });

  it("ignores a null activity timestamp", () => {
    expect(computeRecency(10_000, null, "activity-log", NOW, settings)).toBe("Old");
  });

  it("still tiers a young unobservable cluster as Aging rather than Old", () => {
    expect(computeRecency(1, null, "unknown", NOW, settings)).toBe("Aging");
  });
});

describe("the Aging / Old boundary", () => {
  it("is Aging below the threshold", () => {
    expect(computeRecency(71, null, "unknown", NOW, settings)).toBe("Aging");
  });

  it("is Old at exactly the threshold", () => {
    // `<` in the implementation, so the threshold hour itself is Old.
    expect(computeRecency(72, null, "unknown", NOW, settings)).toBe("Old");
  });

  it("is Old above the threshold", () => {
    expect(computeRecency(73, null, "unknown", NOW, settings)).toBe("Old");
  });

  it("respects a reconfigured threshold rather than a hardcoded one", () => {
    const strict = makeSettings({ activityGraceHours: 24, forgottenHours: 1 });
    expect(computeRecency(2, null, "unknown", NOW, strict)).toBe("Old");

    const lenient = makeSettings({ activityGraceHours: 24, forgottenHours: 10_000 });
    expect(computeRecency(500, null, "unknown", NOW, lenient)).toBe("Aging");
  });

  it("treats a zero-hour-old cluster with no activity signal as Aging", () => {
    expect(computeRecency(0, null, "unknown", NOW, settings)).toBe("Aging");
  });
});

describe("activity in the future", () => {
  it("does not throw a cluster out of Fresh for a slightly-ahead timestamp", () => {
    // Clock skew between Capella and this host is plausible; a negative age
    // must not read as "older than the grace window".
    expect(computeRecency(10_000, NOW + HOUR, "activity-log", NOW, settings)).toBe("Fresh");
  });
});
