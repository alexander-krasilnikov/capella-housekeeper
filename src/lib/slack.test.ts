/**
 * Slack message construction, payload parsing, and the WebClient-facing
 * wrappers.
 *
 * The integration suites fake this module's three network-crossing functions,
 * so everything here - the Block Kit payload shape in particular - is covered
 * only by this file. That matters because a malformed payload doesn't fail
 * loudly in the orchestration layer: `sendConsentDM` catches it and returns
 * `{ok: false}`, which reads as "the owner couldn't be reached" rather than
 * "we built an invalid message".
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildConsentMessage,
  buildSnoozeModalView,
  canAutoTurnOff,
  CONSENT_ACTION_IDS,
  describeSnoozeAllowance,
  isAlreadyOff,
  parseSnoozeSubmission,
  slackErrorReason,
  SNOOZE_MODAL_CALLBACK_ID,
} from "./slack";
import { makeClusterRecord, makeSettings } from "../test/factories";
import type { Recency, Settings, TierNotificationConfig } from "../types";

const NOW = new Date("2026-03-01T00:00:00.000Z").getTime();

function tierConfig(overrides: Partial<TierNotificationConfig> = {}): TierNotificationConfig {
  return { notify: true, askTurnOff: true, askDelete: true, autoTurnOffOnInaction: false, maxSnoozes: 3, ...overrides };
}

function settings(overrides: Partial<Settings> = {}): Settings {
  return makeSettings({ activityGraceHours: 24, forgottenHours: 72, consentReminderMax: 2, consentExpiryDays: 7, ...overrides });
}

function message(options: {
  tier?: Recency;
  config?: Partial<TierNotificationConfig>;
  isReminder?: boolean;
  status?: string | null;
  clusterName?: string;
  snoozeCount?: number;
  settingsOverrides?: Partial<Settings>;
} = {}) {
  return buildConsentMessage({
    cluster: makeClusterRecord({
      clusterName: options.clusterName ?? "test-cluster",
      config: { ...makeClusterRecord().config, status: options.status ?? "healthy" },
      snoozeCount: options.snoozeCount ?? 0,
    }),
    tier: options.tier ?? "Aging",
    tierConfig: tierConfig(options.config),
    isReminder: options.isReminder ?? false,
    nowMs: NOW,
    settings: settings(options.settingsOverrides),
  });
}

/** Every button's action_id, in the order the message offers them. */
function buttonActionIds(blocks: unknown[]): string[] {
  const actions = blocks.find((b) => (b as { type?: string }).type === "actions") as {
    elements: { action_id: string }[];
  };
  return actions.elements.map((e) => e.action_id);
}

/** All mrkdwn/plain_text strings anywhere in the payload, flattened. */
function allText(payload: unknown): string {
  return JSON.stringify(payload);
}

describe("isAlreadyOff", () => {
  it.each([
    ["turnedOff", true],
    ["offline", true],
    ["healthy", false],
    ["deploying", false],
  ])("classifies %s as already-off: %s", (status, expected) => {
    expect(isAlreadyOff(status)).toBe(expected);
  });

  it("treats an in-progress turn-off as already-off - asking again would be noise", () => {
    expect(isAlreadyOff("turningOff")).toBe(true);
  });

  it("does NOT treat a failed turn-off as already-off", () => {
    // Regression: the previous `/off/i` regex over the humanized label matched
    // "Turning Off Failed", so a cluster whose turn-off had *failed* - still
    // running, still billing - was treated as already off. It was therefore
    // never asked again, and canAutoTurnOff stayed false for it, leaving it
    // running indefinitely.
    expect(isAlreadyOff("turningOffFailed")).toBe(false);
  });

  it("does not treat an unrelated transition as already-off", () => {
    expect(isAlreadyOff("destroying")).toBe(false);
    expect(isAlreadyOff("deploying")).toBe(false);
    expect(isAlreadyOff("turningOn")).toBe(false);
  });

  it("treats an unavailable status as not-off", () => {
    expect(isAlreadyOff(null)).toBe(false);
  });
});

describe("canAutoTurnOff", () => {
  const running = makeClusterRecord();
  const off = makeClusterRecord({ config: { ...running.config, status: "turnedOff" } });

  it("requires the tier's auto-turn-off to be enabled", () => {
    expect(canAutoTurnOff(running, tierConfig({ autoTurnOffOnInaction: false }))).toBe(false);
    expect(canAutoTurnOff(running, tierConfig({ autoTurnOffOnInaction: true }))).toBe(true);
  });

  it("requires the tier to also ask for a turn-off", () => {
    // The system won't do automatically what the tier isn't configured to ask.
    expect(canAutoTurnOff(running, tierConfig({ autoTurnOffOnInaction: true, askTurnOff: false }))).toBe(false);
  });

  it("is false for a cluster that is already off", () => {
    expect(canAutoTurnOff(off, tierConfig({ autoTurnOffOnInaction: true }))).toBe(false);
  });
});

describe("buildConsentMessage - offered actions", () => {
  it("offers turn off, delete and snooze when the tier asks for both", () => {
    const { blocks } = message({ config: { askTurnOff: true, askDelete: true } });

    expect(buttonActionIds(blocks)).toEqual([
      CONSENT_ACTION_IDS.turnoff,
      CONSENT_ACTION_IDS.delete,
      CONSENT_ACTION_IDS.snooze,
    ]);
  });

  it("omits delete when the tier does not ask for it", () => {
    const { blocks } = message({ config: { askTurnOff: true, askDelete: false } });

    expect(buttonActionIds(blocks)).toEqual([CONSENT_ACTION_IDS.turnoff, CONSENT_ACTION_IDS.snooze]);
  });

  it("omits turn off when the tier does not ask for it", () => {
    const { blocks } = message({ config: { askTurnOff: false, askDelete: true } });

    expect(buttonActionIds(blocks)).toEqual([CONSENT_ACTION_IDS.delete, CONSENT_ACTION_IDS.snooze]);
  });

  it("suppresses a redundant turn-off ask for a cluster already off", () => {
    const { blocks } = message({ status: "turnedOff", config: { askTurnOff: true, askDelete: true } });

    expect(buttonActionIds(blocks)).toEqual([CONSENT_ACTION_IDS.delete, CONSENT_ACTION_IDS.snooze]);
  });

  it("always offers snooze, even when the tier asks for nothing", () => {
    const { blocks } = message({ config: { askTurnOff: false, askDelete: false } });

    expect(buttonActionIds(blocks)).toEqual([CONSENT_ACTION_IDS.snooze]);
  });

  it("carries the cluster id as each button's value", () => {
    const { blocks } = message();
    const actions = blocks.find((b) => (b as { type?: string }).type === "actions") as {
      elements: { value: string }[];
    };

    expect(actions.elements.every((e) => e.value === "c1")).toBe(true);
  });

  it("block-scopes the actions row to the cluster", () => {
    const { blocks } = message();
    const actions = blocks.find((b) => (b as { type?: string }).type === "actions") as { block_id: string };

    expect(actions.block_id).toBe("consent_c1");
  });
});

describe("buildConsentMessage - confirm dialogs", () => {
  function confirmFor(actionId: string, clusterName = "test-cluster") {
    const { blocks } = message({ clusterName });
    const actions = blocks.find((b) => (b as { type?: string }).type === "actions") as {
      elements: { action_id: string; style?: string; confirm?: { text: { text: string } } }[];
    };
    return actions.elements.find((e) => e.action_id === actionId);
  }

  it("guards turn off and delete with a danger-styled confirm dialog", () => {
    for (const id of [CONSENT_ACTION_IDS.turnoff, CONSENT_ACTION_IDS.delete]) {
      expect(confirmFor(id)?.style).toBe("danger");
      expect(confirmFor(id)?.confirm).toBeDefined();
    }
  });

  it("leaves snooze unstyled and unconfirmed - it isn't destructive", () => {
    expect(confirmFor(CONSENT_ACTION_IDS.snooze)?.style).toBeUndefined();
    expect(confirmFor(CONSENT_ACTION_IDS.snooze)?.confirm).toBeUndefined();
  });

  it("states plainly that a delete cannot be undone", () => {
    expect(confirmFor(CONSENT_ACTION_IDS.delete)?.confirm?.text.text).toMatch(/[Cc]annot be undone/);
  });

  it("names the cluster in the confirm text", () => {
    expect(confirmFor(CONSENT_ACTION_IDS.turnoff, "prod-db")?.confirm?.text.text).toContain("prod-db");
  });

  it("keeps confirm text within Slack's 300-character limit, even for a long cluster name", () => {
    // Regression: a long-form explanation plus a cluster name routinely blew
    // past Slack's 300-char cap on a confirm object's `text`, which is what
    // actually produced an `invalid_blocks` error from chat.postMessage. See
    // ACTION_SUMMARY's comment in slack.ts.
    const longName = "a".repeat(200);

    for (const id of [CONSENT_ACTION_IDS.turnoff, CONSENT_ACTION_IDS.delete]) {
      const text = confirmFor(id, longName)?.confirm?.text.text ?? "";
      expect(text.length).toBeLessThanOrEqual(300);
    }
  });

  it("stays within the limit for a cluster name of any length, by trimming the name", () => {
    // The name is caller-supplied and unbounded; the explanation is not. So the
    // name is what gets trimmed, and the cap holds regardless.
    for (const nameLength of [0, 1, 100, 250, 300, 1600, 10_000]) {
      for (const id of [CONSENT_ACTION_IDS.turnoff, CONSENT_ACTION_IDS.delete]) {
        const text = confirmFor(id, "n".repeat(nameLength))?.confirm?.text.text ?? "";
        expect(text.length).toBeLessThanOrEqual(300);
      }
    }
  });

  it("marks a trimmed name as trimmed rather than silently shortening it", () => {
    const text = confirmFor(CONSENT_ACTION_IDS.delete, "n".repeat(1000))?.confirm?.text.text ?? "";

    expect(text).toMatch(/…$/);
  });

  it("leaves a normal-length name untouched", () => {
    const text = confirmFor(CONSENT_ACTION_IDS.delete, "prod-analytics-cluster")?.confirm?.text.text ?? "";

    expect(text).toContain("prod-analytics-cluster");
    expect(text).not.toMatch(/…/);
  });
});

describe("buildConsentMessage - body content", () => {
  it("distinguishes a reminder from an initial ask", () => {
    expect(allText(message({ isReminder: false }).blocks)).toContain("Housekeeping alert");
    expect(allText(message({ isReminder: true }).blocks)).toContain("Reminder");
  });

  it("uses a fallback text that identifies the request without restating the body", () => {
    const initial = message({ isReminder: false });
    const reminder = message({ isReminder: true });

    expect(initial.text).toContain("Housekeeping alert for cluster test-cluster");
    expect(initial.text).toContain("Tier: Aging");
    expect(reminder.text).toContain("Reminder");
  });

  it("states the operational state separately from the recency tier", () => {
    // A cluster can be Old and still running, so both axes are stated.
    const text = allText(message({ tier: "Old", status: "healthy" }).blocks);

    expect(text).toContain("Running state");
    expect(text).toContain("Recency");
  });

  it("parameterizes the tier explanation with the configured thresholds", () => {
    const text = allText(
      message({ tier: "Old", settingsOverrides: { activityGraceHours: 48, forgottenHours: 240 } }).blocks,
    );

    expect(text).toContain("240");
  });

  it("distinguishes no activity on record from genuine inactivity", () => {
    const noSignal = buildConsentMessage({
      cluster: makeClusterRecord({ lastActivityAt: null, lastActivitySource: "unknown" }),
      tier: "Aging",
      tierConfig: tierConfig(),
      isReminder: false,
      nowMs: NOW,
      settings: settings(),
    });

    expect(allText(noSignal.blocks)).toContain("none on record");
  });

  it("describes recent activity in hours and older activity in days", () => {
    const hoursAgo = buildConsentMessage({
      cluster: makeClusterRecord({
        lastActivityAt: new Date(NOW - 5 * 60 * 60 * 1000).toISOString(),
        lastActivitySource: "activity-log",
      }),
      tier: "Aging",
      tierConfig: tierConfig(),
      isReminder: false,
      nowMs: NOW,
      settings: settings(),
    });
    expect(allText(hoursAgo.blocks)).toContain("5h ago");

    const daysAgo = buildConsentMessage({
      cluster: makeClusterRecord({
        lastActivityAt: new Date(NOW - 5 * 24 * 60 * 60 * 1000).toISOString(),
        lastActivitySource: "activity-log",
      }),
      tier: "Aging",
      tierConfig: tierConfig(),
      isReminder: false,
      nowMs: NOW,
      settings: settings(),
    });
    expect(allText(daysAgo.blocks)).toContain("5 days ago");
  });

  it("explains each offered option in the body", () => {
    const text = allText(message({ config: { askTurnOff: true, askDelete: true } }).blocks);

    expect(text).toContain("What each option means");
    expect(text).toContain("keeps all data");
  });
});

describe("buildConsentMessage - the no-response consequence", () => {
  it("says no automatic action is taken when auto-turn-off is off", () => {
    const text = allText(message({ config: { autoTurnOffOnInaction: false } }).blocks);

    expect(text).toContain("no automatic action");
  });

  it("says the cluster will be turned off when auto-turn-off is eligible", () => {
    const text = allText(message({ config: { autoTurnOffOnInaction: true, askTurnOff: true } }).blocks);

    expect(text).toContain("turned off automatically");
  });

  it("states how many snoozes remain before that happens", () => {
    const text = allText(
      message({ config: { autoTurnOffOnInaction: true, maxSnoozes: 5 }, snoozeCount: 2 }).blocks,
    );

    expect(text).toContain("3 more time(s)");
  });

  it("never states a negative remaining count", () => {
    const text = allText(
      message({ config: { autoTurnOffOnInaction: true, maxSnoozes: 1 }, snoozeCount: 9 }).blocks,
    );

    expect(text).toContain("0 more time(s)");
  });

  it("reverts to no-automatic-action for an already-off cluster", () => {
    const text = allText(
      message({ status: "turnedOff", config: { autoTurnOffOnInaction: true, askTurnOff: true } }).blocks,
    );

    expect(text).toContain("no automatic action");
  });

  it("adds a resurfacing note for Old only", () => {
    expect(allText(message({ tier: "Old" }).blocks)).toContain("keep resurfacing");
    expect(allText(message({ tier: "Aging" }).blocks)).not.toContain("keep resurfacing");
  });

  it("states the configured reminder count and expiry window", () => {
    const text = allText(message({ settingsOverrides: { consentReminderMax: 4, consentExpiryDays: 21 } }).blocks);

    expect(text).toContain("Up to 4 reminder(s) over 21 day(s)");
  });
});

describe("describeSnoozeAllowance", () => {
  it("says nothing when auto-turn-off is not enabled", () => {
    expect(describeSnoozeAllowance(tierConfig({ autoTurnOffOnInaction: false }), 1)).toBeNull();
  });

  it("reports the remaining allowance after a snooze", () => {
    expect(describeSnoozeAllowance(tierConfig({ autoTurnOffOnInaction: true, maxSnoozes: 3 }), 1)).toBe(
      "2 snooze(s) remaining before automatic turn-off.",
    );
  });

  it("floors the remaining count at zero", () => {
    expect(describeSnoozeAllowance(tierConfig({ autoTurnOffOnInaction: true, maxSnoozes: 2 }), 5)).toBe(
      "0 snooze(s) remaining before automatic turn-off.",
    );
  });
});

describe("buildSnoozeModalView", () => {
  const metadata = { clusterId: "c1", channelId: "D1", messageTs: "1.1" };

  it("is a modal carrying the callback id the receiver registers", () => {
    const view = buildSnoozeModalView("test-cluster", metadata, [1, 3, 7]);

    expect(view.type).toBe("modal");
    expect(view.callback_id).toBe(SNOOZE_MODAL_CALLBACK_ID);
  });

  it("round-trips its metadata through private_metadata", () => {
    const view = buildSnoozeModalView("test-cluster", metadata, [1]);

    expect(JSON.parse(view.private_metadata)).toEqual(metadata);
  });

  it("offers exactly the configured day options", () => {
    const view = buildSnoozeModalView("test-cluster", metadata, [1, 3, 7]);
    const select = view.blocks.find((b) => (b as { block_id?: string }).block_id === "snooze_days") as {
      element: { options: { value: string; text: { text: string } }[] };
    };

    expect(select.element.options.map((o) => o.value)).toEqual(["1", "3", "7"]);
  });

  it("pluralizes the day labels correctly", () => {
    const view = buildSnoozeModalView("test-cluster", metadata, [1, 2]);
    const select = view.blocks.find((b) => (b as { block_id?: string }).block_id === "snooze_days") as {
      element: { options: { text: { text: string } }[] };
    };

    expect(select.element.options.map((o) => o.text.text)).toEqual(["1 day", "2 days"]);
  });

  it("requires a justification, and says it will be shown in the dashboard", () => {
    const view = buildSnoozeModalView("test-cluster", metadata, [1]);
    const input = view.blocks.find((b) => (b as { block_id?: string }).block_id === "justification") as {
      label: { text: string };
    };

    expect(input.label.text).toContain("required");
  });

  it("names the cluster in the modal body", () => {
    expect(allText(buildSnoozeModalView("prod-db", metadata, [1]).blocks)).toContain("prod-db");
  });
});

describe("parseSnoozeSubmission", () => {
  function view(overrides: {
    metadata?: string;
    days?: string | undefined;
    justification?: string | undefined;
  } = {}) {
    return {
      private_metadata:
        overrides.metadata ?? JSON.stringify({ clusterId: "c1", channelId: "D1", messageTs: "1.1" }),
      state: {
        values: {
          snooze_days: { days: { selected_option: overrides.days === undefined ? undefined : { value: overrides.days } } },
          justification: { text: { value: overrides.justification } },
        },
      },
    };
  }

  it("parses a valid submission", () => {
    const parsed = parseSnoozeSubmission(view({ days: "3", justification: "needed for a POC" }));

    expect(parsed).toEqual({
      days: 3,
      justification: "needed for a POC",
      metadata: { clusterId: "c1", channelId: "D1", messageTs: "1.1" },
    });
  });

  it("trims the justification", () => {
    expect(parseSnoozeSubmission(view({ days: "1", justification: "  spaced  " }))?.justification).toBe("spaced");
  });

  it("rejects unparseable metadata", () => {
    expect(parseSnoozeSubmission(view({ metadata: "not json", days: "1", justification: "ok" }))).toBeNull();
  });

  it("rejects a missing day selection", () => {
    expect(parseSnoozeSubmission(view({ days: undefined, justification: "ok" }))).toBeNull();
  });

  it.each([["0"], ["-1"], ["not-a-number"]])("rejects a day value of %s", (days) => {
    expect(parseSnoozeSubmission(view({ days, justification: "ok" }))).toBeNull();
  });

  it("rejects a missing justification", () => {
    expect(parseSnoozeSubmission(view({ days: "1", justification: undefined }))).toBeNull();
  });

  it("rejects a whitespace-only justification", () => {
    // Slack's own validation should block this, but it gets persisted and
    // displayed, so it isn't trusted alone.
    expect(parseSnoozeSubmission(view({ days: "1", justification: "   \t  " }))).toBeNull();
  });
});

describe("slackErrorReason", () => {
  it("extracts Slack's own error code", () => {
    expect(slackErrorReason({ data: { error: "missing_scope" } })).toBe("missing_scope");
  });

  it("prefers the Slack code over an Error message", () => {
    const err = Object.assign(new Error("An API error occurred"), { data: { error: "users_not_found" } });

    expect(slackErrorReason(err)).toBe("users_not_found");
  });

  it("falls back to an Error's message", () => {
    expect(slackErrorReason(new Error("socket hang up"))).toBe("socket hang up");
  });

  it("stringifies a non-Error value", () => {
    expect(slackErrorReason("plain string")).toBe("plain string");
    expect(slackErrorReason(42)).toBe("42");
  });

  it("tolerates null and an object without a data.error", () => {
    expect(slackErrorReason(null)).toBe("null");
    expect(slackErrorReason({ data: {} })).toBe("[object Object]");
  });
});

// ---------------------------------------------------------------------------
// The WebClient-facing wrappers
// ---------------------------------------------------------------------------

const { lookupByEmail, conversationsOpen, postMessage, chatUpdate, authTest, appsConnectionsOpen } = vi.hoisted(() => ({
  lookupByEmail: vi.fn(),
  conversationsOpen: vi.fn(),
  postMessage: vi.fn(),
  chatUpdate: vi.fn(),
  authTest: vi.fn(),
  appsConnectionsOpen: vi.fn(),
}));

vi.mock("@slack/web-api", () => ({
  WebClient: class {
    users = { lookupByEmail };
    conversations = { open: conversationsOpen };
    chat = { postMessage, update: chatUpdate };
    auth = { test: authTest };
    apps = { connections: { open: appsConnectionsOpen } };
  },
}));

const { sendConsentDM, updateMessage, testSlackConnection } = await import("./slack");

/** An error shaped the way @slack/web-api throws them. */
function slackError(code: string): Error {
  return Object.assign(new Error("An API error occurred"), { data: { error: code } });
}

beforeEach(() => {
  vi.clearAllMocks();
  lookupByEmail.mockResolvedValue({ user: { id: "U1" } });
  conversationsOpen.mockResolvedValue({ channel: { id: "D1" } });
  postMessage.mockResolvedValue({ ts: "1767225600.000100" });
  chatUpdate.mockResolvedValue({});
});

describe("sendConsentDM", () => {
  const payload = { text: "fallback", blocks: [] };

  it("resolves the owner by email, opens a DM, and posts", async () => {
    const outcome = await sendConsentDM("xoxb-1", "owner@example.com", payload);

    expect(outcome).toEqual({ ok: true, channelId: "D1", messageTs: "1767225600.000100" });
    expect(lookupByEmail).toHaveBeenCalledWith({ email: "owner@example.com" });
    expect(conversationsOpen).toHaveBeenCalledWith({ users: "U1" });
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ channel: "D1", text: "fallback" }));
  });

  it("never throws - a lookup failure comes back as a stage-prefixed reason", async () => {
    lookupByEmail.mockRejectedValue(slackError("users_not_found"));

    expect(await sendConsentDM("xoxb-1", "nobody@example.com", payload)).toEqual({
      ok: false,
      reason: "users.lookupByEmail: users_not_found",
    });
  });

  it("reports a missing scope with the real Slack code, not a generic message", async () => {
    lookupByEmail.mockRejectedValue(slackError("missing_scope"));

    expect(await sendConsentDM("xoxb-1", "owner@example.com", payload)).toMatchObject({
      ok: false,
      reason: expect.stringContaining("missing_scope"),
    });
  });

  it("treats a lookup that matches nobody as a failure", async () => {
    lookupByEmail.mockResolvedValue({ user: undefined });

    expect(await sendConsentDM("xoxb-1", "owner@example.com", payload)).toEqual({
      ok: false,
      reason: "users.lookupByEmail: no matching Slack user",
    });
    expect(conversationsOpen).not.toHaveBeenCalled();
  });

  it("reports a failure to open the conversation", async () => {
    conversationsOpen.mockRejectedValue(slackError("cannot_dm_bot"));

    expect(await sendConsentDM("xoxb-1", "owner@example.com", payload)).toEqual({
      ok: false,
      reason: "conversations.open: cannot_dm_bot",
    });
    expect(postMessage).not.toHaveBeenCalled();
  });

  it("treats a conversation with no channel id as a failure", async () => {
    conversationsOpen.mockResolvedValue({ channel: undefined });

    expect(await sendConsentDM("xoxb-1", "owner@example.com", payload)).toMatchObject({
      reason: "conversations.open: no channel returned",
    });
  });

  it("reports a failure to post", async () => {
    postMessage.mockRejectedValue(slackError("invalid_blocks"));

    expect(await sendConsentDM("xoxb-1", "owner@example.com", payload)).toEqual({
      ok: false,
      reason: "chat.postMessage: invalid_blocks",
    });
  });

  it("treats a post with no timestamp as a failure", async () => {
    postMessage.mockResolvedValue({ ts: undefined });

    expect(await sendConsentDM("xoxb-1", "owner@example.com", payload)).toMatchObject({
      reason: "chat.postMessage: no timestamp returned",
    });
  });
});

describe("updateMessage", () => {
  it("edits the message in place, replacing its blocks so stale buttons disappear", async () => {
    await updateMessage("xoxb-1", "D1", "1.1", "Approved - will be turned off.");

    expect(chatUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ channel: "D1", ts: "1.1", text: "Approved - will be turned off." }),
    );
    const { blocks } = chatUpdate.mock.calls[0][0] as { blocks: { text: { text: string } }[] };
    expect(blocks).toHaveLength(1);
    expect(blocks[0].text.text).toBe("Approved - will be turned off.");
  });
});

describe("testSlackConnection", () => {
  beforeEach(() => {
    authTest.mockResolvedValue({ user: "housekeeper", team: "Acme" });
    // Made-up probe targets: every scope check is expected to fail on the
    // target, which is how a present scope is distinguished from a missing one.
    conversationsOpen.mockRejectedValue(slackError("user_not_found"));
    postMessage.mockRejectedValue(slackError("channel_not_found"));
    lookupByEmail.mockRejectedValue(slackError("users_not_found"));
    appsConnectionsOpen.mockResolvedValue({});
  });

  it("reports every check passing when the tokens and scopes are good", async () => {
    const result = await testSlackConnection("xoxb-1", "xapp-1");

    expect(result.ok).toBe(true);
    expect(result.checks.map((c) => c.label)).toEqual([
      "Bot token",
      "im:write",
      "chat:write",
      "users:read.email",
      "App-level token (connections:write)",
    ]);
  });

  it("identifies the authenticated bot and workspace", async () => {
    const result = await testSlackConnection("xoxb-1", "xapp-1");

    expect(result.checks[0].detail).toContain("housekeeper");
    expect(result.checks[0].detail).toContain("Acme");
  });

  it("reads a target-not-found failure as the scope being present", async () => {
    const result = await testSlackConnection("xoxb-1", "xapp-1");

    // The probe never touches a real person or channel - see SCOPE_PROBE_*.
    expect(result.checks.find((c) => c.label === "im:write")).toMatchObject({ ok: true });
    expect(result.checks.find((c) => c.label === "chat:write")?.detail).toContain("as expected");
  });

  it.each([
    ["im:write", () => conversationsOpen.mockRejectedValue(slackError("missing_scope"))],
    ["chat:write", () => postMessage.mockRejectedValue(slackError("missing_scope"))],
    ["users:read.email", () => lookupByEmail.mockRejectedValue(slackError("missing_scope"))],
  ])("reports a missing_scope on %s as a failure", async (label, arrange) => {
    arrange();

    const result = await testSlackConnection("xoxb-1", "xapp-1");

    expect(result.ok).toBe(false);
    expect(result.checks.find((c) => c.label === label)).toMatchObject({ ok: false, detail: "missing_scope" });
  });

  it("treats anything other than users_not_found on the email lookup as a failure", async () => {
    // Unlike the other probes, this one has a definite expected answer.
    lookupByEmail.mockRejectedValue(slackError("invalid_auth"));

    const result = await testSlackConnection("xoxb-1", "xapp-1");

    expect(result.checks.find((c) => c.label === "users:read.email")).toMatchObject({ ok: false });
  });

  it("reports an invalid bot token without aborting the other checks", async () => {
    authTest.mockRejectedValue(slackError("invalid_auth"));

    const result = await testSlackConnection("xoxb-1", "xapp-1");

    expect(result.ok).toBe(false);
    expect(result.checks[0]).toMatchObject({ label: "Bot token", ok: false, detail: "invalid_auth" });
    expect(result.checks).toHaveLength(5);
  });

  it("reports an invalid app-level token", async () => {
    appsConnectionsOpen.mockRejectedValue(slackError("invalid_auth"));

    const result = await testSlackConnection("xoxb-1", "xapp-1");

    expect(result.ok).toBe(false);
    expect(result.checks.at(-1)).toMatchObject({ ok: false, detail: "invalid_auth" });
  });
});
