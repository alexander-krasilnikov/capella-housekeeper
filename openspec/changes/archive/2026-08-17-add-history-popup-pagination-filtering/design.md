## Context

`ClusterHistoryButton.tsx` fetches a cluster's full history via `getClusterHistoryAction` and renders it as a plain HTML table inside a scrollable modal, with no pagination or search. `HistoryTable.tsx` (the cross-cluster Lifecycle Audit Log) already solves the same UI problem using TanStack Table's `getPaginationRowModel` and a `globalFuzzyFilter`, with a page-size select (10/25/50/100, default 25), Prev/Next pager, and a "Showing X-Y of Z" footer. See proposal.md - Why/What Changes for the motivation and scope.

## Goals / Non-Goals

**Goals:**
- Bring the per-cluster popup's pagination and filtering UX to parity with `HistoryTable.tsx`, reusing the same filtering utility and control markup rather than writing a second implementation.
- Keep the change entirely client-side: no changes to the server action, the history query functions, or the SQLite schema.

**Non-Goals:**
- Column sorting (explicitly out of scope per proposal.md).
- Server-side pagination or filtering (query params, LIMIT/OFFSET) — history volume per cluster is bounded by the retention window and sync cadence, and the existing sibling view already establishes client-side as sufficient at this scale.
- Changing what counts as a "lifecycle" entry, or any diffing/labeling logic in `historyFields.ts` — this change touches presentation only.

## Decisions

**Reuse TanStack Table + `globalFuzzyFilter` from `HistoryTable.tsx`, applied to `ClusterHistoryButton`'s existing data shape.** The popup already receives the full `HistoryTimelineEntry[]` for the cluster; wrapping it in a `useReactTable` instance with `getPaginationRowModel` and `getFilteredRowModel` mirrors a pattern already reviewed and shipped in this codebase, rather than introducing a second pagination/filter implementation to maintain. Alternative considered: hand-roll a simpler slice-based pager for the popup (fewer lines, no TanStack column defs) — rejected because it would diverge from the established pattern and duplicate filter-matching logic that already exists.

**Global filter matches the same fields the grid displays** (date, trigger/event label, and changed-field summary), consistent with how `globalFuzzyFilter` is scoped in `HistoryTable.tsx`. No separate per-column filter UI is introduced.

**Filter is applied before pagination**, using TanStack Table's standard row-model pipeline (filter → paginate), so page counts and the "Showing X-Y of Z" footer always reflect the filtered set, not the unfiltered total.

**Pagination and filter state reset each time the popup opens.** The popup already refetches the cluster's history on open (`ClusterHistoryButton.tsx:23-29`); there's no existing session-persistence pattern for popup UI state in this codebase, and a per-cluster popup with fresh state on each open matches user expectation (opening a different cluster's history shouldn't carry over the previous cluster's filter query or page).

## Risks / Trade-offs

- [Popup modal has limited vertical space (`max-h-[80vh]`) compared to the full-page Lifecycle Audit Log] → Pager and filter controls need a compact layout; verify the combined header (search box + page-size select + pager) still leaves reasonable room for the scrollable grid body within the existing modal sizing.
- [Client-side filtering degrades if a single cluster's history grows far beyond the "dozens of entries" scale seen in tests] → Accepted for now per proposal.md scope; if retention/sync settings ever push this much higher, revisit with server-side pagination as a follow-up change.
