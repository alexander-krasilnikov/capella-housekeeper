## 1. Table setup

- [x] 1.1 In `ClusterHistoryButton.tsx`, replace the manual `<table>` markup with a TanStack Table instance (`useReactTable`) over `entries: HistoryTimelineEntry[]`, following the structure already used in `HistoryTable.tsx`.
- [x] 1.2 Define columns for Date, Event (trigger label), and Changes (rendering the existing `entry.changes` list/"First recorded state."/"No change recorded." logic unchanged), preserving current row ordering (most-recent-first, with the "first recorded state" row last).
- [x] 1.3 Wire `getCoreRowModel`, `getFilteredRowModel`, and `getPaginationRowModel`; omit `getSortedRowModel` since sorting is out of scope.

## 2. Filtering

- [x] 2.1 Add a `globalFilter` state and a text input above the grid (matching `HistoryTable.tsx`'s search input styling/placement), wired via `onGlobalFilterChange`.
- [x] 2.2 Implement a `globalFilterFn` for `HistoryTimelineEntry` rows that matches the query against the formatted date, trigger label, and each changed field's label/from/to values — mirroring `globalFuzzyFilter` in `HistoryTable.tsx`.
- [x] 2.3 Set `autoResetPageIndex: false` and explicitly reset `pagination.pageIndex` to 0 whenever the global filter value changes, so a query typed while on a later page returns to page 1.
- [x] 2.4 Render an empty state ("No events match "...") when the filter produces zero rows, distinct from the existing "No recorded history for this cluster yet" empty state for a cluster with no entries at all.

## 3. Pagination

- [x] 3.1 Add `pagination` state (`{ pageIndex: 0, pageSize: 25 }`) and a page-size `<select>` with options 10/25/50/100, matching `HistoryTable.tsx`.
- [x] 3.2 Add Prev/Next buttons (disabled via `table.getCanPreviousPage()`/`getCanNextPage()`) and a "Showing X-Y of Z" footer computed from `pagination` and the pre-pagination filtered row count, matching `HistoryTable.tsx`'s footer.
- [x] 3.3 Confirm the footer/page-size controls fit within the popup's existing `max-h-[80vh]` modal without pushing the scrollable grid body out of view; adjust modal padding/layout if needed.

## 4. Verification

- [x] 4.1 Manually verify in the browser: open the popup for a cluster with more history entries than the default page size, confirm pagination controls work and the footer count is correct.
- [x] 4.2 Manually verify filtering: type a query matching a trigger label, a date fragment, and a changed-field value; confirm each narrows the grid correctly and the empty-filter-result state renders when nothing matches.
- [x] 4.3 Manually verify the two empty states remain distinct: a cluster with zero history entries vs. a cluster with entries but a non-matching filter query.
- [x] 4.4 Manually verify closing and reopening the popup (same or a different cluster) resets both the filter query and the pagination page.
