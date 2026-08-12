## Why

Direct user feedback on the cluster table's row-detail panel and Action column: the standalone "History" field duplicated a button that belongs alongside the other per-cluster controls; the storage field was never needed and cost an unused API round-trip's worth of parsing; the row-expander affordance wasn't visible enough at rest; the Ask result message was easy to miss tucked under the Consent badge instead of near the button that produced it; and the table's default (all-columns-visible) view was noisier than the lean set an operator actually scans day to day.

## What Changes

- Remove the standalone "History" field from the row-detail panel's "Cluster" group; the `ClusterHistoryButton` moves into the "Action" column alongside Ask/Turn off/Delete (and, when Action is hidden, into the "Workflow" detail group with them - already the existing generic hidden-column behavior).
- The history modal renders as a data grid (Date / Event / Changes columns) instead of a bordered list, and now lists entries most-recent-first (previously oldest-first) - diffing itself is unchanged (still computed in chronological order against each entry's true predecessor), only the display order is reversed.
- Drop the cluster "storage" field entirely: the `NodeSpec.storage` type, `CapellaClusterConfig`'s `disk` field, the sync-time mapping from the API response into it, and the row-detail panel's "Storage" field are all removed. Capella's cluster-list endpoint returns disk info as part of the full resource regardless (there's no server-side field-selection to opt out of), so "not asking for it" means no longer parsing or storing it, not a smaller request.
- The row-expander chevron button gets a permanent `border` so it reads as a circular affordance at rest, not only on hover.
- The Ask button's result/error message moves from rendering under the Consent badge to the Action cell's own footer, below its row of buttons - next to the button that produced it instead of a column over.
- Set the table's default column visibility (and matching column order) to a lean set - Cluster, Owner, Last Activity, Status, Age Status, Consent - hiding Org, Project, Created, Age, Configuration, Actual Cost, and Action by default. A first-time or localStorage-cleared visitor now sees this set; a returning visitor's saved preferences are unaffected.

## Capabilities

### Modified Capabilities
- `cluster-dashboard-ui`: the row-detail panel's minimum content list drops "storage configuration"; the Action column now includes the History control alongside Ask/Turn off/Delete; adds a new requirement for the table's default column visibility.
- `cluster-history-ui`: the per-cluster history timeline requirement changes from chronological (oldest-first) to most-recent-first display order.

## Impact

- `app/components/ClusterTable.tsx`: Action/Consent cell rewrite, detail-panel Cluster-group edit, expander button styling, `ClusterRow` interface, `DEFAULT_COLUMN_VISIBILITY`/`DEFAULT_COLUMN_ORDER` constants.
- `app/components/ClusterHistoryButton.tsx`: modal body becomes a `<table>`.
- `src/lib/historyView.ts` + `src/lib/historyView.test.ts`: `getClusterHistory` return-order reversal.
- `src/types.ts`, `src/lib/capellaClient.ts`, `src/lib/sync.ts`, `app/page.tsx`: storage field removed end to end.
