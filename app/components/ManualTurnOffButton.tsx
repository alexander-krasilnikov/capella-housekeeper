"use client";

import { useState, useTransition } from "react";
import { manualTurnOffAction } from "../actions";

export default function ManualTurnOffButton({ clusterId, clusterName }: { clusterId: string; clusterName: string }) {
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  if (result) {
    return (
      <span
        className={`text-xs ${result.ok ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}
      >
        {result.message}
      </span>
    );
  }

  if (confirming) {
    return (
      <span className="inline-flex flex-wrap items-center gap-2 text-xs">
        <span className="text-ink-muted">Turn off {clusterName}?</span>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            startTransition(async () => {
              setResult(await manualTurnOffAction(clusterId));
            });
          }}
          className="rounded-md border border-amber-300 px-2 py-0.5 font-semibold text-amber-700 transition hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-amber-800 dark:text-amber-400 dark:hover:bg-amber-950/40"
        >
          {pending ? "Turning off…" : "Confirm"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => setConfirming(false)}
          className="rounded-md border border-line px-2 py-0.5 text-ink-muted transition hover:bg-panel-hover disabled:opacity-50"
        >
          Cancel
        </button>
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      className="rounded-md border border-amber-300 px-2 py-1 text-xs font-medium text-amber-700 transition hover:bg-amber-50 dark:border-amber-800 dark:text-amber-400 dark:hover:bg-amber-950/40"
    >
      Turn off
    </button>
  );
}
