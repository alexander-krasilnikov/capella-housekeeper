import crypto from "node:crypto";
import {
  DEFAULT_SETTINGS,
  type NotifiableAgeStatus,
  type NotificationsByTier,
  type OrgConfig,
  type Settings,
  type TierNotificationConfig,
} from "../types";
import { fromSqliteBool, getDb, toSqliteBool } from "./db";

/** "In Use" is deliberately excluded - see NotifiableAgeStatus. */
const NOTIFIABLE_TIERS: NotifiableAgeStatus[] = ["Stale", "Forgotten"];

/** Scalar `Settings` fields that live directly as `settings` table columns - everything else (`capellaOrgs`, `notificationsByTier`, `snoozeDayOptions`) is a one-to-many relation with its own table (see design.md Decision 3). */
const SCALAR_SETTINGS_COLUMNS = [
  "activityGraceHours",
  "forgottenHours",
  "capellaApiBaseUrl",
  "syncIntervalHours",
  "retentionDays",
  "dashboardUsername",
  "dashboardPassword",
  "sessionSecret",
  "slackBotToken",
  "slackAppToken",
  "consentReminderMax",
  "consentExpiryDays",
  "developerTurnOnEnabled",
] as const;

type ScalarSettingsField = (typeof SCALAR_SETTINGS_COLUMNS)[number];

function isPositiveInteger(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v > 0;
}

function isNonNegativeInteger(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 0;
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function isHttpUrl(v: unknown): v is string {
  if (typeof v !== "string") return false;
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function isOrgConfigList(v: unknown): v is OrgConfig[] {
  if (!Array.isArray(v)) return false;
  return v.every((entry) => {
    if (typeof entry !== "object" || entry === null) return false;
    const { id, orgId, orgName, projectSummary, apiKey } = entry as Record<string, unknown>;
    if (!isNonEmptyString(id) || !isNonEmptyString(orgId) || !isNonEmptyString(apiKey)) return false;
    if (orgName !== undefined && typeof orgName !== "string") return false;
    if (projectSummary !== undefined && typeof projectSummary !== "string") return false;
    return true;
  });
}

function isTierNotificationConfig(v: unknown): v is TierNotificationConfig {
  if (typeof v !== "object" || v === null) return false;
  const { notify, askTurnOff, askDelete, autoTurnOffOnInaction, maxSnoozes } = v as Record<string, unknown>;
  return (
    typeof notify === "boolean" &&
    typeof askTurnOff === "boolean" &&
    typeof askDelete === "boolean" &&
    typeof autoTurnOffOnInaction === "boolean" &&
    isNonNegativeInteger(maxSnoozes)
  );
}

function isNotificationsByTier(v: unknown): v is NotificationsByTier {
  if (typeof v !== "object" || v === null) return false;
  const obj = v as Record<string, unknown>;
  return NOTIFIABLE_TIERS.every((tier) => isTierNotificationConfig(obj[tier]));
}

/** Non-empty, strictly ascending (so also implicitly distinct) positive integers. */
function isSnoozeDayOptionsList(v: unknown): v is number[] {
  if (!Array.isArray(v) || v.length === 0) return false;
  return v.every((n, i) => isPositiveInteger(n) && (i === 0 || (v[i - 1] as number) < n));
}

/** Positive integers, strictly increasing so each age-status tier's window is non-empty. */
export function validateSettings(input: unknown): Settings | null {
  if (typeof input !== "object" || input === null) return null;
  const {
    activityGraceHours,
    forgottenHours,
    capellaOrgs,
    capellaApiBaseUrl,
    syncIntervalHours,
    retentionDays,
    dashboardUsername,
    dashboardPassword,
    sessionSecret,
    slackBotToken,
    slackAppToken,
    notificationsByTier,
    consentReminderMax,
    consentExpiryDays,
    snoozeDayOptions,
    developerTurnOnEnabled,
  } = input as Record<string, unknown>;

  if (!isPositiveInteger(activityGraceHours) || !isPositiveInteger(forgottenHours)) {
    return null;
  }
  if (!(activityGraceHours < forgottenHours)) {
    return null;
  }

  if (!isOrgConfigList(capellaOrgs)) return null;
  if (!isHttpUrl(capellaApiBaseUrl)) return null;
  if (!isPositiveInteger(syncIntervalHours)) return null;
  if (!isPositiveInteger(retentionDays)) return null;
  if (!isNonEmptyString(dashboardUsername)) return null;
  if (!isNonEmptyString(dashboardPassword)) return null;
  if (!isNonEmptyString(sessionSecret)) return null;

  // Empty string means "not configured yet" for both tokens - unlike the
  // other required strings above, neither has a value before an operator
  // sets one, and notifications simply don't fire until both do.
  if (typeof slackBotToken !== "string") return null;
  if (typeof slackAppToken !== "string") return null;
  if (!isNotificationsByTier(notificationsByTier)) return null;
  if (!isPositiveInteger(consentReminderMax)) return null;
  if (!isPositiveInteger(consentExpiryDays)) return null;
  if (!isSnoozeDayOptionsList(snoozeDayOptions)) return null;
  if (typeof developerTurnOnEnabled !== "boolean") return null;

  return {
    activityGraceHours,
    forgottenHours,
    capellaOrgs: capellaOrgs.map((o) => ({
      id: o.id,
      orgId: o.orgId,
      orgName: o.orgName,
      projectSummary: o.projectSummary,
      apiKey: o.apiKey,
    })),
    capellaApiBaseUrl,
    syncIntervalHours,
    retentionDays,
    dashboardUsername,
    dashboardPassword,
    sessionSecret,
    slackBotToken,
    slackAppToken,
    notificationsByTier,
    consentReminderMax,
    consentExpiryDays,
    snoozeDayOptions,
    developerTurnOnEnabled,
  };
}

type Db = ReturnType<typeof getDb>;

/** Assembles a `Settings`-shaped object from the singleton `settings` row plus its three child tables - the SQL-native replacement for parsing one JSON blob. */
function assembleSettings(db: Db, row: Record<string, unknown>): unknown {
  const orgRows = db.prepare("SELECT * FROM org_configs ORDER BY position").all();
  const tierRows = db.prepare("SELECT * FROM tier_notifications").all() as Array<Record<string, unknown>>;
  const snoozeRows = db.prepare("SELECT days FROM snooze_day_options ORDER BY position").all() as Array<{ days: number }>;

  const notificationsByTier: Record<string, TierNotificationConfig> = {};
  for (const t of tierRows) {
    notificationsByTier[t.tier as string] = {
      notify: fromSqliteBool(t.notify as number),
      askTurnOff: fromSqliteBool(t.askTurnOff as number),
      askDelete: fromSqliteBool(t.askDelete as number),
      autoTurnOffOnInaction: fromSqliteBool(t.autoTurnOffOnInaction as number),
      maxSnoozes: t.maxSnoozes as number,
    };
  }

  return {
    activityGraceHours: row.activityGraceHours,
    forgottenHours: row.forgottenHours,
    capellaOrgs: (orgRows as Array<Record<string, unknown>>).map((o) => ({
      id: o.id,
      orgId: o.orgId,
      orgName: o.orgName ?? undefined,
      projectSummary: o.projectSummary ?? undefined,
      apiKey: o.apiKey,
    })),
    capellaApiBaseUrl: row.capellaApiBaseUrl,
    syncIntervalHours: row.syncIntervalHours,
    retentionDays: row.retentionDays,
    dashboardUsername: row.dashboardUsername,
    dashboardPassword: row.dashboardPassword,
    sessionSecret: row.sessionSecret,
    slackBotToken: row.slackBotToken,
    slackAppToken: row.slackAppToken,
    notificationsByTier,
    consentReminderMax: row.consentReminderMax,
    consentExpiryDays: row.consentExpiryDays,
    snoozeDayOptions: snoozeRows.map((r) => r.days),
    developerTurnOnEnabled: fromSqliteBool(row.developerTurnOnEnabled as number),
  };
}

function replaceOrgConfigs(db: Db, orgs: OrgConfig[]): void {
  db.prepare("DELETE FROM org_configs").run();
  const stmt = db.prepare(
    "INSERT INTO org_configs (id, orgId, orgName, projectSummary, apiKey, position) VALUES (@id, @orgId, @orgName, @projectSummary, @apiKey, @position)",
  );
  orgs.forEach((org, position) => {
    stmt.run({
      id: org.id,
      orgId: org.orgId,
      orgName: org.orgName ?? null,
      projectSummary: org.projectSummary ?? null,
      apiKey: org.apiKey,
      position,
    });
  });
}

function replaceTierNotifications(db: Db, tiers: NotificationsByTier): void {
  db.prepare("DELETE FROM tier_notifications").run();
  const stmt = db.prepare(
    "INSERT INTO tier_notifications (tier, notify, askTurnOff, askDelete, autoTurnOffOnInaction, maxSnoozes) VALUES (@tier, @notify, @askTurnOff, @askDelete, @autoTurnOffOnInaction, @maxSnoozes)",
  );
  for (const tier of NOTIFIABLE_TIERS) {
    const config = tiers[tier];
    stmt.run({
      tier,
      notify: toSqliteBool(config.notify),
      askTurnOff: toSqliteBool(config.askTurnOff),
      askDelete: toSqliteBool(config.askDelete),
      autoTurnOffOnInaction: toSqliteBool(config.autoTurnOffOnInaction),
      maxSnoozes: config.maxSnoozes,
    });
  }
}

function replaceSnoozeDayOptions(db: Db, days: number[]): void {
  db.prepare("DELETE FROM snooze_day_options").run();
  const stmt = db.prepare("INSERT INTO snooze_day_options (position, days) VALUES (@position, @days)");
  days.forEach((d, position) => stmt.run({ position, days: d }));
}

/** Inserts the singleton `settings` row (id = 1) - used for first-run seeding. Does not touch the child tables; call the `replace*` helpers separately. */
function insertSettingsRow(db: Db, settings: Settings): void {
  const columns = SCALAR_SETTINGS_COLUMNS;
  const placeholders = columns.map((c) => `@${c}`).join(", ");
  const values: Record<ScalarSettingsField | "id", string | number> = {
    id: 1,
    activityGraceHours: settings.activityGraceHours,
    forgottenHours: settings.forgottenHours,
    capellaApiBaseUrl: settings.capellaApiBaseUrl,
    syncIntervalHours: settings.syncIntervalHours,
    retentionDays: settings.retentionDays,
    dashboardUsername: settings.dashboardUsername,
    dashboardPassword: settings.dashboardPassword,
    sessionSecret: settings.sessionSecret,
    slackBotToken: settings.slackBotToken,
    slackAppToken: settings.slackAppToken,
    consentReminderMax: settings.consentReminderMax,
    consentExpiryDays: settings.consentExpiryDays,
    developerTurnOnEnabled: toSqliteBool(settings.developerTurnOnEnabled),
  };
  db.prepare(`INSERT INTO settings (id, ${columns.join(", ")}) VALUES (@id, ${placeholders})`).run(values);
}

/**
 * Inserts a fully-formed `Settings` object (scalar row plus all three child
 * tables) as a single unit - used for first-run seeding. Callers are
 * responsible for wrapping this in a transaction when it's part of a larger
 * operation.
 */
function insertFullSettings(db: Db, settings: Settings): void {
  insertSettingsRow(db, settings);
  replaceOrgConfigs(db, settings.capellaOrgs);
  replaceTierNotifications(db, settings.notificationsByTier);
  replaceSnoozeDayOptions(db, settings.snoozeDayOptions);
}

/**
 * Reads settings from SQLite. Unlike the old JSON-file store, there is no
 * "entirely missing field" case to gap-fill on the ongoing read path - every
 * scalar column is NOT NULL from the moment it's inserted, and a future new
 * field is added via an explicit schema migration (see design.md Decision 8),
 * not discovered missing at read time. What remains is exactly the failure
 * mode design.md calls out: a value edited directly in the database that
 * fails cross-field validation (e.g. `activityGraceHours >= forgottenHours`).
 * That still throws rather than silently resetting anything - see
 * settings-read-safety's design.md for the incident this guards against.
 */
export async function readSettings(): Promise<Settings> {
  const db = getDb();
  const row = db.prepare("SELECT * FROM settings WHERE id = 1").get() as Record<string, unknown> | undefined;

  if (!row) {
    const result: Settings = { ...DEFAULT_SETTINGS, sessionSecret: crypto.randomBytes(32).toString("hex") };
    db.exec("BEGIN");
    try {
      insertFullSettings(db, result);
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
    return result;
  }

  const assembled = assembleSettings(db, row);
  const validated = validateSettings(assembled);
  if (!validated) {
    throw new Error(
      "The settings database failed validation - a field that is present has an invalid value. " +
        "Refusing to overwrite it with defaults, since that would silently discard real configuration (API keys, " +
        "thresholds, credentials). Inspect the `settings`/`org_configs`/`tier_notifications`/`snooze_day_options` " +
        "tables and fix the offending value by hand, or check for a bug in validateSettings if this was previously working.",
    );
  }
  return validated;
}

/** Merges onto currently persisted settings so a form only submitting its own fields doesn't clobber the rest. Persists via targeted column/table writes - a field absent from `partial` is never named in any SQL statement, so it cannot be touched (see design.md Decision 2). */
export async function writeSettings(
  partial: Record<string, unknown>,
): Promise<{ ok: true; settings: Settings } | { ok: false; error: string }> {
  const current = await readSettings();
  const merged = { ...current, ...partial };
  const validated = validateSettings(merged);
  if (!validated) {
    return {
      ok: false,
      error:
        "One or more values are invalid. Check that numeric fields are positive whole numbers " +
        "(with New < Stale < Forgotten), the API base URL is a valid http(s) URL, required text fields aren't " +
        "empty, and the snooze day options are a comma-separated list of distinct positive whole numbers.",
    };
  }

  const db = getDb();
  db.exec("BEGIN");
  try {
    const touchedScalarKeys = SCALAR_SETTINGS_COLUMNS.filter((key) => key in partial);
    if (touchedScalarKeys.length > 0) {
      const setClause = touchedScalarKeys.map((key) => `${key} = @${key}`).join(", ");
      const values: Record<string, string | number> = {};
      for (const key of touchedScalarKeys) {
        values[key] = key === "developerTurnOnEnabled" ? toSqliteBool(validated[key] as boolean) : (validated[key] as string | number);
      }
      db.prepare(`UPDATE settings SET ${setClause} WHERE id = 1`).run(values);
    }
    if ("capellaOrgs" in partial) replaceOrgConfigs(db, validated.capellaOrgs);
    if ("notificationsByTier" in partial) replaceTierNotifications(db, validated.notificationsByTier);
    if ("snoozeDayOptions" in partial) replaceSnoozeDayOptions(db, validated.snoozeDayOptions);
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }

  return { ok: true, settings: validated };
}
