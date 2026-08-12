"use client";

import { useEffect, useState, useTransition } from "react";
import { manualDeleteAction } from "../actions";

export default function ManualDeleteButton({
  clusterId,
  clusterName,
  onResult,
}: {
  clusterId: string;
  clusterName: string;
  /** Result is reported upward rather than replacing this button in place - see ClusterTable's Action cell, which renders it in one shared footer below the whole row of buttons. */
  onResult: (result: { ok: boolean; message: string } | null) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [typedName, setTypedName] = useState("");
  // Locks the trigger once a delete succeeds - unlike the turn-on/turn-off
  // buttons there's no `disabled` prop reflecting fresh row state to release
  // this on (a deleted cluster's row disappears once revalidatePath's data
  // arrives), so this stays locked for the rest of this component's life,
  // closing the window where a fast second click could re-open the dialog
  // and fire a redundant delete before the row is gone.
  const [justActed, setJustActed] = useState(false);

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
        disabled={justActed}
        onClick={() => setOpen(true)}
        className="rounded-md border border-rose-300 px-2 py-1 text-xs font-medium text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-rose-800 dark:text-rose-400 dark:hover:bg-rose-950/40"
      >
        Delete
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Delete ${clusterName}`}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-xl border border-line bg-panel p-4 shadow-xl"
          >
            <p className="text-sm font-semibold text-ink">Delete this cluster?</p>
            <p className="mt-1 text-xs text-ink-muted">
              This can&rsquo;t be undone. Type <span className="font-mono font-semibold">{clusterName}</span> to
              confirm.
            </p>
            <input
              type="text"
              autoFocus
              value={typedName}
              onChange={(e) => setTypedName(e.target.value)}
              placeholder={clusterName}
              aria-label="Cluster name confirmation"
              className="mt-3 w-full rounded-md border border-line bg-panel px-2 py-1.5 text-sm text-ink outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-500/30"
            />
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
                disabled={pending || typedName !== clusterName}
                onClick={() => {
                  onResult(null);
                  startTransition(async () => {
                    const r = await manualDeleteAction(clusterId);
                    onResult(r);
                    setOpen(false);
                    if (r.ok) setJustActed(true);
                  });
                }}
                className="rounded-md border border-rose-600 bg-rose-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-rose-700"
              >
                {pending ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
