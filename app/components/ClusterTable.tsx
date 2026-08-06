"use client";

import { Fragment, useEffect, useState } from "react";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  getFilteredRowModel,
  getGroupedRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ExpandedState,
  type FilterFn,
  type GroupingState,
  type SortingState,
  type VisibilityState,
} from "@tanstack/react-table";
import { formatUsd } from "@/lib/format";

declare module "@tanstack/react-table" {
  interface ColumnMeta<TData, TValue> {
    widthPct: number;
  }
}

export interface ClusterRow {
  clusterId: string;
  orgId: string;
  projectId: string;
  org: string;
  project: string;
  name: string;
  createdAtMs: number;
  ageLabel: string;
  ageDays: number;
  lastActivityMs: number | null;
  owner: string;
  configSummary: string;
  couchbaseVersion: string;
  storageSummary: string;
  actualCost: number | null;
  actualCostAsOfMs: number | null;
  actualCostUnavailableReason: "credits-based" | "no-access" | "error" | null;
  statusLabel: string;
  deleted: boolean;
  lastSyncedAtMs: number;
}

const ACTUAL_COST_UNAVAILABLE_LABEL: Record<"credits-based" | "no-access" | "error", string> = {
  "credits-based": "Billed in credits",
  "no-access": "No billing access",
  error: "Sync error",
};

function actualCostDisplayLabel(row: ClusterRow): string {
  if (row.actualCost !== null) return formatUsd(row.actualCost);
  if (row.actualCostUnavailableReason) return ACTUAL_COST_UNAVAILABLE_LABEL[row.actualCostUnavailableReason];
  return "—";
}

/**
 * Formats a timestamp using the visiting browser's own locale (region,
 * calendar, 12h/24h convention) rather than a hardcoded one - `undefined`
 * as the locale argument means "whatever this runtime's default is",
 * which is the actual browser once this runs client-side. 2-digit year,
 * no seconds, per explicit request.
 */
function formatDateTime(ms: number | null): string {
  if (ms === null) return "—";
  return new Date(ms).toLocaleString(undefined, {
    year: "2-digit",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
  });
}

/**
 * Renders a locale-formatted date/time, correctly - not just quietly.
 * A Client Component's first render also happens on the server (for the
 * initial HTML), where `toLocaleString(undefined, ...)` resolves to the
 * Node server's locale, not the browser's. Suppressing the resulting
 * hydration warning is not enough on its own: React only skips *warning*
 * about that mismatch, it doesn't schedule a re-render to correct it, so
 * without something to trigger one, the server's (wrong) locale would
 * stick permanently. This renders a neutral, locale-independent
 * placeholder for the server render and the first client paint (which
 * therefore match exactly - no mismatch, nothing to suppress), then swaps
 * to the real browser-formatted value once mounted, via a genuine
 * post-mount state update.
 */
function FormattedDateTime({ ms }: { ms: number | null }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  if (ms === null) return <>—</>;
  if (!mounted) return <>…</>;
  return <>{formatDateTime(ms)}</>;
}

/**
 * Search matches against the same display labels the user sees (not the
 * raw sort/aggregation values, which are numbers for the cost columns) -
 * checked once per row against every column's label, independent of which
 * column TanStack happens to invoke this for.
 */
const globalFuzzyFilter: FilterFn<ClusterRow> = (row, _columnId, filterValue) => {
  const term = String(filterValue).toLowerCase();
  if (!term) return true;
  const r = row.original;
  const haystack = [
    r.org,
    r.project,
    r.name,
    formatDateTime(r.createdAtMs),
    r.ageLabel,
    formatDateTime(r.lastActivityMs),
    r.owner,
    r.configSummary,
    actualCostDisplayLabel(r),
    r.deleted ? "deleted" : r.statusLabel,
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(term);
};

const columnHelper = createColumnHelper<ClusterRow>();

const columns = [
  columnHelper.display({
    id: "expander",
    header: () => null,
    meta: { widthPct: 3 },
    enableGrouping: false,
    enableSorting: false,
    enableHiding: false,
  }),
  columnHelper.accessor("org", { header: "Org", meta: { widthPct: 8 }, enableGrouping: true }),
  columnHelper.accessor("project", { header: "Project", meta: { widthPct: 7 }, enableGrouping: true }),
  columnHelper.accessor("name", {
    header: "Cluster",
    meta: { widthPct: 9 },
    enableGrouping: false,
    cell: (info) => (
      <span className="font-medium text-slate-900 dark:text-slate-100">{info.getValue()}</span>
    ),
  }),
  columnHelper.accessor("createdAtMs", {
    id: "createdAt",
    header: "Created",
    meta: { widthPct: 8 },
    enableGrouping: false,
    cell: (info) => <FormattedDateTime ms={info.getValue()} />,
  }),
  columnHelper.accessor("ageLabel", {
    id: "age",
    header: "Age",
    meta: { widthPct: 5 },
    enableGrouping: false,
    sortingFn: (a, b) => a.original.ageDays - b.original.ageDays,
  }),
  columnHelper.accessor("lastActivityMs", {
    id: "lastActivity",
    header: "Last Activity",
    meta: { widthPct: 9 },
    enableGrouping: false,
    sortingFn: (a, b) => (a.original.lastActivityMs ?? -Infinity) - (b.original.lastActivityMs ?? -Infinity),
    cell: (info) => <FormattedDateTime ms={info.getValue()} />,
  }),
  columnHelper.accessor("owner", {
    header: "Owner",
    meta: { widthPct: 13 },
    enableGrouping: true,
    cell: (info) => <span className="break-words">{info.getValue()}</span>,
  }),
  columnHelper.accessor("configSummary", {
    id: "config",
    header: "Configuration",
    meta: { widthPct: 16 },
    enableGrouping: false,
  }),
  columnHelper.accessor("actualCost", {
    id: "actualCost",
    header: "Actual Cost",
    meta: { widthPct: 8 },
    enableGrouping: false,
    aggregationFn: "sum",
    cell: (info) => {
      const amount = info.getValue();
      if (amount === null) {
        return <span className="text-slate-400 dark:text-slate-500">{actualCostDisplayLabel(info.row.original)}</span>;
      }
      return (
        <span>
          {formatUsd(amount)} (as of <FormattedDateTime ms={info.row.original.actualCostAsOfMs} />)
        </span>
      );
    },
    aggregatedCell: (info) => formatUsd(info.getValue() as number),
  }),
  columnHelper.accessor((row) => (row.deleted ? "Deleted" : row.statusLabel), {
    id: "status",
    header: "Status",
    meta: { widthPct: 6 },
    enableGrouping: false,
    cell: (info) => (
      <StatusBadge deleted={info.row.original.deleted} statusLabel={info.row.original.statusLabel} />
    ),
  }),
];

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

const STORAGE_KEY = "capella-housekeeper:table-config:v1";

interface PersistedTableConfig {
  columnVisibility?: VisibilityState;
  columnOrder?: string[];
  sorting?: SortingState;
  pageSize?: number;
}

function loadPersistedConfig(): PersistedTableConfig {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PersistedTableConfig) : {};
  } catch {
    return {};
  }
}

export default function ClusterTable({ rows }: { rows: ClusterRow[] }) {
  const [globalFilter, setGlobalFilter] = useState("");
  const [sorting, setSorting] = useState<SortingState>([{ id: "org", desc: false }]);
  const [columnOrder, setColumnOrder] = useState<string[]>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [grouping, setGrouping] = useState<GroupingState>([]);
  const [expanded, setExpanded] = useState<ExpandedState>({});
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 25 });
  const [detailOpenIds, setDetailOpenIds] = useState<Set<string>>(new Set());
  const [columnsPanelOpen, setColumnsPanelOpen] = useState(false);
  const [configLoaded, setConfigLoaded] = useState(false);

  // Restore persisted column visibility/order/sort/page-size once on mount.
  // Reading localStorage during render would break server/client hydration,
  // so this only happens after mount, then the write-back effect below is
  // gated on configLoaded to avoid clobbering the saved config with defaults
  // before it's had a chance to load.
  useEffect(() => {
    const persisted = loadPersistedConfig();
    if (persisted.sorting) setSorting(persisted.sorting);
    if (persisted.columnOrder) setColumnOrder(persisted.columnOrder);
    if (persisted.columnVisibility) setColumnVisibility(persisted.columnVisibility);
    if (persisted.pageSize) setPagination((p) => ({ ...p, pageSize: persisted.pageSize! }));
    setConfigLoaded(true);
  }, []);

  useEffect(() => {
    if (!configLoaded) return;
    const config: PersistedTableConfig = {
      columnVisibility,
      columnOrder,
      sorting,
      pageSize: pagination.pageSize,
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  }, [configLoaded, columnVisibility, columnOrder, sorting, pagination.pageSize]);

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
    state: {
      sorting,
      globalFilter,
      columnOrder,
      columnVisibility,
      grouping,
      expanded,
      pagination,
    },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onColumnOrderChange: setColumnOrder,
    onColumnVisibilityChange: setColumnVisibility,
    onGroupingChange: setGrouping,
    onExpandedChange: setExpanded,
    onPaginationChange: setPagination,
    globalFilterFn: globalFuzzyFilter,
    paginateExpandedRows: false,
    // Default true: TanStack resets the page index as a side effect of
    // computing the row model whenever the filtered set changes, which
    // happens synchronously during the very first render (before this
    // component has finished mounting) and trips a React warning. Reset
    // is instead done explicitly in a useEffect keyed on globalFilter below.
    autoResetPageIndex: false,
    getRowId: (row) => row.clusterId,
    defaultColumn: { sortDescFirst: false },
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getGroupedRowModel: getGroupedRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  function moveColumn(columnId: string, direction: -1 | 1) {
    setColumnOrder((old) => {
      const order = old.length > 0 ? [...old] : table.getAllLeafColumns().map((c) => c.id);
      const idx = order.indexOf(columnId);
      const newIdx = idx + direction;
      if (newIdx <= 0 || newIdx >= order.length) return order;
      [order[idx], order[newIdx]] = [order[newIdx], order[idx]];
      return order;
    });
  }

  function toggleDetail(clusterId: string) {
    setDetailOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(clusterId)) next.delete(clusterId);
      else next.add(clusterId);
      return next;
    });
  }

  const visibleLeafColumns = table.getVisibleLeafColumns();
  const totalWeight = visibleLeafColumns.reduce(
    (sum, col) => sum + (col.columnDef.meta?.widthPct ?? 1),
    0,
  );
  function widthPctOf(columnId: string): number {
    const col = visibleLeafColumns.find((c) => c.id === columnId);
    const weight = col?.columnDef.meta?.widthPct ?? 1;
    return (weight / totalWeight) * 100;
  }

  const currentColumnOrder =
    columnOrder.length > 0 ? columnOrder : table.getAllLeafColumns().map((c) => c.id);
  const orderedColumnsForPanel = currentColumnOrder
    .filter((id) => id !== "expander")
    .map((id) => table.getColumn(id))
    .filter((c): c is NonNullable<typeof c> => !!c);

  const hiddenColumnIds = table
    .getAllLeafColumns()
    .filter((c) => c.id !== "expander" && !c.getIsVisible())
    .map((c) => c.id);

  const pageRows = table.getRowModel().rows;
  const totalRowCount = table.getPrePaginationRowModel().rows.length;
  const pageCount = table.getPageCount();

  if (rows.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
        No clusters synced yet. The background sync will populate this table shortly after startup.
      </p>
    );
  }

  return (
    <div className="flex w-full flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={globalFilter}
          onChange={(e) => setGlobalFilter(e.target.value)}
          placeholder="Search clusters…"
          aria-label="Search clusters across all fields"
          className="w-full max-w-sm rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        />

        <select
          value={grouping[0] ?? ""}
          onChange={(e) => setGrouping(e.target.value ? [e.target.value] : [])}
          aria-label="Group rows by"
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
        >
          <option value="">No grouping</option>
          <option value="org">Group by Org</option>
          <option value="project">Group by Project</option>
          <option value="owner">Group by Owner</option>
        </select>

        <div className="relative">
          <button
            type="button"
            onClick={() => setColumnsPanelOpen((o) => !o)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Columns
          </button>
          {columnsPanelOpen && (
            <div className="absolute left-0 z-20 mt-2 w-72 rounded-lg border border-slate-200 bg-white p-2 shadow-lg dark:border-slate-700 dark:bg-slate-900">
              {orderedColumnsForPanel.map((column, idx, arr) => (
                <div
                  key={column.id}
                  className="flex items-center justify-between gap-2 rounded px-2 py-1 text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  <label className="flex min-w-0 flex-1 items-center gap-2">
                    <input
                      type="checkbox"
                      checked={column.getIsVisible()}
                      onChange={column.getToggleVisibilityHandler()}
                    />
                    <span className="truncate">
                      {typeof column.columnDef.header === "string" ? column.columnDef.header : column.id}
                    </span>
                  </label>
                  <div className="flex shrink-0 items-center gap-1 text-xs">
                    <button
                      type="button"
                      title="Move left"
                      disabled={idx === 0}
                      onClick={() => moveColumn(column.id, -1)}
                      className="rounded px-1.5 py-0.5 text-slate-400 hover:bg-slate-100 disabled:opacity-30 dark:hover:bg-slate-800"
                    >
                      ←
                    </button>
                    <button
                      type="button"
                      title="Move right"
                      disabled={idx === arr.length - 1}
                      onClick={() => moveColumn(column.id, 1)}
                      className="rounded px-1.5 py-0.5 text-slate-400 hover:bg-slate-100 disabled:opacity-30 dark:hover:bg-slate-800"
                    >
                      →
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {pageRows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
          No clusters match &ldquo;{globalFilter}&rdquo;.
        </p>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <table className="w-full table-fixed border-collapse text-xs lg:text-sm">
            <colgroup>
              {table.getHeaderGroups()[0].headers.map((header) => (
                <col key={header.id} style={{ width: `${widthPctOf(header.column.id)}%` }} />
              ))}
            </colgroup>
            <thead>
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id} className="bg-slate-50 dark:bg-slate-800/60">
                  {headerGroup.headers.map((header) => (
                    <th
                      key={header.id}
                      onClick={header.column.getCanSort() ? header.column.getToggleSortingHandler() : undefined}
                      className={`border-b border-slate-200 px-1.5 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide transition lg:px-3 lg:py-2 lg:text-xs dark:border-slate-800 ${
                        header.column.getCanSort() ? "cursor-pointer select-none" : ""
                      } ${
                        header.column.getIsSorted()
                          ? "text-blue-600 dark:text-blue-400"
                          : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100"
                      }`}
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
                <Fragment key={row.id}>
                  <tr
                    className={`border-b border-slate-100 align-top transition last:border-0 dark:border-slate-800 ${
                      row.original.deleted ? "opacity-50" : "hover:bg-slate-50 dark:hover:bg-slate-800/50"
                    }`}
                  >
                    {row.getVisibleCells().map((cell) => {
                      if (cell.column.id === "expander") {
                        return (
                          <td key={cell.id} className="px-1 py-1.5 text-center lg:px-2 lg:py-2">
                            {!row.getIsGrouped() && (
                              <button
                                type="button"
                                onClick={() => toggleDetail(row.original.clusterId)}
                                aria-label="Toggle cluster details"
                                className="text-slate-400 transition hover:text-blue-500 dark:text-slate-500 dark:hover:text-blue-400"
                              >
                                {detailOpenIds.has(row.original.clusterId) ? "▾" : "▸"}
                              </button>
                            )}
                          </td>
                        );
                      }

                      if (cell.getIsGrouped()) {
                        return (
                          <td key={cell.id} className="break-words px-1.5 py-1.5 lg:px-3 lg:py-2">
                            <button
                              type="button"
                              onClick={row.getToggleExpandedHandler()}
                              className="inline-flex items-center gap-1.5 font-medium text-slate-900 dark:text-slate-100"
                            >
                              <span>{row.getIsExpanded() ? "▾" : "▸"}</span>
                              {flexRender(cell.column.columnDef.cell, cell.getContext())}
                              <span className="text-xs font-normal text-slate-400 dark:text-slate-500">
                                ({row.subRows.length})
                              </span>
                            </button>
                          </td>
                        );
                      }

                      if (cell.getIsAggregated()) {
                        return (
                          <td key={cell.id} className="break-words px-1.5 py-1.5 text-slate-600 lg:px-3 lg:py-2 dark:text-slate-300">
                            {flexRender(
                              cell.column.columnDef.aggregatedCell ?? cell.column.columnDef.cell,
                              cell.getContext(),
                            )}
                          </td>
                        );
                      }

                      if (cell.getIsPlaceholder()) {
                        return (
                          <td key={cell.id} className="px-1.5 py-1.5 text-slate-300 lg:px-3 lg:py-2 dark:text-slate-700">
                            —
                          </td>
                        );
                      }

                      return (
                        <td key={cell.id} className="break-words px-1.5 py-1.5 lg:px-3 lg:py-2">
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      );
                    })}
                  </tr>
                  {!row.getIsGrouped() && detailOpenIds.has(row.original.clusterId) && (
                    <tr className="bg-slate-50 dark:bg-slate-900/60">
                      <td colSpan={row.getVisibleCells().length} className="px-4 py-3">
                        <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs sm:grid-cols-4">
                          <div>
                            <dt className="text-slate-400 dark:text-slate-500">Cluster ID</dt>
                            <dd className="break-all text-slate-600 dark:text-slate-300">{row.original.clusterId}</dd>
                          </div>
                          <div>
                            <dt className="text-slate-400 dark:text-slate-500">Org ID</dt>
                            <dd className="break-all text-slate-600 dark:text-slate-300">{row.original.orgId}</dd>
                          </div>
                          <div>
                            <dt className="text-slate-400 dark:text-slate-500">Project ID</dt>
                            <dd className="break-all text-slate-600 dark:text-slate-300">{row.original.projectId}</dd>
                          </div>
                          <div>
                            <dt className="text-slate-400 dark:text-slate-500">Couchbase Version</dt>
                            <dd className="text-slate-600 dark:text-slate-300">{row.original.couchbaseVersion}</dd>
                          </div>
                          <div>
                            <dt className="text-slate-400 dark:text-slate-500">Storage</dt>
                            <dd className="text-slate-600 dark:text-slate-300">{row.original.storageSummary}</dd>
                          </div>
                          <div>
                            <dt className="text-slate-400 dark:text-slate-500">Last Synced</dt>
                            <dd className="text-slate-600 dark:text-slate-300">
                              {formatDateTime(row.original.lastSyncedAtMs)}
                            </dd>
                          </div>
                          {hiddenColumnIds.map((columnId) => {
                            const cell = row.getAllCells().find((c) => c.column.id === columnId);
                            if (!cell) return null;
                            const header = cell.column.columnDef.header;
                            return (
                              <div key={columnId}>
                                <dt className="text-slate-400 dark:text-slate-500">
                                  {typeof header === "string" ? header : columnId}
                                </dt>
                                <dd className="break-words text-slate-600 dark:text-slate-300">
                                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                </dd>
                              </div>
                            );
                          })}
                        </dl>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-3 py-2 text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
            <div>
              Showing {pagination.pageIndex * pagination.pageSize + 1}–
              {Math.min((pagination.pageIndex + 1) * pagination.pageSize, totalRowCount)} of {totalRowCount}
            </div>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1.5">
                Rows per page
                <select
                  value={pagination.pageSize}
                  onChange={(e) => table.setPageSize(Number(e.target.value))}
                  className="rounded-md border border-slate-300 bg-white px-1.5 py-1 text-sm dark:border-slate-700 dark:bg-slate-900"
                >
                  {PAGE_SIZE_OPTIONS.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
                className="rounded-md border border-slate-300 px-2 py-1 disabled:opacity-40 dark:border-slate-700"
              >
                ← Prev
              </button>
              <span>
                Page {pagination.pageIndex + 1} of {Math.max(pageCount, 1)}
              </span>
              <button
                type="button"
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
                className="rounded-md border border-slate-300 px-2 py-1 disabled:opacity-40 dark:border-slate-700"
              >
                Next →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ deleted, statusLabel }: { deleted: boolean; statusLabel: string }) {
  if (deleted) {
    return (
      <span className="inline-flex items-center gap-1.5 text-rose-600 dark:text-rose-400">
        <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
        Deleted
      </span>
    );
  }

  const isOff = /off/i.test(statusLabel);
  const isActive = statusLabel === "Active" || /healthy|running|ready/i.test(statusLabel);

  const colorClass = isOff
    ? "text-amber-600 dark:text-amber-400"
    : isActive
      ? "text-emerald-600 dark:text-emerald-400"
      : "text-slate-500 dark:text-slate-400";
  const dotClass = isOff ? "bg-amber-500" : isActive ? "bg-emerald-500" : "bg-slate-400";

  return (
    <span className={`inline-flex items-center gap-1.5 ${colorClass}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} />
      {statusLabel}
    </span>
  );
}
