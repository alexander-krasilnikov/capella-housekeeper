import { acquireSlot } from "./rateLimiter";
import type { OrgConfig } from "../types";

// Per the Capella Management API's documented constraints: 90s for reads, 120s for writes.
const READ_TIMEOUT_MS = 90_000;
const WRITE_TIMEOUT_MS = 120_000;

/**
 * Every request in this file only needs `orgId` (for the URL path) and
 * `apiKey` (for the Authorization header) - narrower than the full
 * `OrgConfig` so callers resolving credentials ad hoc (e.g. a settings-form
 * lookup before a row has been saved) don't need to fabricate an `id` just
 * to satisfy the type.
 */
type ApiCredential = Pick<OrgConfig, "orgId" | "apiKey">;

export class CapellaApiError extends Error {
  constructor(
    message: string,
    public readonly status: number | null,
  ) {
    super(message);
  }
}

type CapellaMethod = "GET" | "POST" | "PUT" | "DELETE";

/** Rate-limited, timed, authenticated fetch shared by every request shape below - callers interpret the response. */
async function doFetch(
  org: ApiCredential,
  apiBaseUrl: string,
  pathSuffix: string,
  init?: { method?: CapellaMethod; body?: unknown },
): Promise<Response> {
  await acquireSlot(org.apiKey);

  const isWrite = (init?.method ?? "GET") !== "GET";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), isWrite ? WRITE_TIMEOUT_MS : READ_TIMEOUT_MS);
  try {
    return await fetch(`${apiBaseUrl}${pathSuffix}`, {
      method: init?.method ?? "GET",
      headers: {
        Authorization: `Bearer ${org.apiKey}`,
        Accept: "application/json",
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
      },
      body: init?.body ? JSON.stringify(init.body) : undefined,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Capella's error responses are JSON with `code`/`message`/`hint` fields
 * (e.g. `{"code":1002,"message":"Access Denied","hint":"..."}` for a 403) -
 * surfaced here so a failure is actionable from the thrown message alone,
 * rather than just a bare status code with no indication of *why*.
 */
async function describeErrorResponse(res: Response): Promise<string> {
  const text = await res.text().catch(() => "");
  if (!text) return "";
  try {
    const body = JSON.parse(text) as { code?: unknown; message?: unknown; hint?: unknown };
    const parts = [body.message, body.hint].filter((v) => typeof v === "string" && v.length > 0);
    if (parts.length > 0) return ` - ${parts.join("; ")}${body.code !== undefined ? ` (code ${body.code})` : ""}`;
  } catch {
    // Not JSON - fall through to the raw text preview below.
  }
  return ` - ${text.slice(0, 200)}`;
}

async function request<T>(
  org: ApiCredential,
  apiBaseUrl: string,
  pathSuffix: string,
  init?: { method?: CapellaMethod; body?: unknown },
): Promise<T> {
  const res = await doFetch(org, apiBaseUrl, pathSuffix, init);
  if (!res.ok) {
    throw new CapellaApiError(
      `Capella API ${pathSuffix} returned ${res.status}${await describeErrorResponse(res)}`,
      res.status,
    );
  }

  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    const bodyPreview = (await res.text()).slice(0, 200);
    throw new CapellaApiError(
      `Capella API ${pathSuffix} returned non-JSON response (content-type: ${contentType || "none"}). ` +
        `This usually means the configured Capella API base URL is wrong. Body preview: ${bodyPreview}`,
      res.status,
    );
  }

  return (await res.json()) as T;
}

/** For write operations confirmed (per the official OpenAPI spec) to return no body - a 202/204 with nothing to parse as JSON. */
async function requestNoContent(
  org: ApiCredential,
  apiBaseUrl: string,
  pathSuffix: string,
  init: { method: CapellaMethod; body?: unknown },
): Promise<void> {
  const res = await doFetch(org, apiBaseUrl, pathSuffix, init);
  if (!res.ok) {
    throw new CapellaApiError(
      `Capella API ${pathSuffix} returned ${res.status}${await describeErrorResponse(res)}`,
      res.status,
    );
  }
}

export interface CapellaOrganization {
  id: string;
  name: string;
}

/** Fetches the organization's real display name, confirmed to carry a `name` field. */
export async function getOrganization(org: ApiCredential, apiBaseUrl: string): Promise<CapellaOrganization> {
  return request<CapellaOrganization>(org, apiBaseUrl, `/organizations/${org.orgId}`);
}

export interface CapellaUser {
  id: string;
  name?: string;
  email?: string;
}

/**
 * Resolves a user ID (as seen in a cluster's `audit.createdBy`) to a
 * display name/email. Best-effort - the caller falls back to the raw ID
 * if this fails, since the exact response shape wasn't confirmed against
 * real credentials at design time.
 */
export async function getUser(org: ApiCredential, apiBaseUrl: string, userId: string): Promise<CapellaUser> {
  return request<CapellaUser>(org, apiBaseUrl, `/organizations/${org.orgId}/users/${userId}`);
}

export interface CapellaProject {
  id: string;
  name: string;
}

export interface CapellaClusterConfig {
  id: string;
  name: string;
  cloudProvider: { type: string; region: string };
  couchbaseServer?: { version: string };
  serviceGroups: Array<{
    node: {
      compute: { cpu: number; ram: number };
    };
    numOfNodes: number;
  }>;
  audit?: { createdAt: string; createdBy?: string; modifiedAt?: string; modifiedBy?: string };
  /**
   * Operational state, e.g. "healthy", "turnedOff", "deploying". Confirmed
   * required and exhaustively enumerated as `CurrentState` in the official
   * OpenAPI spec (docs.couchbase.com/cloud/management-api-reference).
   */
  currentState: string;
}

export async function listProjects(org: ApiCredential, apiBaseUrl: string): Promise<CapellaProject[]> {
  const res = await request<{ data: CapellaProject[] }>(
    org,
    apiBaseUrl,
    `/organizations/${org.orgId}/projects`,
  );
  return res.data ?? [];
}

export async function listClusters(
  org: ApiCredential,
  apiBaseUrl: string,
  projectId: string,
): Promise<CapellaClusterConfig[]> {
  const res = await request<{ data: CapellaClusterConfig[] }>(
    org,
    apiBaseUrl,
    `/organizations/${org.orgId}/projects/${projectId}/clusters`,
  );
  return res.data ?? [];
}

export interface ActivityLogEvent {
  timestamp: string;
  summary?: string;
  severity?: string;
  key?: string;
  userEmail?: string;
}

/**
 * Fetches the single most recent event for a cluster. Confirmed via the
 * official OpenAPI spec: GET /organizations/{orgId}/events, filtered by
 * clusterIds, sorted by timestamp descending, one result. There is no
 * cluster-scoped events path (an earlier guess assumed one and never
 * worked) - this is org-scoped with a filter instead. `from` defaults to
 * the last 24 hours if omitted, so it's pinned far enough back to cover a
 * cluster's entire history rather than just "activity today."
 */
export async function getActivityLog(
  org: ApiCredential,
  apiBaseUrl: string,
  clusterId: string,
): Promise<ActivityLogEvent[]> {
  const params = new URLSearchParams({
    clusterIds: clusterId,
    sortBy: "timestamp",
    sortDirection: "desc",
    perPage: "1",
    from: "2020-01-01T00:00:00.000Z",
  });
  const res = await request<{ data: ActivityLogEvent[] }>(
    org,
    apiBaseUrl,
    `/organizations/${org.orgId}/events?${params.toString()}`,
  );
  return res.data ?? [];
}

export interface BillingUsage {
  amountUsd: number;
  asOf: string;
}

/**
 * Why `getBillingUsage` couldn't return a dollar amount:
 * - "credits-based": the org bills in credits, not currency
 *   (`totalCurrencySpend` comes back null) - converting credits to USD
 *   would need a real published conversion rate, which this doesn't guess.
 * - "no-access": the API key's org role can't see billing (Capella
 *   requires Organization Owner for this; Organization Member gets a 403).
 * - "error": any other API failure (transient, wrong role elsewhere, etc).
 */
export type BillingUnavailableReason = "credits-based" | "no-access" | "error";

export type BillingResult =
  | ({ ok: true } & BillingUsage)
  | { ok: false; reason: BillingUnavailableReason };

/**
 * Fetches actual itemized billing for a cluster, for the current calendar
 * month to date. Confirmed via the official OpenAPI spec:
 * POST /organizations/{orgId}/projects/{projectId}/clusters/{clusterId}/billing
 * (an earlier guess used GET against an org-level "billing/usage" path
 * that doesn't exist - this is POST, and needs the project ID too).
 * Usage can lag up to ~5 days per Couchbase's docs, so recent days may be
 * incomplete or missing entirely.
 */
export async function getBillingUsage(
  org: ApiCredential,
  apiBaseUrl: string,
  projectId: string,
  clusterId: string,
): Promise<BillingResult> {
  const now = new Date();
  const startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const endDate = now.toISOString().slice(0, 10);

  try {
    const res = await request<{
      data: { total: { totalCurrencySpend: number | null } };
    }>(
      org,
      apiBaseUrl,
      `/organizations/${org.orgId}/projects/${projectId}/clusters/${clusterId}/billing`,
      { method: "POST", body: { startDate, endDate } },
    );
    const amountUsd = res.data.total.totalCurrencySpend;
    if (amountUsd === null) return { ok: false, reason: "credits-based" };
    return { ok: true, amountUsd, asOf: now.toISOString() };
  } catch (err) {
    if (err instanceof CapellaApiError) {
      return { ok: false, reason: err.status === 403 ? "no-access" : "error" };
    }
    throw err;
  }
}

/**
 * Turns a cluster off. Confirmed via the official OpenAPI spec
 * (docs.couchbase.com/cloud/management-api-reference): DELETE against the
 * cluster's `activationState` sub-resource, not the cluster itself -
 * `POST` to that same path turns it back on. Returns 202 with no body.
 */
export async function turnOffCluster(
  org: ApiCredential,
  apiBaseUrl: string,
  projectId: string,
  clusterId: string,
): Promise<void> {
  await requestNoContent(
    org,
    apiBaseUrl,
    `/organizations/${org.orgId}/projects/${projectId}/clusters/${clusterId}/activationState`,
    { method: "DELETE" },
  );
}

/**
 * Turns a cluster back on - the same `activationState` sub-resource
 * `turnOffCluster` `DELETE`s, `POST`ed instead. See manual-cluster-actions
 * spec - gated behind the developer-options toggle. Confirmed via the
 * official OpenAPI spec as `clusterOn`: unlike `clusterOff`, it defines an
 * optional `{ turnOnLinkedAppService: boolean }` request body (default
 * `false`) - sent explicitly here, matching the documented shape exactly,
 * rather than relying on the body being truly optional in practice. Returns
 * 202 with no body.
 */
export async function turnOnCluster(
  org: ApiCredential,
  apiBaseUrl: string,
  projectId: string,
  clusterId: string,
): Promise<void> {
  await requestNoContent(
    org,
    apiBaseUrl,
    `/organizations/${org.orgId}/projects/${projectId}/clusters/${clusterId}/activationState`,
    { method: "POST", body: { turnOnLinkedAppService: false } },
  );
}

/**
 * Deletes a cluster outright. Confirmed via the official OpenAPI spec
 * (docs.couchbase.com/cloud/management-api-reference): DELETE against the
 * cluster resource itself. Returns 202 with no body; fails with 422 if the
 * cluster has deletion protection enabled - surfaced as a CapellaApiError,
 * not retried automatically here.
 */
export async function deleteCluster(
  org: ApiCredential,
  apiBaseUrl: string,
  projectId: string,
  clusterId: string,
): Promise<void> {
  await requestNoContent(
    org,
    apiBaseUrl,
    `/organizations/${org.orgId}/projects/${projectId}/clusters/${clusterId}`,
    { method: "DELETE" },
  );
}
