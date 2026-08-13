import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ClusterRecord, OrgConfig, Settings } from "../types";

const { turnOffCluster, deleteCluster } = vi.hoisted(() => ({
  turnOffCluster: vi.fn(async () => undefined),
  deleteCluster: vi.fn(async () => undefined),
}));
vi.mock("./capellaClient", () => ({
  turnOffCluster,
  deleteCluster,
  TRANSITIONAL_STATUS: { turningOff: "turningOff", turningOn: "turningOn", destroying: "destroying" },
  CapellaApiError: class CapellaApiError extends Error {
    constructor(
      message: string,
      public readonly status: number | null,
    ) {
      super(message);
    }
  },
}));

const { readClusters, getCluster, upsertClusters, appendHistoryIfChanged } = vi.hoisted(() => ({
  readClusters: vi.fn(),
  getCluster: vi.fn(),
  upsertClusters: vi.fn(async () => undefined),
  appendHistoryIfChanged: vi.fn(async () => undefined),
}));
vi.mock("./store", () => ({ readClusters, getCluster, upsertClusters, appendHistoryIfChanged }));

const { readSettings } = vi.hoisted(() => ({ readSettings: vi.fn() }));
vi.mock("./settings", () => ({ readSettings }));

const { computeRecordAgeStatus } = vi.hoisted(() => ({ computeRecordAgeStatus: vi.fn() }));
vi.mock("./notifications", () => ({ computeRecordAgeStatus }));

const { resolveOrgConfig } = vi.hoisted(() => ({ resolveOrgConfig: vi.fn() }));
vi.mock("./manualActions", () => ({ resolveOrgConfig }));

vi.mock("./slack", () => ({ updateMessage: vi.fn(async () => undefined) }));

const { runReconciliationPass } = await import("./reconciliation");
const { CapellaApiError } = await import("./capellaClient");

function org(overrides: Partial<OrgConfig> = {}): OrgConfig {
  return { id: "cfg-1", orgId: "org-1", apiKey: "key-1", ...overrides };
}

function fullSettings(overrides: Partial<Settings> = {}): Settings {
  return { capellaOrgs: [org()], capellaApiBaseUrl: "https://cloudapi.cloud.couchbase.com/v4", ...overrides } as Settings;
}

function approvedRecord(overrides: Partial<ClusterRecord> = {}): ClusterRecord {
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
      status: "healthy",
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
    consentStatus: "approved-turnoff",
    consentCycleStartedAt: "2026-01-01T00:00:00.000Z",
    remindersSent: 0,
    consentTierAtDecision: "Stale",
    actionOutcome: "none",
    slackChannelId: null,
    slackMessageTs: null,
    snoozeUntil: null,
    snoozeJustification: null,
    snoozeCount: 0,
    consentStatusChangedAt: "2026-01-01T00:00:00.000Z",
    workflowNote: null,
    ...overrides,
  };
}

describe("runReconciliationPass", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    readSettings.mockResolvedValue(fullSettings());
    computeRecordAgeStatus.mockReturnValue("Stale");
    resolveOrgConfig.mockReturnValue(org());
  });

  it("records Capella's own in-progress state after a performed turn-off, not the prior status", async () => {
    const approved = approvedRecord({ consentStatus: "approved-turnoff" });
    readClusters.mockResolvedValue([approved]);
    getCluster.mockResolvedValue(approved);

    const result = await runReconciliationPass();

    expect(result.performed).toBe(1);
    expect(turnOffCluster).toHaveBeenCalledWith(org(), fullSettings().capellaApiBaseUrl, "project-1", "cluster-1");
    expect(upsertClusters).toHaveBeenCalledWith([
      expect.objectContaining({
        actionOutcome: "performed",
        config: expect.objectContaining({ status: "turningOff" }),
      }),
    ]);
  });

  it("records Capella's own in-progress state after a performed delete", async () => {
    const approved = approvedRecord({ consentStatus: "approved-delete" });
    readClusters.mockResolvedValue([approved]);
    getCluster.mockResolvedValue(approved);

    const result = await runReconciliationPass();

    expect(result.performed).toBe(1);
    expect(deleteCluster).toHaveBeenCalledWith(org(), fullSettings().capellaApiBaseUrl, "project-1", "cluster-1");
    expect(upsertClusters).toHaveBeenCalledWith([
      expect.objectContaining({
        actionOutcome: "performed",
        config: expect.objectContaining({ status: "destroying" }),
      }),
    ]);
  });

  it("leaves config.status untouched when the action is skipped after re-verification", async () => {
    const approved = approvedRecord({ consentTierAtDecision: "Stale" });
    computeRecordAgeStatus.mockReturnValue("In Use"); // recovered - no longer matches the decision tier
    readClusters.mockResolvedValue([approved]);
    getCluster.mockResolvedValue(approved);

    const result = await runReconciliationPass();

    expect(result.skipped).toBe(1);
    expect(turnOffCluster).not.toHaveBeenCalled();
    expect(upsertClusters).toHaveBeenCalledWith([
      expect.objectContaining({
        actionOutcome: "skipped",
        config: expect.objectContaining({ status: "healthy" }),
        workflowNote: "the cluster no longer warranted the action by the time of re-verification",
      }),
    ]);
  });

  it("leaves config.status untouched when the Capella call fails, persisting the underlying error as the explanation", async () => {
    const approved = approvedRecord();
    readClusters.mockResolvedValue([approved]);
    getCluster.mockResolvedValue(approved);
    turnOffCluster.mockRejectedValueOnce(new CapellaApiError("service unavailable", 503));

    const result = await runReconciliationPass();

    expect(result.failed).toBe(1);
    expect(upsertClusters).toHaveBeenCalledWith([
      expect.objectContaining({
        actionOutcome: "failed",
        config: expect.objectContaining({ status: "healthy" }),
        workflowNote: "service unavailable",
      }),
    ]);
  });

  it("persists an explanation when the cluster's org is no longer configured", async () => {
    const approved = approvedRecord();
    readClusters.mockResolvedValue([approved]);
    getCluster.mockResolvedValue(approved);
    resolveOrgConfig.mockReturnValue(undefined);

    const result = await runReconciliationPass();

    expect(result.failed).toBe(1);
    expect(turnOffCluster).not.toHaveBeenCalled();
    expect(upsertClusters).toHaveBeenCalledWith([
      expect.objectContaining({ actionOutcome: "failed", workflowNote: "org-1 is no longer configured in Settings." }),
    ]);
  });

  it("clears workflowNote on a performed outcome", async () => {
    const approved = approvedRecord({ workflowNote: "the maximum of 3 snooze(s) was reached" });
    readClusters.mockResolvedValue([approved]);
    getCluster.mockResolvedValue(approved);

    await runReconciliationPass();

    expect(upsertClusters).toHaveBeenCalledWith([expect.objectContaining({ actionOutcome: "performed", workflowNote: null })]);
  });
});
