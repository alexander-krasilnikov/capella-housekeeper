## 1. Remove grouping from the table

- [x] 1.1 Remove the `grouping`/`setGrouping` state, `onGroupingChange`, and `getGroupedRowModel` from the table config.
- [x] 1.2 Remove the `expanded`/`setExpanded` state, `onExpandedChange`, and `getExpandedRowModel` - these existed only for group-row expand/collapse, not the separate per-cluster detail panel (`detailOpenIds`), which stays.
- [x] 1.3 Remove the `paginateExpandedRows` table option - only meaningful with row grouping/expansion in the row model.
- [x] 1.4 Remove the "Group rows by" `<select>` control from the toolbar.
- [x] 1.5 Remove `enableGrouping` from the org/project/owner column defs, and `aggregationFn`/`aggregatedCell` from the actual-cost column def.
- [x] 1.6 Remove the `cell.getIsGrouped()` and `cell.getIsAggregated()` rendering branches in the row/cell renderer, and the now-always-false `!row.getIsGrouped()` guards around the detail-toggle button and detail panel.

## 2. Verification

- [x] 2.1 Verify the table renders a flat list with no grouping control present.
- [x] 2.2 Verify the per-cluster detail-expand panel (unrelated feature) still works.
- [x] 2.3 Verify typecheck passes with no leftover references to grouping/expansion APIs.
