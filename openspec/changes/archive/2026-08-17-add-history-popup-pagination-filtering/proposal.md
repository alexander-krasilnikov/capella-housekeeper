## Why

The per-cluster history popup (`ClusterHistoryButton`) loads every recorded history entry for a cluster into one unpaginated, unsearchable scrolling list. As entries accumulate over the retention window, the popup becomes hard to scan and there is no way to narrow it down to a specific event or timeframe. The sibling Lifecycle Audit Log view already solves this with client-side pagination and a global search filter (via TanStack Table); the per-cluster popup should adopt the same pattern instead of remaining the odd one out.

## What Changes

- Add client-side pagination to the per-cluster history popup: a page-size selector and Prev/Next pager with a "Showing X-Y of Z" footer, matching the Lifecycle Audit Log's existing control set (page sizes 10/25/50/100, default 25).
- Add a global text filter to the per-cluster history popup that searches across all visible columns/fields of a history entry (date, trigger/event, and changed fields), reusing the same fuzzy-match filtering logic already used by the Lifecycle Audit Log and the cluster table.
- All history entries for the cluster continue to be fetched in one call when the popup opens (no change to `getClusterHistoryAction`/`getClusterHistory`); pagination and filtering are applied entirely in the browser over that already-fetched list.
- Column sorting is explicitly out of scope for this change.

## Capabilities

### Modified Capabilities
- `cluster-history-ui`: the per-cluster history timeline requirement gains pagination and cross-field search filtering behavior; the underlying data and its ordering/diffing rules are unchanged.

## Impact

- `app/components/ClusterHistoryButton.tsx`: replace the plain scrolling table with a TanStack Table instance (or equivalent) providing pagination and a global filter, following the pattern already implemented in `app/components/HistoryTable.tsx`.
- No changes to `app/actions.ts`, `src/lib/historyView.ts`, `src/lib/store.ts`, or the SQLite schema — this is a client-side, presentation-only change.
- No new dependencies expected; TanStack Table is already a project dependency (used by `HistoryTable.tsx`).
