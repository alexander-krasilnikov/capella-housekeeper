import { describe, expect, it } from "vitest";
import { groupBy } from "./groupBy";

describe("groupBy", () => {
  it("groups items by key, preserving insertion order within each group", () => {
    const items = [
      { id: "a", group: "x" },
      { id: "b", group: "y" },
      { id: "c", group: "x" },
    ];
    const grouped = groupBy(items, (i) => i.group);
    expect(grouped.get("x")).toEqual([items[0], items[2]]);
    expect(grouped.get("y")).toEqual([items[1]]);
  });

  it("returns an empty map for an empty input", () => {
    expect(groupBy([], (i: never) => i)).toEqual(new Map());
  });
});
