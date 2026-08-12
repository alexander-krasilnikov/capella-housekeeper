"use client";

import { useEffect, useState, useTransition } from "react";
import { manualTurnOffAction, manualTurnOnAction } from "../actions";

type ManualActionResult = { ok: boolean; message: string };

interface DirectionConfig {
  label: string;
  pendingLabel: string;
  disabledTitle: string;
  prompt: string;
  body: string;
  action: (clusterId: string) => Promise<ManualActionResult>;
  triggerClass: string;
  confirmClass: string;
}

const DIRECTIONS: Record<"on" | "off", DirectionConfig> = {
  off: {
    label: "Turn off",
    pendingLabel: "Turning off…",
    disabledTitle: "Cluster is already off",
    prompt: "Turn off this cluster?",
    body: "will be turned off immediately.",
    action: manualTurnOffAction,
    triggerClass:
      "border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-400 dark:hover:bg-amber-950/40",
    confirmClass: "border-amber-600 bg-amber-600 hover:bg-amber-700 dark:border-amber-700",
  },
  on: {
    label: "Turn on",
    pendingLabel: "Turning on…",
    disabledTitle: "Cluster is already on",
    prompt: "Turn on this cluster?",
    body: "will be turned on immediately.",
    action: manualTurnOnAction,
    triggerClass:
      "border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950/40",
    confirmClass: "border-emerald-600 bg-emerald-600 hover:bg-emerald-700 dark:border-emerald-700",
  },
};

/**
 * Shared by ManualTurnOffButton/ManualTurnOnButton - identical confirm-dialog
 * behavior (state, Escape-to-close, dialog markup), differing only in label,
 * color, and which server action fires. See ClusterTable's Action cell,
 * which renders these in one shared footer below the whole row of buttons -
 * `onResult` reports the outcome upward rather than this button replacing
 * itself with it in place.
 */
export default function ManualPowerButton({
  direction,
  clusterId,
  clusterName,
  disabled = false,
  onResult,
}: {
  direction: "on" | "off";
  clusterId: string;
  clusterName: string;
  disabled?: boolean;
  onResult: (result: ManualActionResult | null) => void;
}) {
  const config = DIRECTIONS[direction];
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  // Locks the trigger the instant a confirmed action succeeds, rather than
  // relying solely on the parent's `disabled` prop - that prop only reflects
  // reality once revalidatePath's fresh row data arrives, leaving a window
  // right after success where the trigger would otherwise still be enabled
  // and a fast second click could fire a redundant action. Releases once
  // `disabled` actually flips true, confirming fresh data landed.
  const [justActed, setJustActed] = useState(false);

  useEffect(() => {
    if (disabled) setJustActed(false);
  }, [disabled]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const triggerDisabled = disabled || justActed;

  return (
    <>
      <button
        type="button"
        disabled={triggerDisabled}
        title={triggerDisabled ? config.disabledTitle : undefined}
        onClick={() => setOpen(true)}
        className={`rounded-md border px-2 py-1 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${config.triggerClass}`}
      >
        {config.label}
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`${config.label} ${clusterName}`}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-xl border border-line bg-panel p-4 shadow-xl"
          >
            <p className="text-sm font-semibold text-ink">{config.prompt}</p>
            <p className="mt-1 text-xs text-ink-muted">
              <span className="font-mono font-semibold">{clusterName}</span> {config.body}
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
                    const r = await config.action(clusterId);
                    onResult(r);
                    setOpen(false);
                    if (r.ok) setJustActed(true);
                  });
                }}
                className={`rounded-md px-3 py-1.5 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-40 ${config.confirmClass}`}
              >
                {pending ? config.pendingLabel : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
