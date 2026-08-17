"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { getClusterHistoryAction } from "../actions";
import FormattedDateTime, { formatDateTime } from "./FormattedDateTime";
import { createGlobalFuzzyFilter, PaginationFooter } from "./TablePagination";
import { TRIGGER_LABEL } from "@/lib/historyFields";
import type { HistoryTimelineEntry } from "@/lib/historyView";

interface HistoryRow extends HistoryTimelineEntry {
  /** Whether this is the chronologically-first entry (last in display order) - see getClusterHistory. Precomputed from the full, unfiltered list so it stays correct once rows are paginated/filtered. */
  isFirstRecorded: boolean;
}

/** Matches the query against every field the grid displays. */
const globalFuzzyFilter = createGlobalFuzzyFilter<HistoryRow>((r) => [
  formatDateTime(new Date(r.takenAt).getTime()),
  TRIGGER_LABEL[r.trigger] ?? r.trigger,
  r.changes.length === 0
    ? r.isFirstRecorded
      ? "First recorded state."
      : "No change recorded."
    : r.changes.map((c) => `${c.label} ${c.from} ${c.to}`).join(" "),
]);

const columnHelper = createColumnHelper<HistoryRow>();

const columns = [
  columnHelper.accessor("takenAt", {
    header: "Date",
    cell: (info) => <FormattedDateTime ms={new Date(info.getValue()).getTime()} />,
  }),
  columnHelper.accessor("trigger", {
    header: "Event",
    cell: (info) => TRIGGER_LABEL[info.getValue()] ?? info.getValue(),
  }),
  columnHelper.accessor("changes", {
    header: "Changes",
    cell: (info) => {
      const changes = info.getValue();
      const row = info.row.original;
      if (changes.length === 0) {
        return <span className="text-ink-muted">{row.isFirstRecorded ? "First recorded state." : "No change recorded."}</span>;
      }
      return (
        <ul className="flex flex-col gap-0.5">
          {changes.map((change) => (
            <li key={change.field}>
              <span className="text-ink-muted">{change.label}:</span> {change.from} → {change.to}
            </li>
          ))}
        </ul>
      );
    },
  }),
];

export default function ClusterHistoryButton({ clusterId, clusterName }: { clusterId: string; clusterName: string }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [entries, setEntries] = useState<HistoryTimelineEntry[] | null>(null);
  const [globalFilter, setGlobalFilter] = useState("");
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 25 });

  // Return to page 1 when the search narrows the result set, so the user
  // doesn't land on a now out-of-range page. Done explicitly here (rather
  // than TanStack's autoResetPageIndex) since that option's reset fires
  // synchronously during row-model computation - safe after mount, but not
  // on the very first render, which is what autoResetPageIndex does.
  useEffect(() => {
    setPagination((p) => ({ ...p, pageIndex: 0 }));
  }, [globalFilter]);

  const rows: HistoryRow[] = useMemo(
    () => (entries ?? []).map((entry, i) => ({ ...entry, isFirstRecorded: i === (entries?.length ?? 0) - 1 })),
    [entries],
  );

  const table = useReactTable({
    data: rows,
    columns,
    state: { globalFilter, pagination },
    onGlobalFilterChange: setGlobalFilter,
    onPaginationChange: setPagination,
    globalFilterFn: globalFuzzyFilter,
    autoResetPageIndex: false,
    getRowId: (row, index) => `${row.takenAt}-${index}`,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  const pageRows = table.getRowModel().rows;
  const totalRowCount = table.getPrePaginationRowModel().rows.length;

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
    setGlobalFilter("");
    setPagination({ pageIndex: 0, pageSize: 25 });
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
        className="rounded-md border border-line px-2 py-1 text-xs font-medium text-ink-muted transition hover:border-brand hover:text-brand"
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
            className="flex max-h-[80vh] w-full max-w-3xl flex-col rounded-xl border border-line bg-panel p-4 shadow-xl"
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

            {pending && entries === null && <p className="mt-3 text-sm text-ink-muted">Loading…</p>}
            {entries !== null && entries.length === 0 && (
              <p className="mt-3 text-sm text-ink-muted">No recorded history for this cluster yet.</p>
            )}
            {entries !== null && entries.length > 0 && (
              <div className="mt-3 flex min-h-0 flex-1 flex-col gap-3">
                <input
                  type="search"
                  value={globalFilter}
                  onChange={(e) => setGlobalFilter(e.target.value)}
                  placeholder="Search history…"
                  aria-label="Search history across all fields"
                  className="w-full max-w-sm shrink-0 rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/30"
                />

                {pageRows.length === 0 ? (
                  <p className="min-h-0 flex-1 text-sm text-ink-muted">No events match &ldquo;{globalFilter}&rdquo;.</p>
                ) : (
                  <>
                    <div className="min-h-0 flex-1 overflow-y-auto">
                      <table className="w-full text-left text-sm">
                        <thead>
                          {table.getHeaderGroups().map((headerGroup) => (
                            <tr key={headerGroup.id} className="text-[11px] uppercase tracking-wide text-ink-faint">
                              {headerGroup.headers.map((header) => (
                                <th key={header.id} className="pb-2 pr-3 font-semibold">
                                  {flexRender(header.column.columnDef.header, header.getContext())}
                                </th>
                              ))}
                            </tr>
                          ))}
                        </thead>
                        <tbody>
                          {/* Most recent first (see getClusterHistory) - the chronologically-first
                              entry, always carrying an empty diff, is therefore the last row. */}
                          {pageRows.map((row) => (
                            <tr key={row.id} className="border-t border-line align-top">
                              {row.getVisibleCells().map((cell) => (
                                <td key={cell.id} className="py-2 pr-3 text-ink">
                                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <PaginationFooter table={table} totalRowCount={totalRowCount} className="shrink-0 pt-2 text-xs" />
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
