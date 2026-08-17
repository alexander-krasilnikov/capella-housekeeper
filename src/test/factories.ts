/**
 * Shared test data builders.
 *
 * These defaults were previously copied verbatim into store.test.ts,
 * historyFields.test.ts and historyView.test.ts (three byte-identical
 * `makeRecord` definitions), with two further variants in
 * manualActions.test.ts. Centralizing them means a new `ClusterRecord` field
 * is added in one place rather than five - and the integration harness needs
 * the same builders, which would have made it six.
 *
 * Test-only module: nothing under `app/` or `src/lib/` imports it, so it
 * never reaches a production bundle. It is still type-checked by `tsc`,
 * which is the point - a factory that drifts from `ClusterRecord` fails the
 * type check rather than silently producing malformed fixtures.
 */
import { DEFAULT_SETTINGS } from "../types";
import type { ClusterRecord, ClusterSnapshot, OrgConfig, Settings } from "../types";

/**
 * A complete, internally consistent `ClusterRecord` with no consent cycle in
 * progress - the neutral starting point most tests then push in one
 * direction via `overrides`.
 */
export function makeClusterRecord(overrides: Partial<ClusterRecord> = {}): ClusterRecord {
  return {
    clusterId: "c1",
    clusterName: "test-cluster",
    orgId: "org1",
    orgName: "Org",
    projectId: "proj1",
    projectName: "Project",
    config: {
      cloudProvider: "aws",
      region: "us-east-1",
      couchbaseVersion: "8.0.0",
      nodeCount: 3,
      nodeSpec: { compute: { cpu: 4, ram: 16 } },
      status: "healthy",
    },
    createdAt: "2026-01-01T00:00:00.000Z",
    ownerDerived: "owner@example.com",
    lastActivityAt: "2026-01-01T00:00:00.000Z",
    lastActivitySource: "sync-observed",
    actualCost: { amountUsd: 100, asOf: "2026-01-01T00:00:00.000Z" },
    deletedAt: null,
    lastSyncedAt: "2026-01-01T00:00:00.000Z",
    lastObservedFingerprint: "abc",
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
    consentStatusChangedAt: null,
    workflowNote: null,
    ...overrides,
  };
}

/** A history snapshot wrapping `record`, defaulting `clusterId` to that record's own. */
export function makeClusterSnapshot(
  overrides: Partial<ClusterSnapshot> & { record: ClusterRecord },
): ClusterSnapshot {
  return {
    clusterId: overrides.record.clusterId,
    takenAt: "2026-01-01T00:00:00.000Z",
    trigger: "sync",
    ...overrides,
  };
}

/**
 * Real `DEFAULT_SETTINGS` plus a `sessionSecret` (deliberately absent from
 * the defaults - see its comment in types.ts), so tests exercise the same
 * thresholds a fresh install gets rather than invented ones.
 */
export function makeSettings(overrides: Partial<Settings> = {}): Settings {
  return {
    ...DEFAULT_SETTINGS,
    sessionSecret: "test-session-secret",
    ...overrides,
  };
}

export function makeOrgConfig(overrides: Partial<OrgConfig> = {}): OrgConfig {
  return { id: "cfg-1", orgId: "org-1", apiKey: "key-1", ...overrides };
}
