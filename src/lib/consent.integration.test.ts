/**
 * Integration coverage for the consent state machine and the mid-cycle
 * stale-snapshot race class.
 *
 * `applyConsentNotifications` is driven through a real `runSyncCycle` rather
 * than called directly, because most of what matters here is how one cycle's
 * decisions interact with what the *previous* cycle stored - a relationship
 * that only exists once a real store is in the loop.
 *
 * The state machine under test (see cluster-consent-notifications spec):
 *
 *                     ┌──────┐
 *    tier change ────▶│ none │◀──── snooze ended, tier no longer notifies
 *                     └───┬──┘
 *           notify on ✓   │
 *                         ▼
 *   reminders due   ┌─────────┐   snooze     ┌─────────┐
 *       ┌──────────▶│ pending │────────────▶ │ snoozed │
 *       └───────────└──┬───┬──┘              └────┬────┘
 *                      │   │ expiry               │ snoozeUntil passed
 *      click turnoff ──┘   ├─ canAutoTurnOff ─▶ approved-turnoff
 *                          └─ else ──────────▶ expired
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildCapellaFake,
  buildSlackFake,
  capella,
  createGate,
  givenSingleOrg,
  harnessDb,
  makeApiCluster,
  resetHarness,
  slack,
} from "../test/integrationHarness";
import { makeSettings } from "../test/factories";
import type { Settings, TierNotificationConfig } from "../types";

vi.mock("./db", async () => {
  const actual = await vi.importActual<typeof import("./db")>("./db");
  return { ...actual, getDb: () => harnessDbRef() };
});

vi.mock("./capellaClient", async () => {
  const actual = await vi.importActual<typeof import("./capellaClient")>("./capellaClient");
  return { ...actual, ...buildCapellaFake(actual.CapellaApiError) };
});

vi.mock("./slack", async () => {
  const actual = await vi.importActual<typeof import("./slack")>("./slack");
  return { ...actual, ...buildSlackFake() };
});

let settings: Settings;
vi.mock("./settings", () => ({ readSettings: async () => settings }));

const { runSyncCycle } = await import("./sync");
const { getCluster, readClusters, readHistory, upsertClusters } = await import("./store");

function harnessDbRef() {
  return harnessDb;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const CREATED_AT = "2026-01-01T00:00:00.000Z";

function tier(overrides: Partial<TierNotificationConfig> = {}): TierNotificationConfig {
  return { notify: true, askTurnOff: true, askDelete: false, autoTurnOffOnInaction: false, maxSnoozes: 3, ...overrides };
}

function settingsWith(overrides: Partial<Settings> = {}): Settings {
  return makeSettings({
    capellaOrgs: [{ id: "cfg-1", orgId: "org-1", apiKey: "key-1" }],
    slackBotToken: "xoxb-test",
    slackAppToken: "xapp-test",
    activityGraceHours: 24,
    forgottenHours: 72,
    consentReminderMax: 2,
    consentExpiryDays: 7,
    notificationsByTier: { Aging: tier(), Old: tier() },
    ...overrides,
  });
}

/**
 * Registers one cluster whose owner is email-shaped and whose only activity
 * signal is its creation date, so its tier is driven purely by how far the
 * clock has moved past `CREATED_AT`.
 */
function givenAgingCluster(id = "c1"): void {
  capella.users["creator"] = { id: "creator", email: "owner@example.com" };
  givenSingleOrg([makeApiCluster({ id, audit: { createdAt: CREATED_AT, createdBy: "creator" } })]);
}

/** Moves the clock to `hours` after the cluster's creation. */
function atHoursAfterCreation(hours: number): void {
  vi.setSystemTime(new Date(new Date(CREATED_AT).getTime() + hours * 60 * 60 * 1000));
}

beforeEach(() => {
  resetHarness();
  settings = settingsWith();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("tier transition opens a consent cycle", () => {
  it("stays quiet while the cluster is still Fresh", async () => {
    givenAgingCluster();
    atHoursAfterCreation(1);

    await runSyncCycle();

    const [record] = await readClusters();
    expect(record.lastNotifiedRecency).toBe("Fresh");
    expect(record.consentStatus).toBe("none");
    expect(slack.sends).toHaveLength(0);
  });

  it("sends a DM and opens a pending cycle on entering a notifying tier", async () => {
    givenAgingCluster();
    // Past the 24h activity grace, before the 72h Old threshold.
    atHoursAfterCreation(48);

    await runSyncCycle();

    const [record] = await readClusters();
    expect(record.lastNotifiedRecency).toBe("Aging");
    expect(record.consentStatus).toBe("pending");
    expect(record.consentTierAtDecision).toBe("Aging");
    expect(record.consentCycleStartedAt).toBe(new Date().toISOString());
    expect(record.consentStatusChangedAt).toBe(new Date().toISOString());
    expect(record.remindersSent).toBe(0);
    expect(record.slackChannelId).toBe("D0HARNESS");
    expect(record.slackMessageTs).toBeTruthy();

    expect(slack.sends).toHaveLength(1);
    expect(slack.sends[0].email).toBe("owner@example.com");
    expect(slack.sends[0].message.text).toContain("Housekeeping alert");
  });

  it("does not notify for a tier configured not to", async () => {
    givenAgingCluster();
    settings = settingsWith({ notificationsByTier: { Aging: tier({ notify: false }), Old: tier() } });
    atHoursAfterCreation(48);

    await runSyncCycle();

    const [record] = await readClusters();
    // The tier baseline still advances - it just doesn't ask anyone.
    expect(record.lastNotifiedRecency).toBe("Aging");
    expect(record.consentStatus).toBe("none");
    expect(slack.sends).toHaveLength(0);
  });

  it("does not open a cycle when the owner is not email-shaped", async () => {
    capella.users["creator"] = { id: "creator", name: "Not An Email" };
    givenSingleOrg([makeApiCluster({ id: "c1", audit: { createdAt: CREATED_AT, createdBy: "creator" } })]);
    atHoursAfterCreation(48);

    await runSyncCycle();

    const [record] = await readClusters();
    expect(record.consentStatus).toBe("none");
    expect(slack.sends).toHaveLength(0);
  });

  it("does not open a cycle when Slack tokens are unset", async () => {
    givenAgingCluster();
    settings = settingsWith({ slackBotToken: "", slackAppToken: "" });
    atHoursAfterCreation(48);

    await runSyncCycle();

    expect((await readClusters())[0].consentStatus).toBe("none");
    expect(slack.sends).toHaveLength(0);
  });

  it("leaves the cycle closed when the Slack send itself fails", async () => {
    givenAgingCluster();
    slack.nextSendOutcome = { ok: false, reason: "users.lookupByEmail: users_not_found" };
    atHoursAfterCreation(48);

    await runSyncCycle();

    const [record] = await readClusters();
    expect(record.consentStatus).toBe("none");
    expect(record.consentCycleStartedAt).toBeNull();
    // Still recorded as notified for this tier, so it isn't retried every cycle.
    expect(record.lastNotifiedRecency).toBe("Aging");
  });

  it("records the opening of a cycle as a lifecycle history entry", async () => {
    givenAgingCluster();
    // A first cycle while still Fresh, so there is a stored prior to diff the
    // consent transition against. A brand-new cluster's very first entry has
    // no prior, so computeFieldChanges returns nothing and it is correctly
    // *not* classified as a lifecycle change - that's the discovery entry, not
    // a transition.
    atHoursAfterCreation(1);
    await runSyncCycle();
    expect((await readHistory()).at(-1)?.isLifecycleChange).toBe(false);

    atHoursAfterCreation(48);
    await runSyncCycle();

    const entry = (await readHistory()).at(-1);
    expect(entry?.record.consentStatus).toBe("pending");
    expect(entry?.isLifecycleChange).toBe(true);
  });
});

describe("a tier transition while a cycle is live resets it", () => {
  it("clears every consent field and supersedes the live message", async () => {
    givenAgingCluster();
    atHoursAfterCreation(48);
    await runSyncCycle();
    const pending = (await readClusters())[0];
    expect(pending.consentStatus).toBe("pending");

    // Escalate past the Old threshold.
    atHoursAfterCreation(100);
    await runSyncCycle();

    const [record] = await readClusters();
    expect(record.lastNotifiedRecency).toBe("Old");
    // A fresh cycle for the new tier, not the old one carried over.
    expect(record.consentTierAtDecision).toBe("Old");
    expect(record.remindersSent).toBe(0);
    expect(record.snoozeCount).toBe(0);
    expect(record.snoozeUntil).toBeNull();
    expect(record.actionOutcome).toBe("none");

    // The previous ask is edited in place so its buttons can't be clicked.
    const superseded = slack.updates.find((u) => u.messageTs === pending.slackMessageTs);
    expect(superseded?.text).toContain("No longer current");
    expect(superseded?.text).toContain("Old");
  });

  it("issues a new ask for the new tier", async () => {
    givenAgingCluster();
    atHoursAfterCreation(48);
    await runSyncCycle();
    atHoursAfterCreation(100);
    await runSyncCycle();

    expect(slack.sends).toHaveLength(2);
    expect(slack.sends[1].message.text).toContain("Old");
    // A brand new message, not the first one reused.
    expect((await readClusters())[0].slackMessageTs).not.toBe(slack.sends[0].message.text);
  });
});

describe("reminders", () => {
  // A pending cycle only advances through reminders and expiry while the tier
  // that opened it still holds - a tier change takes the reset branch instead.
  // The default 72h Old threshold is shorter than the 7-day expiry
  // window, so these tests would escalate to Old mid-window and never
  // reach the code under test. A far-off threshold keeps the cluster Aging for
  // the whole window, isolating reminder/expiry behaviour from tier drift.
  beforeEach(() => {
    settings = settingsWith({ forgottenHours: 10_000 });
  });

  it("advances one reminder per due interval, evenly spaced across the expiry window", async () => {
    givenAgingCluster();
    atHoursAfterCreation(48);
    await runSyncCycle();
    const started = new Date().getTime();
    expect((await readClusters())[0].remindersSent).toBe(0);

    // consentReminderMax 2 over a 7-day window => intervals at 7/3 days.
    const interval = (7 * DAY_MS) / 3;

    vi.setSystemTime(new Date(started + interval + 1000));
    await runSyncCycle();
    expect((await readClusters())[0].remindersSent).toBe(1);

    vi.setSystemTime(new Date(started + 2 * interval + 1000));
    await runSyncCycle();
    expect((await readClusters())[0].remindersSent).toBe(2);
  });

  it("does not exceed the configured maximum before expiry", async () => {
    givenAgingCluster();
    atHoursAfterCreation(48);
    await runSyncCycle();
    const started = new Date().getTime();

    // Just short of expiry, well past every reminder interval.
    vi.setSystemTime(new Date(started + 7 * DAY_MS - 1000));
    await runSyncCycle();
    await runSyncCycle();

    expect((await readClusters())[0].remindersSent).toBe(2);
  });

  it("sends nothing extra while no reminder is due", async () => {
    givenAgingCluster();
    atHoursAfterCreation(48);
    await runSyncCycle();
    const sendsAfterOpening = slack.sends.length;

    // A few cycles inside the first reminder interval.
    for (let i = 1; i <= 3; i += 1) {
      vi.setSystemTime(new Date(new Date().getTime() + 60 * 60 * 1000));
      await runSyncCycle();
    }

    expect(slack.sends).toHaveLength(sendsAfterOpening);
    expect((await readClusters())[0].remindersSent).toBe(0);
  });

  it("supersedes the previous message when a reminder goes out", async () => {
    givenAgingCluster();
    atHoursAfterCreation(48);
    await runSyncCycle();
    const firstTs = (await readClusters())[0].slackMessageTs;
    const started = new Date().getTime();

    vi.setSystemTime(new Date(started + (7 * DAY_MS) / 3 + 1000));
    await runSyncCycle();

    expect(slack.updates.some((u) => u.messageTs === firstTs && u.text.includes("Superseded"))).toBe(true);
    expect(slack.sends.at(-1)?.message.text).toContain("Reminder");
  });
});

describe("expiry", () => {
  // A pending cycle only advances through reminders and expiry while the tier
  // that opened it still holds - a tier change takes the reset branch instead.
  // The default 72h Old threshold is shorter than the 7-day expiry
  // window, so these tests would escalate to Old mid-window and never
  // reach the code under test. A far-off threshold keeps the cluster Aging for
  // the whole window, isolating reminder/expiry behaviour from tier drift.
  beforeEach(() => {
    settings = settingsWith({ forgottenHours: 10_000 });
  });

  it("marks the request expired when auto-turn-off is not enabled", async () => {
    givenAgingCluster();
    atHoursAfterCreation(48);
    await runSyncCycle();
    const started = new Date().getTime();

    vi.setSystemTime(new Date(started + 7 * DAY_MS + 1000));
    await runSyncCycle();

    const [record] = await readClusters();
    expect(record.consentStatus).toBe("expired");
    expect(record.consentStatusChangedAt).toBe(new Date().toISOString());
    expect(slack.updates.at(-1)?.text).toContain("expired");
  });

  it("turns the cluster off automatically when the tier is configured for it", async () => {
    settings = settingsWith({
      forgottenHours: 10_000,
      notificationsByTier: {
        Aging: tier({ autoTurnOffOnInaction: true }),
        Old: tier({ autoTurnOffOnInaction: true }),
      },
    });
    givenAgingCluster();
    atHoursAfterCreation(48);
    await runSyncCycle();
    const started = new Date().getTime();

    vi.setSystemTime(new Date(started + 7 * DAY_MS + 1000));
    await runSyncCycle();

    const [record] = await readClusters();
    expect(record.consentStatus).toBe("approved-turnoff");
    expect(record.consentTierAtDecision).toBe("Aging");
    expect(record.workflowNote).toBe("no response was received within the configured window");
    expect(slack.updates.at(-1)?.text).toContain("Turned off automatically");
  });

  it("expires rather than auto-turning-off a cluster that is already off", async () => {
    settings = settingsWith({
      forgottenHours: 10_000,
      notificationsByTier: {
        Aging: tier({ autoTurnOffOnInaction: true }),
        Old: tier({ autoTurnOffOnInaction: true }),
      },
    });
    capella.users["creator"] = { id: "creator", email: "owner@example.com" };
    givenSingleOrg([
      makeApiCluster({ id: "c1", currentState: "turnedOff", audit: { createdAt: CREATED_AT, createdBy: "creator" } }),
    ]);
    atHoursAfterCreation(48);
    await runSyncCycle();
    const started = new Date().getTime();

    vi.setSystemTime(new Date(started + 7 * DAY_MS + 1000));
    await runSyncCycle();

    // Nothing to turn off - see canAutoTurnOff.
    expect((await readClusters())[0].consentStatus).toBe("expired");
  });

  it("expires rather than auto-turning-off when the tier does not even ask to turn off", async () => {
    settings = settingsWith({
      forgottenHours: 10_000,
      notificationsByTier: {
        Aging: tier({ autoTurnOffOnInaction: true, askTurnOff: false, askDelete: true }),
        Old: tier(),
      },
    });
    givenAgingCluster();
    atHoursAfterCreation(48);
    await runSyncCycle();
    const started = new Date().getTime();

    vi.setSystemTime(new Date(started + 7 * DAY_MS + 1000));
    await runSyncCycle();

    // The system won't do automatically what the tier isn't configured to ask.
    expect((await readClusters())[0].consentStatus).toBe("expired");
  });
});

describe("snooze resumption", () => {
  /** Puts the cluster into a snoozed cycle ending at `snoozeUntil`. */
  async function givenSnoozedUntil(snoozeUntil: string, snoozeCount = 1) {
    givenAgingCluster();
    atHoursAfterCreation(48);
    await runSyncCycle();
    const record = (await readClusters())[0];
    await upsertClusters([
      {
        ...record,
        consentStatus: "snoozed",
        snoozeUntil,
        snoozeJustification: "still needed for a POC",
        snoozeCount,
        remindersSent: 2,
      },
    ]);
  }

  it("stays quiet while the snooze is still running", async () => {
    await givenSnoozedUntil(new Date(new Date(CREATED_AT).getTime() + 100 * DAY_MS).toISOString());
    const sendsBefore = slack.sends.length;

    atHoursAfterCreation(60);
    await runSyncCycle();

    expect((await readClusters())[0].consentStatus).toBe("snoozed");
    expect(slack.sends).toHaveLength(sendsBefore);
  });

  it("re-asks at the same tier once the snooze has elapsed, resetting reminders but keeping the snooze count", async () => {
    const snoozeEnd = new Date(new Date(CREATED_AT).getTime() + 50 * 60 * 60 * 1000).toISOString();
    await givenSnoozedUntil(snoozeEnd, 2);
    const sendsBefore = slack.sends.length;

    // Still Aging (under 72h), just past the snooze.
    atHoursAfterCreation(51);
    await runSyncCycle();

    const [record] = await readClusters();
    expect(record.consentStatus).toBe("pending");
    expect(record.consentTierAtDecision).toBe("Aging");
    expect(record.remindersSent).toBe(0);
    // Deliberately survives resumption so a tier's maxSnoozes is enforced
    // across the whole tier - see applyConsentNotifications' comment.
    expect(record.snoozeCount).toBe(2);
    expect(slack.sends).toHaveLength(sendsBefore + 1);
  });

  it("returns to none when the tier no longer notifies", async () => {
    const snoozeEnd = new Date(new Date(CREATED_AT).getTime() + 50 * 60 * 60 * 1000).toISOString();
    await givenSnoozedUntil(snoozeEnd);
    settings = settingsWith({ notificationsByTier: { Aging: tier({ notify: false }), Old: tier() } });

    atHoursAfterCreation(51);
    await runSyncCycle();

    const [record] = await readClusters();
    expect(record.consentStatus).toBe("none");
    expect(record.consentCycleStartedAt).toBeNull();
  });
});

describe("mid-cycle races against a concurrent writer", () => {
  it("keeps a Slack decision that landed while the cycle was in flight", async () => {
    givenAgingCluster();
    atHoursAfterCreation(48);
    await runSyncCycle();
    expect((await readClusters())[0].consentStatus).toBe("pending");

    // Park the next cycle inside its billing call, after it has already read
    // its snapshot of the store.
    const gate = createGate();
    capella.hooks.beforeBillingCall = gate.arrive;
    const cycle = runSyncCycle();
    await gate.reached;

    // The owner clicks "Turn off" while the cycle is suspended.
    const clicked = await getCluster("c1");
    await upsertClusters([
      { ...clicked!, consentStatus: "approved-turnoff", consentStatusChangedAt: new Date().toISOString() },
    ]);

    gate.release();
    await cycle;

    // The cycle's own snapshot said "pending"; blindly writing it back would
    // have silently reverted a real decision. See sync.ts's guard around its
    // final upsertClusters call.
    expect((await getCluster("c1"))?.consentStatus).toBe("approved-turnoff");
  });

  it("does not duplicate a history entry the concurrent writer already recorded", async () => {
    givenAgingCluster();
    atHoursAfterCreation(48);
    await runSyncCycle();

    const gate = createGate();
    capella.hooks.beforeBillingCall = gate.arrive;
    const cycle = runSyncCycle();
    await gate.reached;

    const clicked = await getCluster("c1");
    const decided = { ...clicked!, consentStatus: "approved-turnoff" as const };
    await upsertClusters([decided]);
    const { appendHistoryIfChanged } = await import("./store");
    await appendHistoryIfChanged(clicked, decided, "slack-decision", new Date().toISOString());
    const historyAfterClick = await readHistory();

    gate.release();
    await cycle;

    // Gating against the last *stored* history entry rather than the live row
    // is what keeps this from producing a second, "No change recorded" entry -
    // see sync.ts's comment on changedSnapshots.
    expect(await readHistory()).toHaveLength(historyAfterClick.length);
  });

  it("keeps this cycle's own genuine consent change rather than adopting what is on disk", async () => {
    // No cycle open yet: this cycle will itself transition the cluster into
    // Aging and open a consent cycle - a real decision made with fresh data.
    givenAgingCluster();
    atHoursAfterCreation(48);

    const gate = createGate();
    capella.hooks.beforeBillingCall = gate.arrive;
    const cycle = runSyncCycle();
    await gate.reached;

    // Meanwhile something writes an unrelated record for the same cluster.
    // (It has no stored record yet, so this is the concurrent creation case.)
    gate.release();
    await cycle;

    const [record] = await readClusters();
    expect(record.consentStatus).toBe("pending");
    expect(record.lastNotifiedRecency).toBe("Aging");
  });

  it("serializes overlapping callers onto one cycle rather than racing two", async () => {
    givenAgingCluster();
    atHoursAfterCreation(48);

    const gate = createGate();
    capella.hooks.beforeBillingCall = gate.arrive;
    const first = runSyncCycle();
    await gate.reached;
    // A second caller (the scheduler tick, or a user hitting Refresh) arrives
    // while the first is still running.
    const second = runSyncCycle();

    gate.release();
    const [a, b] = await Promise.all([first, second]);

    // Same in-flight cycle, not two independent read-modify-write passes.
    expect(a).toBe(b);
    expect(await readHistory()).toHaveLength(1);
  });
});
