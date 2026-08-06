import { promises as fs } from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { DEFAULT_SETTINGS, type OrgConfig, type Settings } from "../types";

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

/** Positive integers, strictly increasing so each age-status tier's window is non-empty. */
export function validateSettings(input: unknown): Settings | null {
  if (typeof input !== "object" || input === null) return null;
  const {
    newDays,
    staleDays,
    forgottenDays,
    inactivityGraceDays,
    capellaOrgs,
    capellaApiBaseUrl,
    syncIntervalHours,
    retentionDays,
    dashboardUsername,
    dashboardPassword,
    sessionSecret,
  } = input as Record<string, unknown>;

  if (
    !isPositiveInteger(newDays) ||
    !isPositiveInteger(staleDays) ||
    !isPositiveInteger(forgottenDays) ||
    !isPositiveInteger(inactivityGraceDays)
  ) {
    return null;
  }
  if (!(newDays < staleDays && staleDays < forgottenDays)) {
    return null;
  }

  if (!isOrgConfigList(capellaOrgs)) return null;
  if (!isHttpUrl(capellaApiBaseUrl)) return null;
  if (!isPositiveInteger(syncIntervalHours)) return null;
  if (!isPositiveInteger(retentionDays)) return null;
  if (!isNonEmptyString(dashboardUsername)) return null;
  if (!isNonEmptyString(dashboardPassword)) return null;
  if (!isNonEmptyString(sessionSecret)) return null;

  return {
    newDays,
    staleDays,
    forgottenDays,
    inactivityGraceDays,
    capellaOrgs: capellaOrgs.map((o) => ({ orgId: o.orgId, orgName: o.orgName, apiKey: o.apiKey })),
    capellaApiBaseUrl,
    syncIntervalHours,
    retentionDays,
    dashboardUsername,
    dashboardPassword,
    sessionSecret,
  };
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
  const raw = await readJsonFileOrNull<unknown>(settingsPath());

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
