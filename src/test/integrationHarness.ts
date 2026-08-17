/**
 * Integration harness: fakes only the two impure boundaries and runs
 * everything else for real.
 *
 *   ┌──────────────────────────────────────────────┐
 *   │ capellaClient  ← network            FAKED    │
 *   │ slack          ← Slack HTTP         FAKED    │
 *   ├──────────────────────────────────────────────┤
 *   │ sync · notifications · reconciliation        │
 *   │ store · settings · historyFields · ageStatus │   ALL REAL
 *   ├──────────────────────────────────────────────┤
 *   │ db.getDb()     ← disk        :memory: SQLite │
 *   └──────────────────────────────────────────────┘
 *
 * This is what makes it possible to test the orchestration layer's actual
 * behaviour - multi-cycle history gating, consent state transitions, and the
 * mid-cycle stale-snapshot races the code comments describe - none of which can
 * be reached by mocking `store` itself, because ordering against a real store
 * *is* the thing under test.
 *
 * Mocking must be declared by the test file itself (vi.mock is hoisted per
 * module), so this module supplies the state and the builders those mock
 * factories close over rather than registering them. See
 * sync.integration.test.ts for the intended arrangement, and design.md
 * Decisions 1 and 6 in the harden-test-suite change.
 */
import { DatabaseSync } from "node:sqlite";
import { bootstrapSchema } from "../lib/db";
import type {
  ActivityLogEvent,
  BillingResult,
  CapellaClusterConfig,
  CapellaProject,
} from "../lib/capellaClient";
import type { SlackMessage, SlackSendOutcome } from "../lib/slack";

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------

/**
 * The live in-memory database for the current test. Mutable and module-level
 * because a test file's `vi.mock("../lib/db")` factory has to close over
 * something that `resetHarness()` can then swap per test.
 */
export let harnessDb: DatabaseSync;

// ---------------------------------------------------------------------------
// Faked Capella API
// ---------------------------------------------------------------------------

/** How one org's projects and clusters respond this cycle. */
export interface FakeOrgState {
  /** Display name returned by getOrganization; omit to make that call fail. */
  name?: string;
  projects: CapellaProject[];
  /** Clusters per project id. A project absent from this map lists nothing. */
  clustersByProject: Record<string, CapellaClusterConfig[]>;
  /** Project ids whose listClusters call should fail with a CapellaApiError. */
  failingProjectIds?: string[];
  /** Set to fail listProjects outright, skipping the whole org this cycle. */
  failProjects?: boolean;
}

export interface FakeCapellaState {
  /** Keyed by orgId. */
  orgs: Record<string, FakeOrgState>;
  /** User id -> the record getUser resolves; a missing id makes getUser fail. */
  users: Record<string, { id: string; name?: string; email?: string }>;
  /** Cluster id -> its activity log events; absent means "log not reachable". */
  activityByCluster: Record<string, ActivityLogEvent[]>;
  /** Cluster id -> billing result; absent falls back to `defaultBilling`. */
  billingByCluster: Record<string, BillingResult>;
  defaultBilling: BillingResult;
  /** Cluster ids whose turnOff/delete write should fail with a CapellaApiError. */
  failingWriteClusterIds: string[];
  /**
   * Optional async interceptors, awaited by the corresponding faked call
   * before it returns. A test assigns one (typically `gate.arrive`) to suspend
   * a sync cycle at a chosen point - see `createGate`.
   */
  hooks: {
    beforeBillingCall?: (clusterId: string) => Promise<void>;
    beforeListClusters?: (projectId: string) => Promise<void>;
    beforeActivityLog?: (clusterId: string) => Promise<void>;
    /**
     * Awaited by turnOffCluster/deleteCluster before they return. These are the
     * calls that can take up to 120s in production, which is the whole reason
     * reconciliation.ts re-reads the record fresh afterwards - so this is the
     * hook for testing what happens when another writer lands in that window.
     */
    beforeClusterWrite?: (clusterId: string) => Promise<void>;
  };
}

/** Every Capella call the harness observed, in order - for asserting on call counts and caching. */
export interface CapellaCallLog {
  getOrganization: string[];
  listProjects: string[];
  listClusters: Array<{ orgId: string; projectId: string }>;
  getUser: string[];
  getActivityLog: string[];
  getBillingUsage: string[];
  turnOffCluster: string[];
  deleteCluster: string[];
}

export let capella: FakeCapellaState;
export let capellaCalls: CapellaCallLog;

// ---------------------------------------------------------------------------
// Faked Slack
// ---------------------------------------------------------------------------

export interface SlackSendRecord {
  email: string;
  message: SlackMessage;
}

export interface SlackUpdateRecord {
  channelId: string;
  messageTs: string;
  text: string;
}

export interface FakeSlackState {
  sends: SlackSendRecord[];
  updates: SlackUpdateRecord[];
  /** What sendConsentDM returns. Defaults to a successful send. */
  nextSendOutcome: SlackSendOutcome | null;
  /** Incremented per successful send so each gets a distinct message ts. */
  sendCounter: number;
}

export let slack: FakeSlackState;

// ---------------------------------------------------------------------------
// Deferred gate - for provoking mid-cycle races
// ---------------------------------------------------------------------------

/**
 * A one-shot rendezvous: `arrive()` blocks its caller until `release()` is
 * called, and `reached` resolves the moment a caller has arrived.
 *
 * This is what makes the stale-snapshot race class testable. A test parks a
 * faked Capella call inside a running sync cycle, writes to the store while the
 * cycle is suspended there, then releases it - so the cycle resumes holding a
 * snapshot that is now genuinely stale, exactly as it would in production when
 * a Slack click lands during a slow API sequence. See design.md Decision 7.
 */
export interface Gate {
  /** Resolves once some caller has reached `arrive()`. */
  reached: Promise<void>;
  /** Called by the faked API function; blocks until `release()`. */
  arrive: () => Promise<void>;
  /** Lets the parked caller proceed. */
  release: () => void;
}

export function createGate(): Gate {
  let announceReached!: () => void;
  let allowRelease!: () => void;
  const reached = new Promise<void>((resolve) => {
    announceReached = resolve;
  });
  const released = new Promise<void>((resolve) => {
    allowRelease = resolve;
  });
  return {
    reached,
    arrive: async () => {
      announceReached();
      await released;
    },
    release: allowRelease,
  };
}

// ---------------------------------------------------------------------------
// Reset
// ---------------------------------------------------------------------------

/**
 * Fresh database and fresh fake state. Call from `beforeEach`.
 *
 * Also clears the two `globalThis` fields slackBot.ts keeps its connection
 * state on - `vi.resetModules()` does not touch those, so without this a test
 * would observe the previous test's Slack status.
 */
export function resetHarness(): void {
  harnessDb = new DatabaseSync(":memory:");
  bootstrapSchema(harnessDb);

  capella = {
    orgs: {},
    users: {},
    activityByCluster: {},
    billingByCluster: {},
    defaultBilling: { ok: true, amountUsd: 100, asOf: "2026-01-01T00:00:00.000Z" },
    failingWriteClusterIds: [],
    hooks: {},
  };
  capellaCalls = {
    getOrganization: [],
    listProjects: [],
    listClusters: [],
    getUser: [],
    getActivityLog: [],
    getBillingUsage: [],
    turnOffCluster: [],
    deleteCluster: [],
  };

  slack = { sends: [], updates: [], nextSendOutcome: null, sendCounter: 0 };

  delete globalThis.__capellaHousekeeperSlackBotStatus;
  delete globalThis.__capellaHousekeeperSlackReceiver;
}

// ---------------------------------------------------------------------------
// Cluster-shaped API payload builder
// ---------------------------------------------------------------------------

/** A `CapellaClusterConfig` as the real API would return it. */
export function makeApiCluster(overrides: Partial<CapellaClusterConfig> = {}): CapellaClusterConfig {
  return {
    id: "c1",
    name: "test-cluster",
    cloudProvider: { type: "aws", region: "us-east-1" },
    couchbaseServer: { version: "8.0.0" },
    serviceGroups: [{ node: { compute: { cpu: 4, ram: 16 } }, numOfNodes: 3 }],
    audit: { createdAt: "2026-01-01T00:00:00.000Z" },
    currentState: "healthy",
    ...overrides,
  };
}

/**
 * Convenience: register a single org with a single project holding `clusters`.
 * Most scenarios need nothing more elaborate.
 */
export function givenSingleOrg(
  clusters: CapellaClusterConfig[],
  options: { orgId?: string; projectId?: string; orgName?: string; projectName?: string } = {},
): void {
  const orgId = options.orgId ?? "org-1";
  const projectId = options.projectId ?? "proj-1";
  capella.orgs[orgId] = {
    name: options.orgName ?? "Org One",
    projects: [{ id: projectId, name: options.projectName ?? "Project One" }],
    clustersByProject: { [projectId]: clusters },
  };
}

// ---------------------------------------------------------------------------
// Fake implementations
// ---------------------------------------------------------------------------

/**
 * The functions a test file's `vi.mock("../lib/capellaClient")` factory should
 * delegate to. Built lazily against the module-level `capella`/`capellaCalls`
 * state so `resetHarness()` can swap that state between tests without the mock
 * registration needing to change.
 *
 * `CapellaApiError` is passed in rather than imported, because the mock factory
 * must supply the *real* class (via `importActual`) for the production code's
 * `err instanceof CapellaApiError` checks to behave correctly.
 */
export function buildCapellaFake(CapellaApiError: new (message: string, status: number | null) => Error) {
  const orgState = (orgId: string): FakeOrgState =>
    capella.orgs[orgId] ?? { projects: [], clustersByProject: {} };

  return {
    getOrganization: async (org: { orgId: string }) => {
      capellaCalls.getOrganization.push(org.orgId);
      const state = orgState(org.orgId);
      if (state.name === undefined) throw new CapellaApiError("org name unavailable", 403);
      return { id: org.orgId, name: state.name };
    },

    listProjects: async (org: { orgId: string }) => {
      capellaCalls.listProjects.push(org.orgId);
      const state = orgState(org.orgId);
      if (state.failProjects) throw new CapellaApiError("failed to list projects", 500);
      return state.projects;
    },

    listClusters: async (org: { orgId: string }, _baseUrl: string, projectId: string) => {
      capellaCalls.listClusters.push({ orgId: org.orgId, projectId });
      await capella.hooks.beforeListClusters?.(projectId);
      const state = orgState(org.orgId);
      if (state.failingProjectIds?.includes(projectId)) {
        throw new CapellaApiError(`failed to list clusters for ${projectId}`, 500);
      }
      return state.clustersByProject[projectId] ?? [];
    },

    getUser: async (_org: unknown, _baseUrl: string, userId: string) => {
      capellaCalls.getUser.push(userId);
      const user = capella.users[userId];
      if (!user) throw new CapellaApiError(`no such user ${userId}`, 404);
      return user;
    },

    getActivityLog: async (_org: unknown, _baseUrl: string, clusterId: string) => {
      capellaCalls.getActivityLog.push(clusterId);
      await capella.hooks.beforeActivityLog?.(clusterId);
      const events = capella.activityByCluster[clusterId];
      // Absent means "not reachable" - the real client surfaces that as a
      // CapellaApiError, which sync.ts treats as "fall back to other signals".
      if (!events) throw new CapellaApiError("activity log not available", 403);
      return events;
    },

    getBillingUsage: async (_org: unknown, _baseUrl: string, _projectId: string, clusterId: string) => {
      capellaCalls.getBillingUsage.push(clusterId);
      await capella.hooks.beforeBillingCall?.(clusterId);
      return capella.billingByCluster[clusterId] ?? capella.defaultBilling;
    },

    turnOffCluster: async (_org: unknown, _baseUrl: string, _projectId: string, clusterId: string) => {
      capellaCalls.turnOffCluster.push(clusterId);
      await capella.hooks.beforeClusterWrite?.(clusterId);
      if (capella.failingWriteClusterIds.includes(clusterId)) {
        throw new CapellaApiError(`turn-off refused for ${clusterId}`, 422);
      }
    },

    deleteCluster: async (_org: unknown, _baseUrl: string, _projectId: string, clusterId: string) => {
      capellaCalls.deleteCluster.push(clusterId);
      await capella.hooks.beforeClusterWrite?.(clusterId);
      if (capella.failingWriteClusterIds.includes(clusterId)) {
        throw new CapellaApiError(`delete refused for ${clusterId}`, 422);
      }
    },
  };
}

/**
 * The functions a test file's `vi.mock("../lib/slack")` factory should delegate
 * to. Every send and in-place update is recorded rather than performed, so a
 * test can assert on what the owner would have seen.
 *
 * The pure builders (`buildConsentMessage`, `canAutoTurnOff`, `isAlreadyOff`,
 * ...) are deliberately NOT faked - the mock factory should spread
 * `importActual` so those keep running for real. Only the three functions that
 * would reach Slack's HTTP API are replaced.
 */
export function buildSlackFake() {
  return {
    sendConsentDM: async (_botToken: string, email: string, message: SlackMessage): Promise<SlackSendOutcome> => {
      slack.sends.push({ email, message });
      if (slack.nextSendOutcome) return slack.nextSendOutcome;
      slack.sendCounter += 1;
      return { ok: true, channelId: "D0HARNESS", messageTs: `1767225600.0000${slack.sendCounter}` };
    },

    updateMessage: async (_botToken: string, channelId: string, messageTs: string, text: string): Promise<void> => {
      slack.updates.push({ channelId, messageTs, text });
    },

    testSlackConnection: async () => ({ ok: true, checks: [] }),
  };
}
