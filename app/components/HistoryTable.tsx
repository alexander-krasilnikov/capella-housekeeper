"use client";

import { useEffect, useState } from "react";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from "@tanstack/react-table";
import FormattedDateTime, { formatDateTime } from "./FormattedDateTime";
import { createGlobalFuzzyFilter, PaginationFooter } from "./TablePagination";
import type { HistoryTrigger } from "@/types";

export interface HistoryRow {
  clusterId: string;
  clusterName: string;
  org: string;
  project: string;
  takenAtMs: number;
  trigger: HistoryTrigger;
  triggerLabel: string;
  description: string;
}

/** Search matches against the same display labels the user sees, checked once per row against every column's label regardless of which column TanStack happens to invoke this for. */
const globalFuzzyFilter = createGlobalFuzzyFilter<HistoryRow>((r) => [
  r.clusterName,
  r.org,
  r.project,
  r.description,
  r.triggerLabel,
  formatDateTime(r.takenAtMs),
]);

const columnHelper = createColumnHelper<HistoryRow>();

const columns = [
  columnHelper.accessor("clusterName", {
    header: "Cluster",
    meta: { widthPct: 18 },
    cell: (info) => <span className="font-medium text-ink">{info.getValue()}</span>,
  }),
  columnHelper.accessor("org", { header: "Org", meta: { widthPct: 12 } }),
  columnHelper.accessor("project", { header: "Project", meta: { widthPct: 12 } }),
  columnHelper.accessor("description", { header: "Event", meta: { widthPct: 36 } }),
  columnHelper.accessor("triggerLabel", { header: "Trigger", meta: { widthPct: 10 } }),
  columnHelper.accessor("takenAtMs", {
    id: "takenAt",
    header: "When",
    meta: { widthPct: 12 },
    sortingFn: (a, b) => a.original.takenAtMs - b.original.takenAtMs,
    cell: (info) => <FormattedDateTime ms={info.getValue()} />,
  }),
];

export default function HistoryTable({ rows }: { rows: HistoryRow[] }) {
  const [globalFilter, setGlobalFilter] = useState("");
  const [sorting, setSorting] = useState<SortingState>([{ id: "takenAt", desc: true }]);
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 25 });

  // Return to page 1 when the search narrows the result set, so the user
  // doesn't land on a now out-of-range page. Done explicitly here (rather
  // than TanStack's autoResetPageIndex) since that option's reset fires
  // synchronously during row-model computation - safe after mount, but not
  // on the very first render, which is what autoResetPageIndex does.
  useEffect(() => {
    setPagination((p) => ({ ...p, pageIndex: 0 }));
  }, [globalFilter]);

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting, globalFilter, pagination },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onPaginationChange: setPagination,
    globalFilterFn: globalFuzzyFilter,
    autoResetPageIndex: false,
    getRowId: (row, index) => `${row.clusterId}-${row.takenAtMs}-${index}`,
    defaultColumn: { sortDescFirst: true },
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  const visibleLeafColumns = table.getVisibleLeafColumns();
  const totalWeight = visibleLeafColumns.reduce((sum, col) => sum + (col.columnDef.meta?.widthPct ?? 1), 0);
  function widthPctOf(columnId: string): number {
    const col = visibleLeafColumns.find((c) => c.id === columnId);
    const weight = col?.columnDef.meta?.widthPct ?? 1;
    return (weight / totalWeight) * 100;
  }

  const pageRows = table.getRowModel().rows;
  const totalRowCount = table.getPrePaginationRowModel().rows.length;

  if (rows.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-line p-10 text-center text-sm text-ink-muted">
        No consent or lifecycle events recorded yet.
      </p>
    );
  }

  return (
    <div className="flex w-full flex-col gap-3">
      <input
        type="search"
        value={globalFilter}
        onChange={(e) => setGlobalFilter(e.target.value)}
        placeholder="Search history…"
        aria-label="Search history across all fields"
        className="w-full max-w-sm rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/30"
      />

      {pageRows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line p-10 text-center text-sm text-ink-muted">
          No events match &ldquo;{globalFilter}&rdquo;.
        </p>
      ) : (
        <div className="rounded-xl border border-line bg-panel">
          <table className="w-full table-fixed border-collapse text-xs lg:text-sm">
            <colgroup>
              {table.getHeaderGroups()[0].headers.map((header) => (
                <col key={header.id} style={{ width: `${widthPctOf(header.column.id)}%` }} />
              ))}
            </colgroup>
            <thead>
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id} className="bg-panel-hover">
                  {headerGroup.headers.map((header) => (
                    <th
                      key={header.id}
                      onClick={header.column.getCanSort() ? header.column.getToggleSortingHandler() : undefined}
                      className={`border-b border-line px-1.5 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide transition lg:px-3 lg:py-2 lg:text-xs ${
                        header.column.getCanSort() ? "cursor-pointer select-none" : ""
                      } ${header.column.getIsSorted() ? "text-brand" : "text-ink-muted hover:text-ink"}`}
                    >
                      {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                      {header.column.getIsSorted() === "asc" && " ▲"}
                      {header.column.getIsSorted() === "desc" && " ▼"}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {pageRows.map((row) => (
                <tr key={row.id} className="border-b border-line align-top transition last:border-0 hover:bg-panel-hover">
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="break-words px-1.5 py-1.5 lg:px-3 lg:py-2">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>

          <PaginationFooter table={table} totalRowCount={totalRowCount} className="px-3 py-2 text-sm" />
        </div>
      )}
    </div>
  );
}
