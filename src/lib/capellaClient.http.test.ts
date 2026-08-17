/**
 * `capellaClient`'s request handling, against a stubbed `fetch`.
 *
 * This is the one place HTTP semantics are tested. The integration suites fake
 * this module wholesale (see design.md Decision 1), so without this file the
 * error shaping, the wrong-base-URL diagnostic, and the billing status mapping
 * would have no coverage at all - and those are precisely the paths that turn
 * a misconfiguration into either an actionable message or a mystery.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CapellaApiError,
  deleteCluster,
  getActivityLog,
  getBillingUsage,
  getOrganization,
  getUser,
  listClusters,
  listProjects,
  turnOffCluster,
  turnOnCluster,
} from "./capellaClient";

const ORG = { orgId: "org-1", apiKey: "secret-key" };
const BASE = "https://api.example.test/v4";

let fetchMock: ReturnType<typeof vi.fn>;

/**
 * Response *factories*, not instances. A Response body can only be read once,
 * so handing the same object to fetch twice fails with "Body has already been
 * read" - every stub below returns a freshly built response per call.
 */
function jsonResponse(body: unknown, status = 200): () => Response {
  return () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
}

function textResponse(body: string, status = 200, contentType = "text/html"): () => Response {
  return () => new Response(body, { status, headers: { "content-type": contentType } });
}

/** A bodyless 202, as the documented write endpoints return. */
function acceptedResponse(): () => Response {
  return () => new Response(null, { status: 202 });
}

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** The URL and init of the nth fetch call. */
function callArgs(n = 0): { url: string; init: RequestInit } {
  const [url, init] = fetchMock.mock.calls[n] as [string, RequestInit];
  return { url, init };
}

describe("request construction", () => {
  it("authenticates with the org's API key as a bearer token", async () => {
    fetchMock.mockImplementation(jsonResponse({ id: "org-1", name: "Org" }));

    await getOrganization(ORG, BASE);

    const headers = callArgs().init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer secret-key");
    expect(headers.Accept).toBe("application/json");
  });

  it("targets the organization path for getOrganization", async () => {
    fetchMock.mockImplementation(jsonResponse({ id: "org-1", name: "Org" }));

    await getOrganization(ORG, BASE);

    expect(callArgs().url).toBe(`${BASE}/organizations/org-1`);
  });

  it("targets the user path for getUser", async () => {
    fetchMock.mockImplementation(jsonResponse({ id: "u1", email: "a@b.c" }));

    await getUser(ORG, BASE, "u1");

    expect(callArgs().url).toBe(`${BASE}/organizations/org-1/users/u1`);
  });

  it("sends no content-type or body on a plain GET", async () => {
    fetchMock.mockImplementation(jsonResponse({ data: [] }));

    await listProjects(ORG, BASE);

    const { init } = callArgs();
    expect(init.method).toBe("GET");
    expect(init.body).toBeUndefined();
    expect((init.headers as Record<string, string>)["Content-Type"]).toBeUndefined();
  });

  it("passes an abort signal so a hung request cannot wait forever", async () => {
    fetchMock.mockImplementation(jsonResponse({ data: [] }));

    await listProjects(ORG, BASE);

    expect(callArgs().init.signal).toBeInstanceOf(AbortSignal);
  });
});

describe("error responses", () => {
  it("surfaces Capella's own message and hint in the thrown error", async () => {
    fetchMock.mockImplementation(
      jsonResponse({ code: 1002, message: "Access Denied", hint: "Check your API key role." }, 403),
    );

    // A bare status code gives no indication of *why* - see
    // describeErrorResponse's comment.
    await expect(listProjects(ORG, BASE)).rejects.toThrow(/Access Denied/);
    await expect(listProjects(ORG, BASE)).rejects.toThrow(/Check your API key role\./);
    await expect(listProjects(ORG, BASE)).rejects.toThrow(/code 1002/);
  });

  it("carries the HTTP status on the error object", async () => {
    fetchMock.mockImplementation(jsonResponse({ message: "Nope" }, 403));

    await expect(listProjects(ORG, BASE)).rejects.toMatchObject({ status: 403 });
  });

  it("throws CapellaApiError specifically, which callers branch on", async () => {
    fetchMock.mockImplementation(jsonResponse({ message: "Nope" }, 500));

    // sync.ts and reconciliation.ts rethrow anything that is *not* this.
    await expect(listProjects(ORG, BASE)).rejects.toBeInstanceOf(CapellaApiError);
  });

  it("falls back to a raw text preview when the error body is not JSON", async () => {
    fetchMock.mockImplementation(textResponse("<html>Gateway Timeout</html>", 504));

    await expect(listProjects(ORG, BASE)).rejects.toThrow(/Gateway Timeout/);
  });

  it("tolerates an entirely empty error body", async () => {
    fetchMock.mockImplementation(() => new Response(null, { status: 500 }));

    await expect(listProjects(ORG, BASE)).rejects.toThrow(/returned 500/);
  });
});

describe("a non-JSON success response", () => {
  it("diagnoses a wrong base URL rather than failing to parse", async () => {
    // The realistic case: the base URL points at a docs page or a proxy, which
    // answers 200 with HTML. A JSON parse error here would be baffling.
    fetchMock.mockImplementation(textResponse("<!doctype html><title>Docs</title>", 200));

    await expect(listProjects(ORG, BASE)).rejects.toThrow(/base URL is wrong/);
  });

  it("includes the content-type and a body preview in the diagnostic", async () => {
    fetchMock.mockImplementation(textResponse("<!doctype html>not json at all", 200));

    await expect(listProjects(ORG, BASE)).rejects.toThrow(/text\/html/);
    await expect(listProjects(ORG, BASE)).rejects.toThrow(/not json at all/);
  });

  it("reports a missing content-type as none", async () => {
    fetchMock.mockImplementation(() => new Response("body", { status: 200, headers: {} }));

    await expect(listProjects(ORG, BASE)).rejects.toThrow(/content-type: /);
  });
});

describe("list endpoints", () => {
  it("returns the data array", async () => {
    fetchMock.mockImplementation(jsonResponse({ data: [{ id: "p1", name: "Project" }] }));

    expect(await listProjects(ORG, BASE)).toEqual([{ id: "p1", name: "Project" }]);
  });

  it("falls back to an empty array when data is absent", async () => {
    fetchMock.mockImplementation(jsonResponse({}));

    expect(await listProjects(ORG, BASE)).toEqual([]);
  });

  it("falls back to an empty array for clusters too", async () => {
    fetchMock.mockImplementation(jsonResponse({}));

    expect(await listClusters(ORG, BASE, "p1")).toEqual([]);
  });

  it("scopes the cluster listing to the project", async () => {
    fetchMock.mockImplementation(jsonResponse({ data: [] }));

    await listClusters(ORG, BASE, "p1");

    expect(callArgs().url).toBe(`${BASE}/organizations/org-1/projects/p1/clusters`);
  });
});

describe("getActivityLog", () => {
  it("queries the org-scoped events path filtered by cluster", async () => {
    fetchMock.mockImplementation(jsonResponse({ data: [] }));

    await getActivityLog(ORG, BASE, "c1");

    // There is no cluster-scoped events path - an earlier guess assumed one and
    // never worked. See the function's comment.
    const { url } = callArgs();
    expect(url).toContain(`${BASE}/organizations/org-1/events?`);
    const params = new URLSearchParams(url.split("?")[1]);
    expect(params.get("clusterIds")).toBe("c1");
    expect(params.get("sortBy")).toBe("timestamp");
    expect(params.get("sortDirection")).toBe("desc");
    expect(params.get("perPage")).toBe("1");
  });

  it("pins `from` far enough back to cover the cluster's whole history", async () => {
    fetchMock.mockImplementation(jsonResponse({ data: [] }));

    await getActivityLog(ORG, BASE, "c1");

    // Without this the API defaults to the last 24 hours, which would read as
    // "no activity ever" for anything quieter than that.
    const params = new URLSearchParams(callArgs().url.split("?")[1]);
    expect(new Date(params.get("from")!).getFullYear()).toBeLessThanOrEqual(2020);
  });

  it("returns the events, and an empty array when there are none", async () => {
    fetchMock.mockImplementationOnce(jsonResponse({ data: [{ timestamp: "2026-01-01T00:00:00.000Z" }] }));
    expect(await getActivityLog(ORG, BASE, "c1")).toHaveLength(1);

    fetchMock.mockImplementationOnce(jsonResponse({}));
    expect(await getActivityLog(ORG, BASE, "c1")).toEqual([]);
  });
});

describe("getBillingUsage", () => {
  it("POSTs to the cluster billing path with a month-to-date range", async () => {
    fetchMock.mockImplementation(jsonResponse({ data: { total: { totalCurrencySpend: 10 } } }));

    await getBillingUsage(ORG, BASE, "p1", "c1");

    const { url, init } = callArgs();
    // POST, and it needs the project id too - an earlier guess used GET against
    // an org-level path that doesn't exist.
    expect(url).toBe(`${BASE}/organizations/org-1/projects/p1/clusters/c1/billing`);
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string);
    expect(body.startDate).toMatch(/^\d{4}-\d{2}-01$/);
    expect(body.endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(body.startDate <= body.endDate).toBe(true);
  });

  it("anchors the window to the first of the month in UTC, whatever the host timezone", async () => {
    // Regression: the start was built from local calendar components and then
    // formatted via toISOString. In any timezone ahead of UTC, midnight on the
    // 1st local is still the previous month in UTC, so the window began a day
    // early and pulled in the prior month's usage:
    //
    //   TZ=Europe/Berlin -> 2026-07-31 (wrong)   TZ=UTC -> 2026-08-01 (right)
    //
    // Both bounds now derive from UTC, so this holds on a European developer's
    // machine and in CI alike.
    fetchMock.mockImplementation(jsonResponse({ data: { total: { totalCurrencySpend: 1 } } }));

    await getBillingUsage(ORG, BASE, "p1", "c1");

    const now = new Date();
    const body = JSON.parse(callArgs().init.body as string);
    const expectedStart = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
    expect(body.startDate).toBe(expectedStart);
    expect(body.endDate).toBe(now.toISOString().slice(0, 10));
  });

  it("returns the amount on success", async () => {
    fetchMock.mockImplementation(jsonResponse({ data: { total: { totalCurrencySpend: 123.45 } } }));

    expect(await getBillingUsage(ORG, BASE, "p1", "c1")).toMatchObject({ ok: true, amountUsd: 123.45 });
  });

  it("maps a null spend to credits-based rather than inventing a figure", async () => {
    fetchMock.mockImplementation(jsonResponse({ data: { total: { totalCurrencySpend: null } } }));

    // Converting credits to USD would need a published rate this doesn't guess.
    expect(await getBillingUsage(ORG, BASE, "p1", "c1")).toEqual({ ok: false, reason: "credits-based" });
  });

  it("maps a 403 to no-access", async () => {
    fetchMock.mockImplementation(jsonResponse({ message: "Access Denied" }, 403));

    // Capella requires Organization Owner for billing; a Member gets a 403.
    expect(await getBillingUsage(ORG, BASE, "p1", "c1")).toEqual({ ok: false, reason: "no-access" });
  });

  it("maps any other API failure to error", async () => {
    fetchMock.mockImplementation(jsonResponse({ message: "Boom" }, 500));

    expect(await getBillingUsage(ORG, BASE, "p1", "c1")).toEqual({ ok: false, reason: "error" });
  });

  it("does not swallow a non-API failure", async () => {
    fetchMock.mockImplementation(() => Promise.reject(new TypeError("network down")));

    // Only CapellaApiError becomes a reason code; anything else propagates.
    await expect(getBillingUsage(ORG, BASE, "p1", "c1")).rejects.toThrow(/network down/);
  });
});

describe("write endpoints", () => {
  it("turns a cluster off by DELETEing its activationState", async () => {
    fetchMock.mockImplementation(acceptedResponse());

    await turnOffCluster(ORG, BASE, "p1", "c1");

    const { url, init } = callArgs();
    // The activationState sub-resource, not the cluster itself.
    expect(url).toBe(`${BASE}/organizations/org-1/projects/p1/clusters/c1/activationState`);
    expect(init.method).toBe("DELETE");
  });

  it("turns a cluster on by POSTing the same path with the documented body", async () => {
    fetchMock.mockImplementation(acceptedResponse());

    await turnOnCluster(ORG, BASE, "p1", "c1");

    const { url, init } = callArgs();
    expect(url).toBe(`${BASE}/organizations/org-1/projects/p1/clusters/c1/activationState`);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ turnOnLinkedAppService: false });
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
  });

  it("deletes a cluster by DELETEing the cluster resource itself", async () => {
    fetchMock.mockImplementation(acceptedResponse());

    await deleteCluster(ORG, BASE, "p1", "c1");

    const { url, init } = callArgs();
    expect(url).toBe(`${BASE}/organizations/org-1/projects/p1/clusters/c1`);
    expect(init.method).toBe("DELETE");
  });

  it("accepts a bodyless 202 without trying to parse it", async () => {
    fetchMock.mockImplementation(acceptedResponse());

    await expect(turnOffCluster(ORG, BASE, "p1", "c1")).resolves.toBeUndefined();
  });

  it("surfaces a deletion-protection refusal as a CapellaApiError", async () => {
    fetchMock.mockImplementation(
      jsonResponse({ code: 4025, message: "Cluster has deletion protection enabled" }, 422),
    );

    // Not retried automatically here - see deleteCluster's comment.
    await expect(deleteCluster(ORG, BASE, "p1", "c1")).rejects.toMatchObject({ status: 422 });
    await expect(deleteCluster(ORG, BASE, "p1", "c1")).rejects.toThrow(/deletion protection/);
  });

  it("surfaces a failed turn-off with its status", async () => {
    fetchMock.mockImplementation(jsonResponse({ message: "Conflict" }, 409));

    await expect(turnOffCluster(ORG, BASE, "p1", "c1")).rejects.toMatchObject({ status: 409 });
  });
});
