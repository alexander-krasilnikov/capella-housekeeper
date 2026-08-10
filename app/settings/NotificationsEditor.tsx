"use client";

import { useRef, useState, useTransition } from "react";
import { saveNotificationsAction, testSlackConnectionAction } from "../actions";
import type { SlackConnectionTestResult } from "@/lib/slack";
import type { NotifiableAgeStatus, NotificationsByTier } from "@/types";

/** "In Use" is deliberately excluded - there's nothing to ask about a cluster with evidence of active use. */
const TIERS: NotifiableAgeStatus[] = ["Stale", "Forgotten"];

const TIER_DESCRIPTIONS: Record<NotifiableAgeStatus, string> = {
  Stale: "No recent activity, past the activity grace period. A reasonable point to start asking.",
  Forgotten: "Long idle, past the Forgotten threshold. The strongest cleanup candidate.",
};

const inputClass =
  "w-full rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/30";

function MaskedTokenField({
  name,
  label,
  hint,
  defaultValue,
}: {
  name: string;
  label: string;
  hint: string;
  defaultValue: string;
}) {
  const [revealed, setRevealed] = useState(defaultValue === "");

  return (
    <label className="flex flex-col gap-1.5 text-sm font-medium text-ink-muted">
      {label}
      <div className="flex gap-1.5">
        <input
          name={name}
          type={revealed ? "text" : "password"}
          defaultValue={defaultValue}
          className={inputClass}
          placeholder={label}
        />
        <button
          type="button"
          onClick={() => setRevealed((r) => !r)}
          className="shrink-0 rounded-lg border border-line px-2 text-xs text-ink-muted hover:bg-panel-hover"
        >
          {revealed ? "Hide" : "Show"}
        </button>
      </div>
      <span className="text-xs font-normal text-ink-faint">{hint}</span>
    </label>
  );
}

export default function NotificationsEditor({
  slackBotToken,
  slackAppToken,
  notificationsByTier,
  consentReminderMax,
  consentExpiryDays,
  snoozeDayOptions,
}: {
  slackBotToken: string;
  slackAppToken: string;
  notificationsByTier: NotificationsByTier;
  consentReminderMax: number;
  consentExpiryDays: number;
  snoozeDayOptions: number[];
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [testing, startTest] = useTransition();
  const [testResult, setTestResult] = useState<SlackConnectionTestResult | null>(null);

  function runTest() {
    const form = formRef.current;
    if (!form) return;
    const data = new FormData(form);
    const botToken = String(data.get("slackBotToken") ?? "");
    const appToken = String(data.get("slackAppToken") ?? "");
    setTestResult(null);
    startTest(async () => {
      setTestResult(await testSlackConnectionAction(botToken, appToken));
    });
  }

  return (
    <form
      ref={formRef}
      action={saveNotificationsAction}
      className="flex flex-col gap-5 rounded-2xl border border-line bg-panel p-6"
    >
      <MaskedTokenField
        name="slackBotToken"
        label="Slack bot token"
        hint="Needs chat:write, users:read.email (to look up owners), and im:write (to open the DM). Used to send DMs."
        defaultValue={slackBotToken}
      />
      <MaskedTokenField
        name="slackAppToken"
        label="Slack app-level token"
        hint="Needs connections:write. Used for Socket Mode, to receive button clicks - no inbound endpoint required."
        defaultValue={slackAppToken}
      />

      <div className="flex flex-col items-start gap-2">
        <button
          type="button"
          disabled={testing}
          onClick={runTest}
          className="rounded-lg border border-line px-3 py-1.5 text-sm text-ink-muted transition hover:bg-panel-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {testing ? "Testing…" : "Test connection"}
        </button>
        <span className="text-xs font-normal text-ink-faint">
          Tests the tokens currently in the two fields above, even if unsaved - checks the token itself, chat:write +
          im:write (by sending a real message to the bot's own DM), users:read.email, and the app-level token's
          connections:write.
        </span>
        {testResult && (
          <ul className="flex w-full flex-col gap-1 rounded-lg border border-line p-3 text-xs">
            {testResult.checks.map((check) => (
              <li
                key={check.label}
                className={`flex items-start gap-1.5 ${
                  check.ok ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                }`}
              >
                <span>{check.ok ? "✓" : "✗"}</span>
                <span>
                  <span className="font-medium">{check.label}:</span> {check.detail}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <p className="mb-2 text-sm font-medium text-ink-muted">Per-tier notifications</p>
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-panel-hover text-left text-xs uppercase tracking-wide text-ink-muted">
                <th className="px-3 py-2">Tier</th>
                <th className="px-3 py-2">Notify</th>
                <th className="px-3 py-2">Ask turn-off</th>
                <th className="px-3 py-2">Ask delete</th>
              </tr>
            </thead>
            <tbody>
              {TIERS.map((tier) => (
                <tr key={tier} className="border-t border-line">
                  <td className="px-3 py-2 align-top">
                    <div className="font-medium text-ink">{tier}</div>
                    <div className="mt-0.5 max-w-xs text-xs font-normal text-ink-faint">
                      {TIER_DESCRIPTIONS[tier]}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      name={`notify_${tier}`}
                      defaultChecked={notificationsByTier[tier].notify}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      name={`askTurnOff_${tier}`}
                      defaultChecked={notificationsByTier[tier].askTurnOff}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      name={`askDelete_${tier}`}
                      defaultChecked={notificationsByTier[tier].askDelete}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <label className="flex flex-col gap-1.5 text-sm font-medium text-ink-muted">
        Max reminders
        <input
          name="consentReminderMax"
          type="number"
          min={1}
          step={1}
          required
          defaultValue={consentReminderMax}
          className={inputClass}
        />
        <span className="text-xs font-normal text-ink-faint">
          How many reminder re-sends a pending request gets before it expires.
        </span>
      </label>

      <label className="flex flex-col gap-1.5 text-sm font-medium text-ink-muted">
        Expiry (days)
        <input
          name="consentExpiryDays"
          type="number"
          min={1}
          step={1}
          required
          defaultValue={consentExpiryDays}
          className={inputClass}
        />
        <span className="text-xs font-normal text-ink-faint">
          How long a pending request may go unanswered before it expires.
        </span>
      </label>

      <label className="flex flex-col gap-1.5 text-sm font-medium text-ink-muted">
        Snooze period options (days)
        <input
          name="snoozeDayOptionsCsv"
          type="text"
          required
          defaultValue={snoozeDayOptions.join(", ")}
          placeholder="1, 2, 3"
          className={inputClass}
        />
        <span className="text-xs font-normal text-ink-faint">
          Comma-separated list of durations (in days) an owner can choose from when snoozing a request in Slack.
        </span>
      </label>

      <button
        type="submit"
        className="mt-2 w-full rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-brand-ink transition hover:bg-brand-hover active:bg-brand-active"
      >
        Save
      </button>
    </form>
  );
}
