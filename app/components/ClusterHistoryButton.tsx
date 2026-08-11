"use client";

import { useEffect, useState, useTransition } from "react";
import { getClusterHistoryAction } from "../actions";
import FormattedDateTime from "./FormattedDateTime";
import { TRIGGER_LABEL } from "@/lib/historyFields";
import type { HistoryTimelineEntry } from "@/lib/historyView";

export default function ClusterHistoryButton({ clusterId, clusterName }: { clusterId: string; clusterName: string }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [entries, setEntries] = useState<HistoryTimelineEntry[] | null>(null);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  function handleOpen() {
    setOpen(true);
    startTransition(async () => {
      const result = await getClusterHistoryAction(clusterId);
      setEntries(result);
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        className="rounded-md border border-line px-2 py-1 text-xs font-medium text-ink-muted transition hover:bg-panel-hover"
      >
        History
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`History for ${clusterName}`}
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-xl border border-line bg-panel p-4 shadow-xl"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-ink">History - {clusterName}</p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="rounded-md px-2 py-1 text-ink-faint transition hover:bg-panel-hover hover:text-ink"
              >
                ✕
              </button>
            </div>
            <div className="mt-3 overflow-y-auto">
              {pending && entries === null && <p className="text-sm text-ink-muted">Loading…</p>}
              {entries !== null && entries.length === 0 && (
                <p className="text-sm text-ink-muted">No recorded history for this cluster yet.</p>
              )}
              {entries !== null && entries.length > 0 && (
                <ol className="flex flex-col gap-3">
                  {entries.map((entry, i) => (
                    <li key={`${entry.takenAt}-${i}`} className="border-l-2 border-line pl-3">
                      <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs text-ink-faint">
                        <FormattedDateTime ms={new Date(entry.takenAt).getTime()} />
                        <span>{TRIGGER_LABEL[entry.trigger] ?? entry.trigger}</span>
                      </div>
                      {entry.changes.length === 0 ? (
                        <p className="mt-1 text-sm text-ink-muted">
                          {i === 0 ? "First recorded state." : "No change recorded."}
                        </p>
                      ) : (
                        <ul className="mt-1 flex flex-col gap-0.5 text-sm text-ink">
                          {entry.changes.map((change) => (
                            <li key={change.field}>
                              <span className="text-ink-muted">{change.label}:</span> {change.from} →{" "}
                              {change.to}
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
