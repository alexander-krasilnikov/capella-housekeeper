## Why

Row grouping (by org/project/owner, with collapsed rows showing member counts and summed cost) adds meaningful state and rendering complexity to the cluster table. Per product decision, it's being dropped to keep the table simpler.

## What Changes

- **BREAKING**: Remove row grouping entirely - the "Group rows by" control, group-row collapsing/expanding, and per-group cost aggregation are all removed. The table always shows a flat list of cluster rows.
- Row detail expansion (expanding an individual cluster row to see extra fields) is untouched - it's a separate feature from group-row expansion and doesn't depend on it.

## Capabilities

### Modified Capabilities
- `cluster-dashboard-ui`: The "Row grouping with aggregation" requirement is removed.

## Impact

- **UI**: `app/components/ClusterTable.tsx` - removes the grouping state/control, `getGroupedRowModel`/`getExpandedRowModel` (the latter was used only for group-row expansion, not the separate per-row detail panel), the `enableGrouping`/`aggregationFn`/`aggregatedCell` column config, and the grouped/aggregated-cell rendering branches.
- **No changes** to any other capability. Grouping state was never persisted (only column visibility/order, sort, and page size are), so there's nothing to migrate for returning users.
