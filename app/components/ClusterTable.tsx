"use client";

import { Fragment, useEffect, useRef, useState } from "react";
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
import ManualTurnOnButton from "./ManualTurnOnButton";
import ManualDeleteButton from "./ManualDeleteButton";
import ClusterHistoryButton from "./ClusterHistoryButton";
import RefreshButton from "./RefreshButton";
import FormattedDateTime, { formatDateTime } from "./FormattedDateTime";
import type { AgeStatus, ConsentActionOutcome, ConsentStatus } from "@/types";
import type { ClusterStatusBucket } from "@/lib/capellaClient";

declare module "@tanstack/react-table" {
  interface ColumnMeta<TData, TValue> {
    widthPct: number;
  }
  interface TableMeta<TData> {
    /** Most recent action result per cluster, keyed by clusterId - lifted out of every Action-column button (Ask/Turn off/Turn on/Delete) so a result or error message always renders in the Action cell's own footer, below the row of buttons, rather than inline in place of whichever button produced it. */
    actionResults: Record<string, { ok: boolean; message: string } | null | undefined>;
    setActionResult: (clusterId: string, result: { ok: boolean; message: string } | null) => void;
    /** Developer-options toggle (see dashboard-settings) - whether the Action column's Turn on control is offered at all. */
    developerTurnOnEnabled: boolean;
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
  actualCost: number | null;
  actualCostAsOfMs: number | null;
  actualCostUnavailableReason: "credits-based" | "no-access" | "error" | null;
  statusLabel: string;
  statusBucket: ClusterStatusBucket;
  statusIsOff: boolean;
  ownerEligibleForAsk: boolean;
  ageStatus: AgeStatus;
  consentStatus: ConsentStatus;
  actionOutcome: ConsentActionOutcome;
  snoozeUntilMs: number | null;
  snoozeJustification: string | null;
  /** When `consentStatus` last changed - null when it never has (a cluster synced before this field existed, or one that's never left "none"). Display-only; see types.ts's ClusterRecord.consentStatusChangedAt. */
  consentStatusChangedAtMs: number | null;
  /** Persisted system-written explanation for the current consentStatus/actionOutcome, if one was recorded - see types.ts's ClusterRecord.workflowNote. */
  workflowNote: string | null;
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
  statusSince: "Workflow",
  snoozeUntil: "Workflow",
  snoozeJustification: "Workflow",
  action: "Workflow",
  workflowNote: "Workflow",
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

/** Describes only the consent decision itself (pending/approved/snoozed/expired/none) - the outcome of acting on it lives in describeActionOutcome below, rendered in the Action column instead of folded in here. */
function describeConsent(status: ConsentStatus): { label: string; text: string; dot: string } {
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
  return { label: `Approved: ${actionLabel}`, text: "text-blue-600 dark:text-blue-400", dot: "bg-blue-500" };
}

function ConsentBadge({ status }: { status: ConsentStatus }) {
  const style = describeConsent(status);
  if (status === "none") return <span className={style.text}>{style.label}</span>;
  return (
    <span className={`inline-flex items-center gap-1.5 ${style.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
      {style.label}
    </span>
  );
}

/**
 * Describes the outcome (if any) of the reconciliation loop acting on an
 * approved consent decision - a persistent signal, independent of the
 * Consent badge above, and independent of a manual button's own ephemeral
 * per-click result message rendered alongside it in the Action column. Null
 * when there's nothing to report yet (`actionOutcome` is "none").
 */
function describeActionOutcome(
  status: ConsentStatus,
  outcome: ConsentActionOutcome,
): { label: string; text: string; dot: string } | null {
  if (outcome === "none") return null;
  const actionLabel = status === "approved-delete" ? "Delete" : "Turn off";
  if (outcome === "performed") {
    return {
      label: status === "approved-delete" ? "Deleted" : "Turned off",
      text: "text-emerald-600 dark:text-emerald-400",
      dot: "bg-emerald-500",
    };
  }
  if (outcome === "skipped") {
    return { label: `${actionLabel} skipped`, text: "text-ink-muted", dot: "bg-slate-400" };
  }
  return { label: `${actionLabel} failed`, text: "text-rose-600 dark:text-rose-400", dot: "bg-rose-500" };
}

function ActionOutcomeBadge({ status, outcome }: { status: ConsentStatus; outcome: ConsentActionOutcome }) {
  const style = describeActionOutcome(status, outcome);
  if (!style) return null;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs ${style.text}`}>
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
    describeConsent(r.consentStatus).label,
    describeActionOutcome(r.consentStatus, r.actionOutcome)?.label ?? "",
    r.snoozeJustification ?? "",
    r.workflowNote ?? "",
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
    cell: (info) => <StatusBadge statusLabel={info.getValue()} statusBucket={info.row.original.statusBucket} />,
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
    cell: (info) => <ConsentBadge status={info.getValue()} />,
  }),
  columnHelper.accessor("consentStatusChangedAtMs", {
    id: "statusSince",
    header: "Status Since",
    meta: { widthPct: 8 },
    sortingFn: (a, b) => (a.original.consentStatusChangedAtMs ?? -Infinity) - (b.original.consentStatusChangedAtMs ?? -Infinity),
    cell: (info) => {
      const ms = info.getValue();
      const hasActiveCycle = info.row.original.consentStatus !== "none";
      if (ms === null || !hasActiveCycle) return <span className="text-ink-faint">—</span>;
      return <FormattedDateTime ms={ms} />;
    },
  }),
  columnHelper.accessor("snoozeUntilMs", {
    id: "snoozeUntil",
    header: "Snooze Until",
    meta: { widthPct: 8 },
    sortingFn: (a, b) => (a.original.snoozeUntilMs ?? -Infinity) - (b.original.snoozeUntilMs ?? -Infinity),
    cell: (info) => {
      const ms = info.getValue();
      if (ms === null) return <span className="text-ink-faint">—</span>;
      return <FormattedDateTime ms={ms} />;
    },
  }),
  columnHelper.accessor("snoozeJustification", {
    id: "snoozeJustification",
    header: "Snooze Reason",
    meta: { widthPct: 10 },
    cell: (info) => {
      const reason = info.getValue();
      if (!reason) return <span className="text-ink-faint">—</span>;
      return <span className="break-words italic text-ink-muted">"{reason}"</span>;
    },
  }),
  columnHelper.display({
    id: "action",
    header: "Action",
    meta: { widthPct: 15 },
    enableSorting: false,
    cell: (info) => {
      const clusterId = info.row.original.clusterId;
      const actionResult = info.table.options.meta?.actionResults[clusterId];
      const onResult = (result: { ok: boolean; message: string } | null) =>
        info.table.options.meta?.setActionResult(clusterId, result);
      return (
        <span className="flex flex-col gap-1">
          <span className="flex flex-wrap items-center gap-1.5">
            <SendConsentRequestButton
              clusterId={clusterId}
              disabled={!info.row.original.ownerEligibleForAsk}
              onResult={onResult}
            />
            <ManualTurnOffButton
              clusterId={clusterId}
              clusterName={info.row.original.name}
              disabled={info.row.original.statusIsOff}
              onResult={onResult}
            />
            {info.table.options.meta?.developerTurnOnEnabled && (
              <ManualTurnOnButton
                clusterId={clusterId}
                clusterName={info.row.original.name}
                disabled={!info.row.original.statusIsOff}
                onResult={onResult}
              />
            )}
            <ManualDeleteButton clusterId={clusterId} clusterName={info.row.original.name} onResult={onResult} />
            <ClusterHistoryButton clusterId={clusterId} clusterName={info.row.original.name} />
          </span>
          <ActionOutcomeBadge status={info.row.original.consentStatus} outcome={info.row.original.actionOutcome} />
          {actionResult && (
            <span
              className={`break-words text-xs ${actionResult.ok ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}
            >
              {actionResult.message}
            </span>
          )}
        </span>
      );
    },
  }),
  columnHelper.accessor("workflowNote", {
    id: "workflowNote",
    header: "Workflow Note",
    meta: { widthPct: 12 },
    cell: (info) => {
      const note = info.getValue();
      if (!note) return <span className="text-ink-faint">—</span>;
      return <span className="break-words text-ink-muted">{note}</span>;
    },
  }),
];

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

/**
 * Columns shown before an operator customizes anything - a lean, at-a-glance
 * set (identity, activity, status, and the Action column) with everything
 * else (org/project scoping, raw dates, configuration detail, cost)
 * available via the Columns panel or a row's detail panel rather than
 * cluttering the default view. Action is included by default (unlike the
 * other columns it groups with logically) because it now carries a
 * persistent action-outcome badge, not just an ephemeral per-click message -
 * a failed automatic turn-off/delete shouldn't be invisible to an operator
 * who hasn't customized columns.
 */
const DEFAULT_COLUMN_VISIBILITY: VisibilityState = {
  org: false,
  project: false,
  createdAt: false,
  age: false,
  config: false,
  actualCost: false,
  statusSince: false,
  snoozeUntil: false,
  snoozeJustification: false,
  workflowNote: false,
};

/** Left-to-right order matching the default visible set above; hidden columns trail in their original logical grouping. */
const DEFAULT_COLUMN_ORDER = [
  "expander",
  "name",
  "owner",
  "lastActivity",
  "status",
  "ageStatus",
  "consent",
  "org",
  "project",
  "createdAt",
  "age",
  "config",
  "actualCost",
  "action",
  "statusSince",
  "snoozeUntil",
  "snoozeJustification",
  "workflowNote",
];

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

export default function ClusterTable({
  rows,
  developerTurnOnEnabled = false,
}: {
  rows: ClusterRow[];
  developerTurnOnEnabled?: boolean;
}) {
  const [globalFilter, setGlobalFilter] = useState("");
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [sorting, setSorting] = useState<SortingState>([{ id: "org", desc: false }]);
  const [columnOrder, setColumnOrder] = useState<string[]>(DEFAULT_COLUMN_ORDER);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(DEFAULT_COLUMN_VISIBILITY);
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 25 });
  const [detailOpenIds, setDetailOpenIds] = useState<Set<string>>(new Set());
  const [columnsPanelOpen, setColumnsPanelOpen] = useState(false);
  const columnsPanelRef = useRef<HTMLDivElement>(null);
  const [configLoaded, setConfigLoaded] = useState(false);
  const [actionResults, setActionResults] = useState<Record<string, { ok: boolean; message: string } | null>>({});

  // Closes the Columns panel on an outside click - only listens while it's
  // actually open, so this adds no overhead to every other render.
  useEffect(() => {
    if (!columnsPanelOpen) return;
    function handleClickOutside(event: MouseEvent) {
      if (columnsPanelRef.current && !columnsPanelRef.current.contains(event.target as Node)) {
        setColumnsPanelOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [columnsPanelOpen]);

  // Restore persisted column visibility/order/sort/page-size once on mount.
  // Reading localStorage during render would break server/client hydration,
  // so this only happens after mount, then the write-back effect below is
  // gated on configLoaded to avoid clobbering the saved config with defaults
  // before it's had a chance to load.
  useEffect(() => {
    const persisted = loadPersistedConfig();
    if (persisted.sorting) setSorting(persisted.sorting);
    if (persisted.columnOrder) setColumnOrder(persisted.columnOrder);
    // Merged under DEFAULT_COLUMN_VISIBILITY, not used verbatim - a column
    // added after an operator's config was already saved is absent from
    // their persisted blob, and TanStack treats an absent key as visible.
    // Without this merge, every column added later than someone's last visit
    // would default to shown for them, regardless of this app's own default
    // for it (e.g. the new workflow columns, meant to start hidden for
    // everyone). Persisted keys still win over the default when present -
    // this only fills in what the operator never explicitly decided.
    if (persisted.columnVisibility) {
      setColumnVisibility({ ...DEFAULT_COLUMN_VISIBILITY, ...persisted.columnVisibility });
    }
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
    meta: {
      actionResults,
      setActionResult: (clusterId, result) => setActionResults((prev) => ({ ...prev, [clusterId]: result })),
      developerTurnOnEnabled,
    },
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
      // Same missing-column fallback as orderedColumnsForPanel below - without
      // it, moving a column absent from a stale persisted order (e.g. one
      // added to the app after this operator's last visit) would silently
      // no-op, since `order.indexOf(columnId)` returns -1 for it.
      const allIds = table.getAllLeafColumns().map((c) => c.id);
      const order = old.length > 0 ? [...old, ...allIds.filter((id) => !old.includes(id))] : allIds;
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

  // A column added to the app after an operator already has a persisted
  // columnOrder in localStorage (see STORAGE_KEY) is absent from that saved
  // array - without this fallback, such a column would render in the grid
  // (TanStack itself appends any column missing from state.columnOrder) but
  // never appear in this panel at all, since the panel is built strictly
  // from the array below rather than every known column. Appending anything
  // missing keeps a stale persisted order still complete, without forcing
  // every operator's saved column customization to reset.
  const allLeafColumnIds = table.getAllLeafColumns().map((c) => c.id);
  const knownColumnIds = new Set(columnOrder);
  const currentColumnOrder =
    columnOrder.length > 0
      ? [...columnOrder, ...allLeafColumnIds.filter((id) => !knownColumnIds.has(id))]
      : allLeafColumnIds;
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
          className="w-full max-w-sm rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink shadow-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/30"
        />

        <div
          role="group"
          aria-label="Filter by age status"
          className="flex items-center gap-1 rounded-lg border border-line bg-panel p-1 shadow-sm"
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

        <div className="relative" ref={columnsPanelRef}>
          <button
            type="button"
            onClick={() => setColumnsPanelOpen((o) => !o)}
            className="rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink shadow-sm transition hover:bg-panel-hover"
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

        <RefreshButton />
      </div>

      {pageRows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line p-10 text-center text-sm text-ink-muted">
          {globalFilter ? <>No clusters match &ldquo;{globalFilter}&rdquo;.</> : "No clusters match the current filters."}
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-line bg-panel shadow-sm">
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
                              className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-line text-ink-faint transition hover:border-brand hover:bg-panel-hover hover:text-brand"
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

                            const isEmpty = group === "Workflow" && hiddenFieldsForGroup.length === 0;

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
                                        <dt className="text-ink-faint">Last Synced</dt>
                                        <dd className="text-ink-muted">
                                          {formatDateTime(row.original.lastSyncedAtMs)}
                                        </dd>
                                      </div>
                                    </>
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

/** Color (and, for "transitioning", animation) per operational-status bucket - keyed on Capella's own currentState value via classifyClusterStatus, not the display label, so e.g. "Turning Off" and "Turned Off" never collide on one color. */
const STATUS_BUCKET_STYLE: Record<ClusterStatusBucket, { text: string; dot: string; animate?: boolean }> = {
  active: { text: "text-emerald-600 dark:text-emerald-400", dot: "bg-emerald-500" },
  transitioning: { text: "text-blue-600 dark:text-blue-400", dot: "bg-blue-500", animate: true },
  off: { text: "text-amber-600 dark:text-amber-400", dot: "bg-amber-500" },
  unknown: { text: "text-ink-muted", dot: "bg-slate-400" },
};

function StatusBadge({ statusLabel, statusBucket }: { statusLabel: string; statusBucket: ClusterStatusBucket }) {
  const style = STATUS_BUCKET_STYLE[statusBucket];

  return (
    <span className={`inline-flex items-center gap-1.5 ${style.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${style.dot} ${style.animate ? "animate-pulse" : ""}`} />
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
