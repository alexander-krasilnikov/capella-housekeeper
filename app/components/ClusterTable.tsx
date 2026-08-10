"use client";

import { Fragment, useEffect, useState } from "react";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnFiltersState,
  type FilterFn,
  type SortingState,
  type VisibilityState,
} from "@tanstack/react-table";
import { formatUsd } from "@/lib/format";
import SendConsentRequestButton from "./SendConsentRequestButton";
import ManualTurnOffButton from "./ManualTurnOffButton";
import ManualDeleteButton from "./ManualDeleteButton";
import type { AgeStatus, ConsentActionOutcome, ConsentStatus } from "@/types";

declare module "@tanstack/react-table" {
  interface ColumnMeta<TData, TValue> {
    widthPct: number;
  }
}

/** Chevron for the row-expander button - rotates in place via CSS rather than swapping ▸/▾ glyphs, so opening/closing animates smoothly instead of jumping between two differently-shaped characters. */
function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M7 4l6 6-6 6" />
    </svg>
  );
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
  statusIsOff: boolean;
  ageStatus: AgeStatus;
  consentStatus: ConsentStatus;
  actionOutcome: ConsentActionOutcome;
  snoozeUntilMs: number | null;
  snoozeJustification: string | null;
  lastSyncedAtMs: number;
}

const AGE_STATUS_OPTIONS: AgeStatus[] = ["In Use", "Stale", "Forgotten"];

type DetailGroup = "Organisation" | "Cluster" | "Workflow";
const DETAIL_GROUPS: DetailGroup[] = ["Organisation", "Cluster", "Workflow"];

/** Which group a column lands in when hidden from the main table and shown in the row detail panel instead - see the detail row rendering below. Anything not listed here (shouldn't happen for a real column id) falls back to "Cluster". */
const DETAIL_GROUP_BY_COLUMN_ID: Record<string, DetailGroup> = {
  org: "Organisation",
  project: "Organisation",
  name: "Cluster",
  createdAt: "Cluster",
  age: "Cluster",
  lastActivity: "Cluster",
  owner: "Cluster",
  config: "Cluster",
  actualCost: "Cluster",
  status: "Cluster",
  ageStatus: "Cluster",
  consent: "Workflow",
};

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

/** Combines consentStatus and actionOutcome into one label+color - e.g. a "pending" decision reads differently from an "approved-turnoff" that's already been "performed" vs. merely "failed" and awaiting retry. */
function describeConsent(
  status: ConsentStatus,
  outcome: ConsentActionOutcome,
): { label: string; text: string; dot: string } {
  if (status === "none") {
    return { label: "—", text: "text-ink-faint", dot: "bg-slate-300 dark:bg-slate-600" };
  }
  if (status === "pending") {
    return { label: "Pending", text: "text-amber-600 dark:text-amber-400", dot: "bg-amber-500" };
  }
  if (status === "expired") {
    return { label: "Expired", text: "text-amber-600 dark:text-amber-400", dot: "bg-amber-500" };
  }
  if (status === "snoozed") {
    // No date baked in here deliberately - see FormattedDateTime's own
    // comment on why locale-formatted dates can't render the same on the
    // server and client without a hydration mismatch. The exact
    // snooze-until date is shown in the row's detail panel instead, via
    // FormattedDateTime, same as every other date in this table.
    return { label: "Snoozed", text: "text-blue-600 dark:text-blue-400", dot: "bg-blue-500" };
  }

  const actionLabel = status === "approved-turnoff" ? "Turn off" : "Delete";
  if (outcome === "performed") {
    return {
      label: status === "approved-turnoff" ? "Turned off" : "Deleted",
      text: "text-emerald-600 dark:text-emerald-400",
      dot: "bg-emerald-500",
    };
  }
  if (outcome === "skipped") {
    return { label: `${actionLabel} skipped`, text: "text-ink-muted", dot: "bg-slate-400" };
  }
  if (outcome === "failed") {
    return { label: `${actionLabel} failed`, text: "text-rose-600 dark:text-rose-400", dot: "bg-rose-500" };
  }
  return { label: `Approved: ${actionLabel}`, text: "text-blue-600 dark:text-blue-400", dot: "bg-blue-500" };
}

function ConsentBadge({ status, outcome }: { status: ConsentStatus; outcome: ConsentActionOutcome }) {
  const style = describeConsent(status, outcome);
  if (status === "none") return <span className={style.text}>{style.label}</span>;
  return (
    <span className={`inline-flex items-center gap-1.5 ${style.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
      {style.label}
    </span>
  );
}

/**
 * Search matches against the same display labels the user sees (not the
 * raw sort values, which are numbers for the cost columns) - checked once
 * per row against every column's label, independent of which column
 * TanStack happens to invoke this for.
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
    r.statusLabel,
    describeConsent(r.consentStatus, r.actionOutcome).label,
    r.snoozeJustification ?? "",
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
    enableSorting: false,
    enableHiding: false,
  }),
  columnHelper.accessor("org", { header: "Org", meta: { widthPct: 8 } }),
  columnHelper.accessor("project", { header: "Project", meta: { widthPct: 7 } }),
  columnHelper.accessor("name", {
    header: "Cluster",
    meta: { widthPct: 9 },
    cell: (info) => (
      <span className="font-medium text-ink">{info.getValue()}</span>
    ),
  }),
  columnHelper.accessor("createdAtMs", {
    id: "createdAt",
    header: "Created",
    meta: { widthPct: 8 },
    cell: (info) => <FormattedDateTime ms={info.getValue()} />,
  }),
  columnHelper.accessor("ageLabel", {
    id: "age",
    header: "Age",
    meta: { widthPct: 5 },
    sortingFn: (a, b) => a.original.ageDays - b.original.ageDays,
  }),
  columnHelper.accessor("lastActivityMs", {
    id: "lastActivity",
    header: "Last Activity",
    meta: { widthPct: 9 },
    sortingFn: (a, b) => (a.original.lastActivityMs ?? -Infinity) - (b.original.lastActivityMs ?? -Infinity),
    cell: (info) => <FormattedDateTime ms={info.getValue()} />,
  }),
  columnHelper.accessor("owner", {
    header: "Owner",
    meta: { widthPct: 13 },
    cell: (info) => <span className="break-words">{info.getValue()}</span>,
  }),
  columnHelper.accessor("configSummary", {
    id: "config",
    header: "Configuration",
    meta: { widthPct: 16 },
  }),
  columnHelper.accessor("actualCost", {
    id: "actualCost",
    header: "Actual Cost",
    meta: { widthPct: 8 },
    cell: (info) => {
      const amount = info.getValue();
      if (amount === null) {
        return <span className="text-ink-faint">{actualCostDisplayLabel(info.row.original)}</span>;
      }
      return (
        <span>
          {formatUsd(amount)} (as of <FormattedDateTime ms={info.row.original.actualCostAsOfMs} />)
        </span>
      );
    },
  }),
  columnHelper.accessor("statusLabel", {
    id: "status",
    header: "Status",
    meta: { widthPct: 6 },
    cell: (info) => <StatusBadge statusLabel={info.getValue()} />,
  }),
  columnHelper.accessor("ageStatus", {
    id: "ageStatus",
    header: "Age Status",
    meta: { widthPct: 7 },
    filterFn: "equalsString",
    cell: (info) => <AgeStatusBadge status={info.getValue()} />,
  }),
  columnHelper.accessor("consentStatus", {
    id: "consent",
    header: "Consent",
    meta: { widthPct: 9 },
    cell: (info) => (
      <span className="flex flex-wrap items-center gap-1.5">
        <ConsentBadge status={info.getValue()} outcome={info.row.original.actionOutcome} />
        <SendConsentRequestButton clusterId={info.row.original.clusterId} />
      </span>
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
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [sorting, setSorting] = useState<SortingState>([{ id: "org", desc: false }]);
  const [columnOrder, setColumnOrder] = useState<string[]>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
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
  }, [globalFilter, columnFilters]);

  const table = useReactTable({
    data: rows,
    columns,
    state: {
      sorting,
      globalFilter,
      columnFilters,
      columnOrder,
      columnVisibility,
      pagination,
    },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onColumnFiltersChange: setColumnFilters,
    onColumnOrderChange: setColumnOrder,
    onColumnVisibilityChange: setColumnVisibility,
    onPaginationChange: setPagination,
    globalFilterFn: globalFuzzyFilter,
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
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
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

  // Counts per tier among rows passing every filter *except* this column's
  // own - i.e. "how many would show up if this button were selected" -
  // rather than a raw, filter-blind total.
  const ageStatusFacets = table.getColumn("ageStatus")?.getFacetedUniqueValues() ?? new Map<string, number>();
  const currentAgeStatusFilter = table.getColumn("ageStatus")?.getFilterValue() as string | undefined;
  const totalAgeStatusCount = Array.from(ageStatusFacets.values()).reduce((sum, n) => sum + n, 0);

  const pageRows = table.getRowModel().rows;
  const totalRowCount = table.getPrePaginationRowModel().rows.length;
  const pageCount = table.getPageCount();

  if (rows.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-line p-10 text-center text-sm text-ink-muted">
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
          className="w-full max-w-sm rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/30"
        />

        <div
          role="group"
          aria-label="Filter by age status"
          className="flex items-center gap-1 rounded-lg border border-line bg-panel p-1"
        >
          {(["All", ...AGE_STATUS_OPTIONS] as const).map((tier) => {
            const isActive = tier === "All" ? currentAgeStatusFilter === undefined : currentAgeStatusFilter === tier;
            const count = tier === "All" ? totalAgeStatusCount : ageStatusFacets.get(tier) ?? 0;
            return (
              <button
                key={tier}
                type="button"
                aria-pressed={isActive}
                onClick={() => table.getColumn("ageStatus")?.setFilterValue(tier === "All" ? undefined : tier)}
                className={`rounded-md px-2.5 py-1 text-xs font-semibold uppercase tracking-wide transition ${
                  isActive ? "bg-brand text-brand-ink" : "text-ink-muted hover:bg-panel-hover"
                }`}
              >
                {tier} <span className={isActive ? "text-brand-ink/70" : "text-ink-faint"}>{count}</span>
              </button>
            );
          })}
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => setColumnsPanelOpen((o) => !o)}
            className="rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink transition hover:bg-panel-hover"
          >
            Columns
          </button>
          {columnsPanelOpen && (
            <div className="absolute left-0 z-20 mt-2 w-72 rounded-lg border border-line bg-panel p-2 shadow-lg">
              {orderedColumnsForPanel.map((column, idx, arr) => (
                <div
                  key={column.id}
                  className="flex items-center justify-between gap-2 rounded px-2 py-1 text-sm text-ink hover:bg-panel-hover"
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
                      className="rounded px-1.5 py-0.5 text-ink-faint hover:bg-panel-hover disabled:opacity-30"
                    >
                      ←
                    </button>
                    <button
                      type="button"
                      title="Move right"
                      disabled={idx === arr.length - 1}
                      onClick={() => moveColumn(column.id, 1)}
                      className="rounded px-1.5 py-0.5 text-ink-faint hover:bg-panel-hover disabled:opacity-30"
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
        <p className="rounded-xl border border-dashed border-line p-10 text-center text-sm text-ink-muted">
          {globalFilter ? <>No clusters match &ldquo;{globalFilter}&rdquo;.</> : "No clusters match the current filters."}
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
                <Fragment key={row.id}>
                  <tr className="border-b border-line align-top transition last:border-0 hover:bg-panel-hover">
                    {row.getVisibleCells().map((cell) => {
                      if (cell.column.id === "expander") {
                        return (
                          <td key={cell.id} className="px-1 py-1.5 text-center lg:px-2 lg:py-2">
                            <button
                              type="button"
                              onClick={() => toggleDetail(row.original.clusterId)}
                              aria-label="Toggle cluster details"
                              aria-expanded={detailOpenIds.has(row.original.clusterId)}
                              className="inline-flex h-7 w-7 items-center justify-center rounded-full text-ink-faint transition hover:bg-panel-hover hover:text-brand"
                            >
                              <ChevronIcon
                                className={`h-4 w-4 transition-transform duration-200 ${
                                  detailOpenIds.has(row.original.clusterId) ? "rotate-90" : ""
                                }`}
                              />
                            </button>
                          </td>
                        );
                      }

                      if (cell.getIsPlaceholder()) {
                        return (
                          <td key={cell.id} className="px-1.5 py-1.5 text-ink-faint lg:px-3 lg:py-2">
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
                  {detailOpenIds.has(row.original.clusterId) && (
                    <tr className="bg-panel-hover">
                      <td colSpan={row.getVisibleCells().length} className="px-4 py-3">
                        <div className="grid grid-cols-1 gap-4 text-xs sm:grid-cols-3 sm:divide-x sm:divide-line">
                          {DETAIL_GROUPS.map((group) => {
                            const hiddenFieldsForGroup = hiddenColumnIds
                              .filter((columnId) => (DETAIL_GROUP_BY_COLUMN_ID[columnId] ?? "Cluster") === group)
                              .map((columnId) => {
                                const cell = row.getAllCells().find((c) => c.column.id === columnId);
                                if (!cell) return null;
                                const header = cell.column.columnDef.header;
                                return (
                                  <div key={columnId}>
                                    <dt className="text-ink-faint">
                                      {typeof header === "string" ? header : columnId}
                                    </dt>
                                    <dd className="break-words text-ink-muted">
                                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                    </dd>
                                  </div>
                                );
                              });

                            const hasSnooze =
                              row.original.snoozeUntilMs !== null || row.original.snoozeJustification !== null;
                            const isEmpty = group === "Workflow" && !hasSnooze && hiddenFieldsForGroup.length === 0;

                            return (
                              <div key={group} className="sm:first:pl-0 sm:[&:not(:first-child)]:pl-4">
                                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-ink-faint">
                                  {group}
                                </p>
                                <dl className="flex flex-col gap-2">
                                  {group === "Organisation" && (
                                    <>
                                      <div>
                                        <dt className="text-ink-faint">Org ID</dt>
                                        <dd className="break-all text-ink-muted">
                                          {row.original.orgId}
                                        </dd>
                                      </div>
                                      <div>
                                        <dt className="text-ink-faint">Project ID</dt>
                                        <dd className="break-all text-ink-muted">
                                          {row.original.projectId}
                                        </dd>
                                      </div>
                                    </>
                                  )}
                                  {group === "Cluster" && (
                                    <>
                                      <div>
                                        <dt className="text-ink-faint">Cluster ID</dt>
                                        <dd className="break-all text-ink-muted">
                                          {row.original.clusterId}
                                        </dd>
                                      </div>
                                      <div>
                                        <dt className="text-ink-faint">Couchbase Version</dt>
                                        <dd className="text-ink-muted">
                                          {row.original.couchbaseVersion}
                                        </dd>
                                      </div>
                                      <div>
                                        <dt className="text-ink-faint">Storage</dt>
                                        <dd className="text-ink-muted">
                                          {row.original.storageSummary}
                                        </dd>
                                      </div>
                                      <div>
                                        <dt className="text-ink-faint">Last Synced</dt>
                                        <dd className="text-ink-muted">
                                          {formatDateTime(row.original.lastSyncedAtMs)}
                                        </dd>
                                      </div>
                                      <div>
                                        <dt className="text-ink-faint">Actions</dt>
                                        <dd className="flex flex-wrap items-center gap-2">
                                          {!row.original.statusIsOff && (
                                            <ManualTurnOffButton
                                              clusterId={row.original.clusterId}
                                              clusterName={row.original.name}
                                            />
                                          )}
                                          <ManualDeleteButton
                                            clusterId={row.original.clusterId}
                                            clusterName={row.original.name}
                                          />
                                        </dd>
                                      </div>
                                    </>
                                  )}
                                  {group === "Workflow" && hasSnooze && (
                                    <div>
                                      <dt className="text-ink-faint">Snooze</dt>
                                      <dd className="text-ink-muted">
                                        {row.original.snoozeUntilMs !== null && (
                                          <div>
                                            Until <FormattedDateTime ms={row.original.snoozeUntilMs} />
                                          </div>
                                        )}
                                        {row.original.snoozeJustification && (
                                          <div className="break-words italic">
                                            "{row.original.snoozeJustification}"
                                          </div>
                                        )}
                                      </dd>
                                    </div>
                                  )}
                                  {isEmpty && <p className="text-ink-faint">—</p>}
                                  {hiddenFieldsForGroup}
                                </dl>
                              </div>
                            );
                          })}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-3 py-2 text-sm text-ink-muted">
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
                  className="rounded-md border border-line bg-panel px-1.5 py-1 text-sm"
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
                className="rounded-md border border-line px-2 py-1 disabled:opacity-40"
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
                className="rounded-md border border-line px-2 py-1 disabled:opacity-40"
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

function StatusBadge({ statusLabel }: { statusLabel: string }) {
  const isOff = /off/i.test(statusLabel);
  const isActive = statusLabel === "Active" || /healthy|running|ready/i.test(statusLabel);

  const colorClass = isOff
    ? "text-amber-600 dark:text-amber-400"
    : isActive
      ? "text-emerald-600 dark:text-emerald-400"
      : "text-ink-muted";
  const dotClass = isOff ? "bg-amber-500" : isActive ? "bg-emerald-500" : "bg-slate-400";

  return (
    <span className={`inline-flex items-center gap-1.5 ${colorClass}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} />
      {statusLabel}
    </span>
  );
}

const AGE_STATUS_STYLE: Record<AgeStatus, { text: string; dot: string }> = {
  "In Use": { text: "text-emerald-600 dark:text-emerald-400", dot: "bg-emerald-500" },
  Stale: { text: "text-amber-600 dark:text-amber-400", dot: "bg-amber-500" },
  Forgotten: { text: "text-rose-600 dark:text-rose-400", dot: "bg-rose-500" },
};

function AgeStatusBadge({ status }: { status: AgeStatus }) {
  const style = AGE_STATUS_STYLE[status];
  return (
    <span className={`inline-flex items-center gap-1.5 ${style.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
      {status}
    </span>
  );
}
