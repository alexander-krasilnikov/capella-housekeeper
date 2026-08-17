/**
 * Proves the integration harness's central assumption before anything is built
 * on top of it: that mocking the `db` module from a test file which imports
 * `sync.ts` actually intercepts the `getDb()` call made *inside* `store.ts`,
 * two modules down the import chain.
 *
 * If this silently didn't hold, every integration test would quietly read and
 * write the real ./data/store.sqlite3 while appearing to pass - corrupting a
 * developer's actual cluster history and, worse, producing tests whose results
 * depend on whatever happens to be on that disk. Vitest keys mocks on the
 * resolved module path, so `./db` here and `./db` as imported by store.ts
 * should be the same module - this asserts it rather than trusting it.
 *
 * See design.md Decision 6 / task 3.1 in the harden-test-suite change.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";

let db: DatabaseSync;

/** Records every getDb() call the production code makes through the mocked module. */
let getDbCalls = 0;

vi.mock("./db", async () => {
  const actual = await vi.importActual<typeof import("./db")>("./db");
  return {
    ...actual,
    getDb: () => {
      getDbCalls += 1;
      return db;
    },
  };
});

// Faked so importing sync.ts never reaches the network. Nothing in this file
// exercises them; the point is only that sync.ts is in the module graph, so
// the mock has to survive being reached through it.
vi.mock("./capellaClient", async () => {
  const actual = await vi.importActual<typeof import("./capellaClient")>("./capellaClient");
  return {
    ...actual,
    getOrganization: vi.fn(),
    getUser: vi.fn(),
    listProjects: vi.fn(async () => []),
    listClusters: vi.fn(async () => []),
    getActivityLog: vi.fn(async () => []),
    getBillingUsage: vi.fn(),
  };
});

// The import that makes this test meaningful: store.ts is reached *through*
// sync.ts, not imported directly, which is the arrangement every integration
// test will use.
const { runSyncCycle } = await import("./sync");
const { readClusters, upsertClusters } = await import("./store");
const { bootstrapSchema, dbPath } = await import("./db");
const { makeClusterRecord } = await import("../test/factories");

beforeEach(() => {
  getDbCalls = 0;
  db = new DatabaseSync(":memory:");
  bootstrapSchema(db);
});

describe("the db module mock reaches store.ts from a sync.ts-importing test", () => {
  it("routes writes into this test's in-memory database", async () => {
    await upsertClusters([makeClusterRecord({ clusterId: "boundary-check" })]);

    // Read straight off the in-memory handle, bypassing store.ts entirely -
    // if the mock had missed, this table would be empty and the row would have
    // landed on disk instead.
    const rows = db.prepare("SELECT clusterId FROM clusters").all() as { clusterId: string }[];
    expect(rows).toEqual([{ clusterId: "boundary-check" }]);
    expect(getDbCalls).toBeGreaterThan(0);
  });

  it("routes reads through the same database", async () => {
    await upsertClusters([makeClusterRecord({ clusterId: "boundary-check" })]);

    expect((await readClusters()).map((c) => c.clusterId)).toEqual(["boundary-check"]);
  });

  it("gives each test a genuinely fresh database", async () => {
    // The previous test inserted a row; a leaked connection would show it here.
    expect(await readClusters()).toEqual([]);
  });

  it("is still intercepted when store.ts is reached through runSyncCycle", async () => {
    // Zero configured orgs, so this cycle does no API work - but it still
    // performs store.ts's readClusters/upsertClusters/purgeExpiredHistory
    // against whatever getDb() returns.
    const result = await runSyncCycle();

    expect(result).toMatchObject({ syncedClusters: 0, orgsSynced: 0 });
    expect(getDbCalls).toBeGreaterThan(0);
  });

  it("never opens the real on-disk database", async () => {
    const realPath = dbPath();
    const statBefore = fs.existsSync(realPath) ? fs.statSync(realPath).mtimeMs : null;

    await upsertClusters([makeClusterRecord({ clusterId: "boundary-check" })]);
    await runSyncCycle();

    const statAfter = fs.existsSync(realPath) ? fs.statSync(realPath).mtimeMs : null;
    expect(statAfter).toBe(statBefore);
    // No sidecar appeared either, which is what a real WAL-mode open would
    // leave behind even for a read.
    expect(fs.existsSync(`${realPath}-wal`) && statBefore === null).toBe(false);
  });
});
