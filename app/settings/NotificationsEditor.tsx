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
  "w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100";

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
    <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-600 dark:text-slate-300">
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
          className="shrink-0 rounded-lg border border-slate-300 px-2 text-xs text-slate-500 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
        >
          {revealed ? "Hide" : "Show"}
        </button>
      </div>
      <span className="text-xs font-normal text-slate-400 dark:text-slate-500">{hint}</span>
    </label>
  );
}

export default function NotificationsEditor({
  slackBotToken,
  slackAppToken,
  notificationsByTier,
  consentReminderMax,
  consentExpiryDays,
}: {
  slackBotToken: string;
  slackAppToken: string;
  notificationsByTier: NotificationsByTier;
  consentReminderMax: number;
  consentExpiryDays: number;
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
      className="flex flex-col gap-5 rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900"
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
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          {testing ? "Testing…" : "Test connection"}
        </button>
        <span className="text-xs font-normal text-slate-400 dark:text-slate-500">
          Tests the tokens currently in the two fields above, even if unsaved - checks the token itself, chat:write +
          im:write (by sending a real message to the bot's own DM), users:read.email, and the app-level token's
          connections:write.
        </span>
        {testResult && (
          <ul className="flex w-full flex-col gap-1 rounded-lg border border-slate-200 p-3 text-xs dark:border-slate-700">
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
        <p className="mb-2 text-sm font-medium text-slate-600 dark:text-slate-300">Per-tier notifications</p>
        <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
                <th className="px-3 py-2">Tier</th>
                <th className="px-3 py-2">Notify</th>
                <th className="px-3 py-2">Ask turn-off</th>
                <th className="px-3 py-2">Ask delete</th>
              </tr>
            </thead>
            <tbody>
              {TIERS.map((tier) => (
                <tr key={tier} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="px-3 py-2 align-top">
                    <div className="font-medium text-slate-700 dark:text-slate-200">{tier}</div>
                    <div className="mt-0.5 max-w-xs text-xs font-normal text-slate-400 dark:text-slate-500">
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

      <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-600 dark:text-slate-300">
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
        <span className="text-xs font-normal text-slate-400 dark:text-slate-500">
          How many reminder re-sends a pending request gets before it expires.
        </span>
      </label>

      <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-600 dark:text-slate-300">
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
        <span className="text-xs font-normal text-slate-400 dark:text-slate-500">
          How long a pending request may go unanswered before it expires.
        </span>
      </label>

      <button
        type="submit"
        className="mt-2 w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500 active:bg-blue-700"
      >
        Save
      </button>
    </form>
  );
}
