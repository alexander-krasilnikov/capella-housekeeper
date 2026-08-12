"use client";

import { useEffect, useState, useTransition } from "react";
import { getSlackBotStatusAction, reconnectSlackBotAction } from "../actions";
import type { SlackBotStatus } from "@/lib/slackBot";

const POLL_INTERVAL_MS = 15_000;

const DOT_CLASS: Record<SlackBotStatus["status"], string> = {
  connected: "bg-emerald-500",
  connecting: "bg-amber-500 animate-pulse",
  reconnecting: "bg-amber-500 animate-pulse",
  disconnected: "bg-rose-500",
  error: "bg-rose-500",
  disabled: "bg-slate-400",
};

const TEXT_CLASS: Record<SlackBotStatus["status"], string> = {
  connected: "text-emerald-600 dark:text-emerald-400",
  connecting: "text-amber-600 dark:text-amber-400",
  reconnecting: "text-amber-600 dark:text-amber-400",
  disconnected: "text-rose-600 dark:text-rose-400",
  error: "text-rose-600 dark:text-rose-400",
  disabled: "text-slate-500 dark:text-slate-400",
};

const LABEL: Record<SlackBotStatus["status"], string> = {
  connected: "Slack: connected",
  connecting: "Slack: connecting",
  reconnecting: "Slack: reconnecting",
  disconnected: "Slack: disconnected",
  error: "Slack: connection error",
  disabled: "Slack: not configured",
};

/** Polls the in-process Socket Mode connection status - see src/lib/slackBot.ts getSlackBotStatus(). Not push-based; a 15s poll is plenty for a status LED nobody's staring at continuously. */
export default function SlackConnectionIndicator({
  initialStatus,
  collapsed = false,
}: {
  initialStatus: SlackBotStatus;
  collapsed?: boolean;
}) {
  const [status, setStatus] = useState(initialStatus);
  const [reconnecting, startReconnect] = useTransition();

  useEffect(() => {
    const interval = setInterval(() => {
      getSlackBotStatusAction()
        .then(setStatus)
        .catch(() => undefined);
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  const showReconnect = status.status !== "connected" && status.status !== "disabled";

  if (collapsed) {
    // No Reconnect action here - the dot's color still surfaces a problem,
    // reconnecting just requires expanding the sidebar first.
    return (
      <div title={`${LABEL[status.status]}${status.detail ? ` - ${status.detail}` : ""}`} className="flex items-center justify-center p-2">
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${DOT_CLASS[status.status]}`} />
      </div>
    );
  }

  return (
    <div
      title={status.detail}
      className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs ${TEXT_CLASS[status.status]}`}
    >
      <span className={`h-2 w-2 shrink-0 rounded-full ${DOT_CLASS[status.status]}`} />
      {LABEL[status.status]}
      {showReconnect && (
        <button
          type="button"
          disabled={reconnecting}
          onClick={() => startReconnect(async () => setStatus(await reconnectSlackBotAction()))}
          className="ml-1 rounded border border-current px-1.5 py-0.5 text-xs disabled:cursor-not-allowed disabled:opacity-50"
        >
          {reconnecting ? "Reconnecting…" : "Reconnect"}
        </button>
      )}
    </div>
  );
}
