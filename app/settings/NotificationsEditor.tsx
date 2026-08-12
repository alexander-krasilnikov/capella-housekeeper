"use client";

import { useState } from "react";
import { saveNotificationsAction } from "../actions";
import type { NotifiableAgeStatus, NotificationsByTier, TierNotificationConfig } from "@/types";

/** "In Use" is deliberately excluded - there's nothing to ask about a cluster with evidence of active use. */
const TIERS: NotifiableAgeStatus[] = ["Stale", "Forgotten"];

const TIER_DESCRIPTIONS: Record<NotifiableAgeStatus, string> = {
  Stale: "No recent activity, past the activity grace period. A reasonable point to start asking.",
  Forgotten: "Long idle, past the Forgotten threshold. The strongest cleanup candidate.",
};

const inputClass =
  "w-full rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/30";

function TierRow({ tier, config }: { tier: NotifiableAgeStatus; config: TierNotificationConfig }) {
  const [autoTurnOffOnInaction, setAutoTurnOffOnInaction] = useState(config.autoTurnOffOnInaction);

  return (
    <tr className="border-t border-line">
      <td className="px-3 py-2 align-top">
        <div className="font-medium text-ink">{tier}</div>
        <div className="mt-0.5 max-w-xs text-xs font-normal text-ink-faint">{TIER_DESCRIPTIONS[tier]}</div>
      </td>
      <td className="px-3 py-2">
        <input type="checkbox" name={`notify_${tier}`} defaultChecked={config.notify} />
      </td>
      <td className="px-3 py-2">
        <input type="checkbox" name={`askTurnOff_${tier}`} defaultChecked={config.askTurnOff} />
      </td>
      <td className="px-3 py-2">
        <input type="checkbox" name={`askDelete_${tier}`} defaultChecked={config.askDelete} />
      </td>
      <td className="px-3 py-2">
        <input
          type="checkbox"
          name={`autoTurnOffOnInaction_${tier}`}
          checked={autoTurnOffOnInaction}
          onChange={(e) => setAutoTurnOffOnInaction(e.target.checked)}
        />
      </td>
      <td className="px-3 py-2">
        <input
          type="number"
          name={`maxSnoozes_${tier}`}
          min={0}
          step={1}
          defaultValue={config.maxSnoozes}
          disabled={!autoTurnOffOnInaction}
          className="w-20 rounded-lg border border-line bg-canvas px-2 py-1 text-sm text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/30 disabled:opacity-40"
        />
      </td>
    </tr>
  );
}

export default function NotificationsEditor({
  notificationsByTier,
  consentReminderMax,
  consentExpiryDays,
  snoozeDayOptions,
}: {
  notificationsByTier: NotificationsByTier;
  consentReminderMax: number;
  consentExpiryDays: number;
  snoozeDayOptions: number[];
}) {
  return (
    <form action={saveNotificationsAction} className="flex flex-col gap-5 rounded-2xl border border-line bg-panel p-6">
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
                <th className="px-3 py-2">Auto turn off on inaction</th>
                <th className="px-3 py-2">Max snoozes</th>
              </tr>
            </thead>
            <tbody>
              {TIERS.map((tier) => (
                <TierRow key={tier} tier={tier} config={notificationsByTier[tier]} />
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
