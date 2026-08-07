import { promises as fs } from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import {
  DEFAULT_SETTINGS,
  type NotifiableAgeStatus,
  type NotificationsByTier,
  type OrgConfig,
  type Settings,
  type TierNotificationConfig,
} from "../types";

/** "In Use" is deliberately excluded - see NotifiableAgeStatus. */
const NOTIFIABLE_TIERS: NotifiableAgeStatus[] = ["Stale", "Forgotten"];

const SETTINGS_FILE = "settings.json";

/**
 * Not a setting - see design.md. The data directory defines where
 * settings.json itself lives, so it can't be stored inside the file it
 * would need to be read from before the directory is even known.
 */
const DATA_DIR = "./data";

function settingsPath(): string {
  return path.join(DATA_DIR, SETTINGS_FILE);
}

async function ensureDataDir(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

/** Write-then-rename so a crash mid-write never leaves a truncated/corrupt file. */
async function writeJsonFileAtomic(filePath: string, data: unknown): Promise<void> {
  await ensureDataDir();
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), "utf8");
  await fs.rename(tmpPath, filePath);
}

async function readJsonFileOrNull<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

function isPositiveInteger(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v > 0;
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
    const { orgId, orgName, apiKey } = entry as Record<string, unknown>;
    if (!isNonEmptyString(orgId) || !isNonEmptyString(apiKey)) return false;
    if (orgName !== undefined && typeof orgName !== "string") return false;
    return true;
  });
}

function isTierNotificationConfig(v: unknown): v is TierNotificationConfig {
  if (typeof v !== "object" || v === null) return false;
  const { notify, askTurnOff, askDelete } = v as Record<string, unknown>;
  return typeof notify === "boolean" && typeof askTurnOff === "boolean" && typeof askDelete === "boolean";
}

function isNotificationsByTier(v: unknown): v is NotificationsByTier {
  if (typeof v !== "object" || v === null) return false;
  const obj = v as Record<string, unknown>;
  return NOTIFIABLE_TIERS.every((tier) => isTierNotificationConfig(obj[tier]));
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

  return {
    activityGraceHours,
    forgottenHours,
    capellaOrgs: capellaOrgs.map((o) => ({ orgId: o.orgId, orgName: o.orgName, apiKey: o.apiKey })),
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
  };
}

/**
 * One-time migration for settings written before the age-status model
 * moved from four day-based thresholds (`newDays`/`staleDays`/
 * `forgottenDays`/`inactivityGraceDays`) to two hour-based ones - see the
 * collapse-age-status-tiers change. `newDays`/`staleDays` have no
 * equivalent in the new model and are dropped; `forgottenDays` and
 * `inactivityGraceDays` are unit-converted (×24) into their closest new
 * counterparts. A legacy "Established" entry in `notificationsByTier` is
 * dropped too, since "In Use" isn't configurable. No-ops once a settings
 * object already has `activityGraceHours`/`forgottenHours`.
 */
function migrateLegacyAgeSettings(rawObj: Record<string, unknown>): Record<string, unknown> {
  if (isPositiveInteger(rawObj.activityGraceHours) && isPositiveInteger(rawObj.forgottenHours)) {
    return rawObj;
  }

  const migrated = { ...rawObj };
  if (isPositiveInteger(rawObj.inactivityGraceDays)) {
    migrated.activityGraceHours = rawObj.inactivityGraceDays * 24;
  }
  if (isPositiveInteger(rawObj.forgottenDays)) {
    migrated.forgottenHours = rawObj.forgottenDays * 24;
  }
  delete migrated.newDays;
  delete migrated.staleDays;
  delete migrated.forgottenDays;
  delete migrated.inactivityGraceDays;

  if (typeof migrated.notificationsByTier === "object" && migrated.notificationsByTier !== null) {
    const { Established, ...rest } = migrated.notificationsByTier as Record<string, unknown>;
    migrated.notificationsByTier = rest;
  }

  return migrated;
}

/**
 * Falls back to (and persists) defaults when the file is missing or fails
 * validation outright. When the file is valid except for missing newer
 * fields (e.g. upgrading from a version that only had age-status
 * thresholds), fills those in from defaults rather than discarding the
 * fields that were already valid - a corrupt *value* still loses everything,
 * but a merely *incomplete* file doesn't.
 */
export async function readSettings(): Promise<Settings> {
  const rawFile = await readJsonFileOrNull<unknown>(settingsPath());
  const raw =
    rawFile !== null && typeof rawFile === "object"
      ? migrateLegacyAgeSettings(rawFile as Record<string, unknown>)
      : rawFile;

  if (raw !== null) {
    const validated = validateSettings(raw);
    if (validated) return validated;
  }

  const rawObj = raw !== null && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const sessionSecret = isNonEmptyString(rawObj.sessionSecret)
    ? rawObj.sessionSecret
    : crypto.randomBytes(32).toString("hex");
  const merged = { ...DEFAULT_SETTINGS, ...rawObj, sessionSecret };

  const result = validateSettings(merged) ?? { ...DEFAULT_SETTINGS, sessionSecret };
  await writeJsonFileAtomic(settingsPath(), result);
  return result;
}

/** Merges onto currently persisted settings so a form only submitting its own fields doesn't clobber the rest. */
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
        "(with New < Stale < Forgotten), the API base URL is a valid http(s) URL, and required text fields aren't empty.",
    };
  }
  await writeJsonFileAtomic(settingsPath(), validated);
  return { ok: true, settings: validated };
}
