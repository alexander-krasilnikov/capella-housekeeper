/**
 * `notifications.ts`'s small exported helpers.
 *
 * The module's main entry point, `applyConsentNotifications`, is covered
 * end-to-end in consent.integration.test.ts. These are the pieces reached from
 * elsewhere (slackBot.ts, manualActions.ts) whose behaviour at the edges isn't
 * visible through that path.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeClusterRecord, makeSettings } from "../test/factories";
import type { Settings, TierNotificationConfig } from "../types";

const { updateMessage } = vi.hoisted(() => ({ updateMessage: vi.fn(async () => undefined) }));
vi.mock("./slack", async () => {
  const actual = await vi.importActual<typeof import("./slack")>("./slack");
  return { ...actual, updateMessage, sendConsentDM: vi.fn() };
});

vi.mock("./store", () => ({
  readClusters: vi.fn(async () => []),
  upsertClusters: vi.fn(async () => undefined),
  appendHistoryIfChanged: vi.fn(async () => undefined),
}));

let settings: Settings;
vi.mock("./settings", () => ({ readSettings: async () => settings }));

const { computeRecordAgeStatus, isEmailLike, resolveTierConfig, supersedeLiveMessage, applyAutoTurnOffDecision } =
  await import("./notifications");

function tier(overrides: Partial<TierNotificationConfig> = {}): TierNotificationConfig {
  return { notify: true, askTurnOff: true, askDelete: false, autoTurnOffOnInaction: false, maxSnoozes: 3, ...overrides };
}

beforeEach(() => {
  vi.clearAllMocks();
  settings = makeSettings({
    activityGraceHours: 24,
    forgottenHours: 72,
    slackBotToken: "xoxb-test",
    notificationsByTier: { Stale: tier(), Forgotten: tier({ askDelete: true }) },
  });
});

describe("isEmailLike", () => {
  it.each([
    ["owner@example.com", true],
    ["first.last+tag@sub.example.co.uk", true],
    ["not-an-email", false],
    ["missing@domain", false],
    ["@example.com", false],
    ["spaced out@example.com", false],
    ["two@@example.com", false],
    ["", false],
  ])("classifies %s as email-like: %s", (value, expected) => {
    expect(isEmailLike(value)).toBe(expected);
  });

  it("rejects null - an unresolved owner is not notifiable", () => {
    // Owner derivation falls back to a raw Capella user UUID when the users
    // lookup fails, which must not be DM'd as though it were an address.
    expect(isEmailLike(null)).toBe(false);
    expect(isEmailLike("8f14e45f-ceea-467a-9a3e-1f2c3d4e5f60")).toBe(false);
  });
});

describe("resolveTierConfig", () => {
  it("returns the configured entry for a notifiable tier", () => {
    expect(resolveTierConfig("Stale", settings)).toBe(settings.notificationsByTier.Stale);
    expect(resolveTierConfig("Forgotten", settings)).toBe(settings.notificationsByTier.Forgotten);
  });

  it("supplies a manual-control default for In Use, which has no configuration", () => {
    const config = resolveTierConfig("In Use", settings);

    // An operator manually asking about an In Use cluster gets both options
    // rather than silently nothing - see IN_USE_MANUAL_TIER_CONFIG.
    expect(config.askTurnOff).toBe(true);
    expect(config.askDelete).toBe(true);
  });

  it("never allows automatic turn-off for In Use, whatever else is configured", () => {
    settings = makeSettings({
      notificationsByTier: {
        Stale: tier({ autoTurnOffOnInaction: true }),
        Forgotten: tier({ autoTurnOffOnInaction: true }),
      },
    });

    // "In Use" is never eligible regardless of any other setting.
    expect(resolveTierConfig("In Use", settings).autoTurnOffOnInaction).toBe(false);
    expect(resolveTierConfig("In Use", settings).maxSnoozes).toBe(0);
  });

  it("leaves notify irrelevant for In Use - a manual send bypasses it", () => {
    expect(resolveTierConfig("In Use", settings).notify).toBe(false);
  });
});

describe("computeRecordAgeStatus", () => {
  const created = "2026-01-01T00:00:00.000Z";
  const at = (hours: number) => new Date(created).getTime() + hours * 60 * 60 * 1000;

  it("derives the tier from a stored record's own timestamps", () => {
    const record = makeClusterRecord({ createdAt: created, lastActivityAt: null, lastActivitySource: "unknown" });

    expect(computeRecordAgeStatus(record, settings, at(1))).toBe("Stale");
    expect(computeRecordAgeStatus(record, settings, at(100))).toBe("Forgotten");
  });

  it("honours recent activity", () => {
    const record = makeClusterRecord({
      createdAt: created,
      lastActivityAt: new Date(at(99)).toISOString(),
      lastActivitySource: "activity-log",
    });

    expect(computeRecordAgeStatus(record, settings, at(100))).toBe("In Use");
  });

  it("ignores an activity timestamp with an unknown source", () => {
    const record = makeClusterRecord({
      createdAt: created,
      lastActivityAt: new Date(at(99)).toISOString(),
      lastActivitySource: "unknown",
    });

    expect(computeRecordAgeStatus(record, settings, at(100))).toBe("Forgotten");
  });
});

describe("supersedeLiveMessage", () => {
  it("edits the live message when there is one and Slack is configured", async () => {
    const record = makeClusterRecord({ slackChannelId: "D1", slackMessageTs: "1.1" });

    await supersedeLiveMessage(record, settings, "superseded");

    expect(updateMessage).toHaveBeenCalledWith("xoxb-test", "D1", "1.1", "superseded");
  });

  it.each([
    ["no channel", { slackChannelId: null, slackMessageTs: "1.1" }],
    ["no timestamp", { slackChannelId: "D1", slackMessageTs: null }],
    ["neither", { slackChannelId: null, slackMessageTs: null }],
  ])("does nothing when there is %s", async (_label, overrides) => {
    await supersedeLiveMessage(makeClusterRecord(overrides), settings, "superseded");

    expect(updateMessage).not.toHaveBeenCalled();
  });

  it("does nothing when no bot token is configured", async () => {
    settings = makeSettings({ slackBotToken: "" });

    await supersedeLiveMessage(
      makeClusterRecord({ slackChannelId: "D1", slackMessageTs: "1.1" }),
      settings,
      "superseded",
    );

    expect(updateMessage).not.toHaveBeenCalled();
  });

  it("swallows a Slack failure rather than aborting the caller", async () => {
    updateMessage.mockRejectedValueOnce(new Error("channel_not_found"));

    // A superseding edit is best-effort: the consent decision it accompanies
    // must still be recorded.
    await expect(
      supersedeLiveMessage(makeClusterRecord({ slackChannelId: "D1", slackMessageTs: "1.1" }), settings, "x"),
    ).resolves.toBeUndefined();
  });
});

describe("applyAutoTurnOffDecision", () => {
  const nowMs = new Date("2026-03-01T00:00:00.000Z").getTime();

  it("records the same fields a Slack turn-off click would", async () => {
    const record = makeClusterRecord({ slackChannelId: "D1", slackMessageTs: "1.1", consentStatus: "pending" });

    await applyAutoTurnOffDecision(record, "Forgotten", settings, "no response was received", nowMs);

    expect(record.consentStatus).toBe("approved-turnoff");
    expect(record.consentTierAtDecision).toBe("Forgotten");
    expect(record.consentStatusChangedAt).toBe(new Date(nowMs).toISOString());
    expect(record.workflowNote).toBe("no response was received");
  });

  it("explains itself on the live message, naming the cluster and the reason", async () => {
    const record = makeClusterRecord({
      clusterName: "prod-db",
      slackChannelId: "D1",
      slackMessageTs: "1.1",
    });

    await applyAutoTurnOffDecision(record, "Forgotten", settings, "the maximum of 3 snooze(s) was reached", nowMs);

    const [, , , text] = updateMessage.mock.calls[0] as unknown as [string, string, string, string];
    expect(text).toContain("prod-db");
    expect(text).toContain("Turned off automatically");
    expect(text).toContain("the maximum of 3 snooze(s) was reached");
  });

  it("mutates only the in-memory record, leaving persistence to the caller", async () => {
    const { upsertClusters } = await import("./store");
    const record = makeClusterRecord({ slackChannelId: "D1", slackMessageTs: "1.1" });

    await applyAutoTurnOffDecision(record, "Stale", settings, "reason", nowMs);

    // Callers batch (the expiry branch) or write immediately (the snooze-cap
    // handler); this function does neither.
    expect(upsertClusters).not.toHaveBeenCalled();
  });

  it("still records the decision when there is no live message to edit", async () => {
    const record = makeClusterRecord({ slackChannelId: null, slackMessageTs: null });

    await applyAutoTurnOffDecision(record, "Stale", settings, "reason", nowMs);

    expect(updateMessage).not.toHaveBeenCalled();
    expect(record.consentStatus).toBe("approved-turnoff");
  });
});
