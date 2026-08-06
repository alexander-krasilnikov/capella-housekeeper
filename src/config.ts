import type { OrgConfig } from "./types";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function loadOrgConfigs(): OrgConfig[] {
  const raw = process.env.CAPELLA_ORGS;
  if (!raw) {
    throw new Error(
      "Missing CAPELLA_ORGS environment variable. Expected a JSON array like " +
        '[{"orgId":"...","orgName":"...","apiKey":"..."}]',
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`CAPELLA_ORGS is not valid JSON: ${(err as Error).message}`);
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("CAPELLA_ORGS must be a non-empty JSON array");
  }
  return parsed.map((entry, i) => {
    const { orgId, orgName, apiKey } = entry as Partial<OrgConfig>;
    if (!orgId || !apiKey) {
      throw new Error(`CAPELLA_ORGS[${i}] must include orgId and apiKey`);
    }
    return { orgId, orgName, apiKey };
  });
}

export const config = {
  capellaApiBaseUrl:
    process.env.CAPELLA_API_BASE_URL ?? "https://cloudapi.cloud.couchbase.com/v4",
  syncIntervalMs: Number(process.env.SYNC_INTERVAL_MS ?? 5 * 60 * 1000),
  retentionDays: Number(process.env.RETENTION_DAYS ?? 7),
  dataDir: process.env.DATA_DIR ?? "./data",
  dashboard: {
    username: process.env.DASHBOARD_USERNAME ?? "admin",
    password: process.env.DASHBOARD_PASSWORD ?? "",
  },
  get sessionSecret(): string {
    return required("SESSION_SECRET");
  },
};
