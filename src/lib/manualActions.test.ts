import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ClusterRecord, OrgConfig, Settings } from "../types";

const { turnOnCluster } = vi.hoisted(() => ({ turnOnCluster: vi.fn() }));
vi.mock("./capellaClient", () => ({
  turnOnCluster,
  turnOffCluster: vi.fn(),
  deleteCluster: vi.fn(),
  CapellaApiError: class CapellaApiError extends Error {
    constructor(
      message: string,
      public readonly status: number | null,
    ) {
      super(message);
    }
  },
}));

const { getCluster, upsertClusters, appendHistoryIfChanged } = vi.hoisted(() => ({
  getCluster: vi.fn(),
  upsertClusters: vi.fn(async () => undefined),
  appendHistoryIfChanged: vi.fn(async () => undefined),
}));
vi.mock("./store", () => ({
  getCluster,
  upsertClusters,
  removeClusters: vi.fn(async () => undefined),
  appendHistoryIfChanged,
}));

const { readSettings } = vi.hoisted(() => ({ readSettings: vi.fn() }));
vi.mock("./settings", () => ({ readSettings }));

const { supersedeLiveMessage } = vi.hoisted(() => ({ supersedeLiveMessage: vi.fn(async () => undefined) }));
vi.mock("./notifications", () => ({ supersedeLiveMessage }));

const { resolveOrgConfig, manualTurnOn } = await import("./manualActions");
const { CapellaApiError } = await import("./capellaClient");

function org(overrides: Partial<OrgConfig> = {}): OrgConfig {
  return { id: "cfg-1", orgId: "org-1", apiKey: "key-1", ...overrides };
}

function settingsWith(capellaOrgs: OrgConfig[]): Settings {
  return { capellaOrgs } as Settings;
}

function record(overrides: Partial<ClusterRecord> = {}): ClusterRecord {
  return { orgId: "org-1", orgConfigId: undefined, ...overrides } as ClusterRecord;
}

describe("resolveOrgConfig", () => {
  it("picks the exact entry that saw the cluster, via orgConfigId - not just any entry sharing its orgId", () => {
    // Regression test for a real 403: two project-scoped API keys shared one
    // Capella org, and the wrong one was picked purely by orgId match.
    const demo = org({ id: "cfg-demo", orgId: "org-1" });
    const sashakatjatest = org({ id: "cfg-saka", orgId: "org-1" });
    const settings = settingsWith([demo, sashakatjatest]);

    const resolved = resolveOrgConfig(record({ orgId: "org-1", orgConfigId: "cfg-saka" }), settings);

    expect(resolved).toBe(sashakatjatest);
  });

  it("falls back to an orgId match for a record synced before orgConfigId existed", () => {
    const onlyOrg = org({ id: "cfg-1", orgId: "org-1" });
    const settings = settingsWith([onlyOrg]);

    const resolved = resolveOrgConfig(record({ orgId: "org-1", orgConfigId: undefined }), settings);

    expect(resolved).toBe(onlyOrg);
  });

  it("ignores an orgConfigId that no longer matches any configured entry, falling back to orgId", () => {
    const current = org({ id: "cfg-current", orgId: "org-1" });
    const settings = settingsWith([current]);

    const resolved = resolveOrgConfig(record({ orgId: "org-1", orgConfigId: "cfg-removed" }), settings);

    expect(resolved).toBe(current);
  });

  it("returns undefined when no configured entry matches by either orgConfigId or orgId", () => {
    const settings = settingsWith([org({ id: "cfg-other", orgId: "org-2" })]);

    const resolved = resolveOrgConfig(record({ orgId: "org-1", orgConfigId: "cfg-removed" }), settings);

    expect(resolved).toBeUndefined();
  });
});

function fullRecord(overrides: Partial<ClusterRecord> = {}): ClusterRecord {
  return {
    clusterId: "cluster-1",
    clusterName: "my-cluster",
    orgId: "org-1",
    orgName: "Org One",
    orgConfigId: "cfg-1",
    projectId: "project-1",
    projectName: "Project One",
    config: {
      cloudProvider: "aws",
      region: "us-east-1",
      nodeCount: 1,
      nodeSpec: { compute: { cpu: 4, ram: 16 } },
      status: "turnedOff",
    },
    createdAt: "2026-01-01T00:00:00.000Z",
    ownerDerived: null,
    lastActivityAt: null,
    lastActivitySource: "unknown",
    actualCost: { amountUsd: null, asOf: null },
    deletedAt: null,
    lastSyncedAt: "2026-01-01T00:00:00.000Z",
    lastObservedFingerprint: "",
    lastNotifiedAgeStatus: null,
    consentStatus: "none",
    consentCycleStartedAt: null,
    remindersSent: 0,
    consentTierAtDecision: null,
    actionOutcome: "none",
    slackChannelId: null,
    slackMessageTs: null,
    snoozeUntil: null,
    snoozeJustification: null,
    snoozeCount: 0,
    ...overrides,
  };
}

function fullSettings(overrides: Partial<Settings> = {}): Settings {
  return {
    capellaOrgs: [org()],
    capellaApiBaseUrl: "https://cloudapi.cloud.couchbase.com/v4",
    // Every test in this suite exercises manualTurnOn actually running -
    // the dedicated "developer toggle disabled" test below overrides this.
    developerTurnOnEnabled: true,
    ...overrides,
  } as Settings;
}

describe("manualTurnOn", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("turns the cluster on and appends a manual-turn-on history entry", async () => {
    const settings = fullSettings();
    const off = fullRecord();
    readSettings.mockResolvedValue(settings);
    getCluster.mockResolvedValue(off);

    const result = await manualTurnOn("cluster-1");

    expect(result).toEqual({ ok: true, message: "Turned on my-cluster." });
    expect(turnOnCluster).toHaveBeenCalledWith(org(), settings.capellaApiBaseUrl, "project-1", "cluster-1");
    expect(supersedeLiveMessage).toHaveBeenCalledWith(off, settings, expect.stringContaining("my-cluster"));
    expect(upsertClusters).toHaveBeenCalledWith([expect.objectContaining({ config: expect.objectContaining({ status: "healthy" }) })]);
    expect(appendHistoryIfChanged).toHaveBeenCalledWith(
      expect.objectContaining({ clusterId: "cluster-1" }),
      expect.objectContaining({ config: expect.objectContaining({ status: "healthy" }) }),
      "manual-turn-on",
      expect.any(String),
    );
  });

  it("returns a not-found result for an unknown cluster, without calling the API", async () => {
    readSettings.mockResolvedValue(fullSettings());
    getCluster.mockResolvedValue(null);

    const result = await manualTurnOn("missing-cluster");

    expect(result).toEqual({ ok: false, message: "Cluster not found." });
    expect(turnOnCluster).not.toHaveBeenCalled();
  });

  it("returns an error when the cluster's org is no longer configured, without calling the API", async () => {
    readSettings.mockResolvedValue(fullSettings({ capellaOrgs: [] }));
    getCluster.mockResolvedValue(fullRecord());

    const result = await manualTurnOn("cluster-1");

    expect(result.ok).toBe(false);
    expect(result.message).toContain("org-1");
    expect(turnOnCluster).not.toHaveBeenCalled();
  });

  it("refuses to turn on while the developer toggle is disabled, without calling the API", async () => {
    readSettings.mockResolvedValue(fullSettings({ developerTurnOnEnabled: false }));
    getCluster.mockResolvedValue(fullRecord());

    const result = await manualTurnOn("cluster-1");

    expect(result).toEqual({ ok: false, message: "Manual cluster turn-on is disabled in Settings." });
    expect(turnOnCluster).not.toHaveBeenCalled();
  });

  it("surfaces a Capella API failure without writing back cluster state", async () => {
    readSettings.mockResolvedValue(fullSettings());
    getCluster.mockResolvedValue(fullRecord());
    turnOnCluster.mockRejectedValue(new CapellaApiError("service unavailable", 503));

    const result = await manualTurnOn("cluster-1");

    expect(result).toEqual({ ok: false, message: "Couldn't turn on my-cluster: service unavailable" });
    expect(upsertClusters).not.toHaveBeenCalled();
    expect(appendHistoryIfChanged).not.toHaveBeenCalled();
  });

  it("supersedes a live pending consent message before turning the cluster on", async () => {
    const pending = fullRecord({ consentStatus: "pending", slackChannelId: "C1", slackMessageTs: "123" });
    readSettings.mockResolvedValue(fullSettings());
    getCluster.mockResolvedValue(pending);

    await manualTurnOn("cluster-1");

    expect(supersedeLiveMessage).toHaveBeenCalledWith(pending, fullSettings(), expect.stringContaining("Superseded"));
  });

  it("resets any pending/approved consent cycle, so reconciliation can't reverse the turn-on", async () => {
    // Regression test: a stale "approved-turnoff" left in place after a
    // manual turn-on used to survive untouched, and the reconciliation loop
    // (which only re-checks age/activity tier, never power state) would act
    // on it again a few minutes later - silently turning the cluster back
    // off right after the operator turned it on.
    const approved = fullRecord({
      consentStatus: "approved-turnoff",
      consentTierAtDecision: "Stale",
      actionOutcome: "none",
      slackChannelId: "C1",
      slackMessageTs: "123",
      snoozeCount: 2,
    });
    readSettings.mockResolvedValue(fullSettings());
    getCluster.mockResolvedValue(approved);
    turnOnCluster.mockResolvedValue(undefined);

    await manualTurnOn("cluster-1");

    expect(upsertClusters).toHaveBeenCalledWith([
      expect.objectContaining({
        consentStatus: "none",
        consentCycleStartedAt: null,
        remindersSent: 0,
        consentTierAtDecision: null,
        actionOutcome: "none",
        slackChannelId: null,
        slackMessageTs: null,
        snoozeUntil: null,
        snoozeJustification: null,
        snoozeCount: 0,
      }),
    ]);
  });
});
