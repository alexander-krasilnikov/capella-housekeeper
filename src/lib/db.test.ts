import { afterEach, describe, expect, it, vi } from "vitest";
import path from "node:path";

// db.ts reads CAPELLA_DATA_DIR into a module-level const at import time, so each
// scenario needs its own fresh module instance (vi.resetModules) rather than
// re-importing the already-cached module - see distribute-via-npx-tarball's
// design.md Decision 4.
const ORIGINAL_ENV = process.env.CAPELLA_DATA_DIR;

afterEach(() => {
  if (ORIGINAL_ENV === undefined) delete process.env.CAPELLA_DATA_DIR;
  else process.env.CAPELLA_DATA_DIR = ORIGINAL_ENV;
  vi.resetModules();
});

describe("dbPath", () => {
  it("resolves under ./data when CAPELLA_DATA_DIR is unset (source/dev behavior unchanged)", async () => {
    delete process.env.CAPELLA_DATA_DIR;
    vi.resetModules();
    const { dbPath } = await import("./db");
    expect(dbPath()).toBe(path.join("./data", "store.sqlite3"));
  });

  it("resolves under CAPELLA_DATA_DIR when it is set", async () => {
    process.env.CAPELLA_DATA_DIR = "/tmp/some-override-dir";
    vi.resetModules();
    const { dbPath } = await import("./db");
    expect(dbPath()).toBe(path.join("/tmp/some-override-dir", "store.sqlite3"));
  });
});
