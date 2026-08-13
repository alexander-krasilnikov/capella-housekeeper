import { describe, expect, it } from "vitest";
import { classifyClusterStatus } from "./capellaClient";

describe("classifyClusterStatus", () => {
  it("classifies an in-progress transition separately from its terminal state", () => {
    // Regression check for the bug this bucketing replaces: a label regex
    // (`/off/i`) used to put "Turning Off" and "Turned Off" in the same
    // bucket (and thus the same badge color). See cluster-dashboard-ui's
    // "Operational status badge reflects Capella's own state semantics".
    expect(classifyClusterStatus("turningOff")).toBe("transitioning");
    expect(classifyClusterStatus("turnedOff")).toBe("off");
    expect(classifyClusterStatus("turningOff")).not.toBe(classifyClusterStatus("turnedOff"));
  });

  it("classifies the turn-on transition separately from active", () => {
    expect(classifyClusterStatus("turningOn")).toBe("transitioning");
    expect(classifyClusterStatus("healthy")).toBe("active");
  });

  it("classifies destroying as transitioning", () => {
    expect(classifyClusterStatus("destroying")).toBe("transitioning");
  });

  it("treats an unavailable status as active, matching cluster-sync's existing behavior", () => {
    expect(classifyClusterStatus(null)).toBe("active");
  });

  it("falls back to unknown for a value not in the declared bucket lists", () => {
    // Covers both a genuinely unrecognized value and one of Capella's own
    // non-final failure states (e.g. "degraded", "turningOffFailed") that
    // this classification deliberately doesn't force into active/off.
    expect(classifyClusterStatus("someFutureState")).toBe("unknown");
    expect(classifyClusterStatus("degraded")).toBe("unknown");
  });
});
