import { beforeEach, describe, expect, it, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { DEFAULT_SETTINGS } from "../types";

// Every test gets a fresh in-memory database, exactly like store.test.ts -
// this is the file a bug once wiped for real (see org-credential-resolution-fix
// design.md), so it must never touch the real ./data/store.sqlite3 this repo
// ships with.
let db: DatabaseSync;

vi.mock("./db", async () => {
  const actual = await vi.importActual<typeof import("./db")>("./db");
  return { ...actual, getDb: () => db };
});

const { readSettings, writeSettings } = await import("./settings");
const { bootstrapSchema } = await import("./db");

beforeEach(() => {
  db = new DatabaseSync(":memory:");
  bootstrapSchema(db);
});

describe("readSettings - first run", () => {
  it("creates and persists defaults when no settings row exists yet - nothing to lose", async () => {
    const settings = await readSettings();

    expect(settings.capellaOrgs).toEqual([]);
    expect(db.prepare("SELECT COUNT(*) AS n FROM settings").get()).toEqual({ n: 1 });
  });

  it("seeds default tier notifications and snooze day options alongside the scalar row", async () => {
    await readSettings();

    expect(db.prepare("SELECT COUNT(*) AS n FROM tier_notifications").get()).toEqual({ n: 2 });
    expect((db.prepare("SELECT days FROM snooze_day_options ORDER BY position").all() as { days: number }[]).map((r) => r.days)).toEqual(
      DEFAULT_SETTINGS.snoozeDayOptions,
    );
  });
});

describe("readSettings - never wipes real configuration on validation failure", () => {
  // Regression test for a real incident (see org-credential-resolution-fix and
  // settings-read-safety design docs): a present-but-invalid field must never
  // cause settings to be silently reset to defaults. The SQL schema's NOT
  // NULL columns make "a field is entirely missing" structurally impossible
  // on this path (see design.md "readSettings" doc comment) - what remains,
  // and what this guards, is a value written directly to the database that
  // fails cross-field validation.
  it("throws instead of persisting/resetting anything when a present field is invalid", async () => {
    await readSettings(); // seed a valid row first
    db.prepare("UPDATE settings SET activityGraceHours = ? WHERE id = 1").run("not-a-number");

    await expect(readSettings()).rejects.toThrow(/failed validation/i);

    // The critical assertion: nothing else on the row was touched - no
    // silent reset-to-defaults, however "helpful" that might have seemed.
    const row = db.prepare("SELECT dashboardUsername, sessionSecret FROM settings WHERE id = 1").get() as {
      dashboardUsername: string;
      sessionSecret: string;
    };
    expect(row.dashboardUsername).toBe(DEFAULT_SETTINGS.dashboardUsername);
    expect(row.sessionSecret).toBeTruthy();
  });

  it("does not touch the row even across repeated failed reads", async () => {
    await readSettings();
    db.prepare("UPDATE settings SET dashboardPassword = ? WHERE id = 1").run("");

    await expect(readSettings()).rejects.toThrow();
    await expect(readSettings()).rejects.toThrow();
    await expect(readSettings()).rejects.toThrow();

    const row = db.prepare("SELECT dashboardPassword FROM settings WHERE id = 1").get() as { dashboardPassword: string };
    expect(row.dashboardPassword).toBe("");
  });

  it("recovers normally once the offending field is fixed by hand", async () => {
    await readSettings();
    db.prepare("UPDATE settings SET activityGraceHours = ? WHERE id = 1").run("not-a-number");
    await expect(readSettings()).rejects.toThrow();

    // An operator fixes the value by hand.
    db.prepare("UPDATE settings SET activityGraceHours = ? WHERE id = 1").run(24);

    const settings = await readSettings();
    expect(settings.activityGraceHours).toBe(24);
  });
});

describe("readSettings/writeSettings - developerTurnOnEnabled", () => {
  it("defaults to false on first run", async () => {
    const settings = await readSettings();
    expect(settings.developerTurnOnEnabled).toBe(false);
  });

  it("round-trips a persisted true value", async () => {
    await readSettings();
    const result = await writeSettings({ developerTurnOnEnabled: true });
    expect(result.ok).toBe(true);

    const settings = await readSettings();
    expect(settings.developerTurnOnEnabled).toBe(true);
  });
});

describe("writeSettings - column/table isolation", () => {
  // The direct regression test for the incident this migration exists to
  // prevent structurally, not just by validation discipline - see
  // proposal.md "Why". A write naming only one field/table cannot touch any
  // other, by construction of the SQL statement itself.
  it("writing a scalar field (e.g. slackBotToken) never touches capellaOrgs", async () => {
    await readSettings();
    const seeded = await writeSettings({
      capellaOrgs: [{ id: "org-cfg-1", orgId: "org-1", orgName: "Org One", apiKey: "key-1" }],
    });
    expect(seeded.ok).toBe(true);

    const result = await writeSettings({ slackBotToken: "xoxb-new-token" });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.settings.capellaOrgs).toEqual([
      { id: "org-cfg-1", orgId: "org-1", orgName: "Org One", projectSummary: undefined, apiKey: "key-1" },
    ]);
  });

  it("writing capellaOrgs never touches unrelated scalar fields", async () => {
    await readSettings();
    await writeSettings({ slackBotToken: "xoxb-keep-me" });

    const result = await writeSettings({
      capellaOrgs: [{ id: "org-cfg-2", orgId: "org-2", apiKey: "key-2" }],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.settings.slackBotToken).toBe("xoxb-keep-me");
  });

  it("rejects an invalid merged value without persisting any part of the attempted write", async () => {
    await readSettings();
    const before = await readSettings();

    const result = await writeSettings({ activityGraceHours: -5 });

    expect(result.ok).toBe(false);
    const after = await readSettings();
    expect(after).toEqual(before);
  });
});
