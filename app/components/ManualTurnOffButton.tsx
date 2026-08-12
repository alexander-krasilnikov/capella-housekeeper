"use client";

import { useEffect, useState, useTransition } from "react";
import { manualTurnOffAction } from "../actions";

export default function ManualTurnOffButton({
  clusterId,
  clusterName,
  disabled = false,
  onResult,
}: {
  clusterId: string;
  clusterName: string;
  disabled?: boolean;
  /** Result is reported upward rather than replacing this button in place - see ClusterTable's Action cell, which renders it in one shared footer below the whole row of buttons. */
  onResult: (result: { ok: boolean; message: string } | null) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        title={disabled ? "Cluster is already off" : undefined}
        onClick={() => setOpen(true)}
        className="rounded-md border border-amber-300 px-2 py-1 text-xs font-medium text-amber-700 transition hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-amber-800 dark:text-amber-400 dark:hover:bg-amber-950/40"
      >
        Turn off
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Turn off ${clusterName}`}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-xl border border-line bg-panel p-4 shadow-xl"
          >
            <p className="text-sm font-semibold text-ink">Turn off this cluster?</p>
            <p className="mt-1 text-xs text-ink-muted">
              <span className="font-mono font-semibold">{clusterName}</span> will be turned off immediately.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={() => setOpen(false)}
                className="rounded-md border border-line px-3 py-1.5 text-sm text-ink-muted transition hover:bg-panel-hover disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  onResult(null);
                  startTransition(async () => {
                    const r = await manualTurnOffAction(clusterId);
                    onResult(r);
                    setOpen(false);
                  });
                }}
                className="rounded-md border border-amber-600 bg-amber-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-amber-700"
              >
                {pending ? "Turning off…" : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
