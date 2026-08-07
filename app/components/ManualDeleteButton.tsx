"use client";

import { useEffect, useState, useTransition } from "react";
import { manualDeleteAction } from "../actions";

export default function ManualDeleteButton({ clusterId, clusterName }: { clusterId: string; clusterName: string }) {
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [typedName, setTypedName] = useState("");
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  if (result) {
    return (
      <span
        className={`text-xs ${result.ok ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}
      >
        {result.message}
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-rose-300 px-2 py-1 text-xs font-medium text-rose-700 transition hover:bg-rose-50 dark:border-rose-800 dark:text-rose-400 dark:hover:bg-rose-950/40"
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
            className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-4 shadow-xl dark:border-slate-700 dark:bg-slate-900"
          >
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Delete this cluster?</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
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
              className="mt-3 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-500/30 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={() => setOpen(false)}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-600 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={pending || typedName !== clusterName}
                onClick={() => {
                  startTransition(async () => {
                    const r = await manualDeleteAction(clusterId);
                    setResult(r);
                    setOpen(false);
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
