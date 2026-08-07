## Why

Today, a cluster no longer returned by the Capella API is tombstoned in place - kept in `clusters.json`, marked deleted, and shown in the dashboard (greyed out) for the whole retention period. This has a real side effect: the dashboard's age-status computation runs unconditionally on every stored record regardless of deletion, so a deleted cluster can display a "healthy" age status (e.g. "In Use") frozen from its last live sync, alongside a "Deleted" status badge - a visibly contradictory row. It also means the exact moment a cluster is found deleted is never captured as its own history entry; history only has whatever periodic snapshots existed while the cluster was still alive.

## What Changes

- **BREAKING**: When sync finds a cluster no longer returned by Capella, it SHALL write one final snapshot to history (stamped with the deletion time) and remove the cluster from the live store immediately, rather than tombstoning it in place. Deleted clusters no longer appear in the dashboard at all, at any point.
- The manual "Delete" action (`manualActions.ts`) is updated to do the same thing after a successful Capella delete call: final history snapshot, then removal from the live store - so a manually-deleted cluster and a sync-detected deletion behave identically, rather than diverging (manual delete would otherwise still tombstone in place while sync-detected deletions vanish immediately).
- Retention (`retentionDays`) now governs only how long a snapshot stays in history - it no longer governs how long a deleted cluster stays visible in the dashboard, because it isn't visible at all once gone. The existing per-snapshot age trim in `purgeExpiredTombstones` already does this uniformly for every cluster's history, active or not; only the "purge the live-store tombstone" half of that function's job goes away.
- Dead UI code this makes unreachable is removed rather than left in place: the "Deleted" status badge, the deleted-row opacity styling, hiding the manual turn-off/delete buttons on a deleted row, and the "deleted" search term all become impossible once a deleted cluster can never appear in a rendered row.
- `ClusterRecord.deletedAt` stays on the type (still meaningful on the copy embedded in a `ClusterSnapshot` - it's what marks a snapshot as the final one), but is no longer expected to appear non-null on anything returned by `readClusters()`.

## Capabilities

### Modified Capabilities
- `cluster-sync`: "Deleted cluster tombstoning" replaced with immediate removal plus a final history snapshot; "History and tombstone retention" reframed as plain history-age retention, independent of any live-store tombstone.
- `cluster-dashboard-ui`: "Deleted clusters remain visible during retention" removed - a deleted cluster is absent from the table entirely, not shown-and-marked.

## Impact

- `src/lib/store.ts`: new removal primitive (deleted clusters are no longer merely absent from an upsert batch - they need to be actively removed from what's already persisted); `purgeExpiredTombstones` loses its live-store-tombstone-purging half.
- `src/lib/sync.ts`: the "cluster no longer seen" branch pushes a final history snapshot and removes the record instead of tombstoning it into `records`.
- `src/lib/manualActions.ts`: `manualDelete` writes a final history snapshot and removes the record instead of tombstoning it.
- `app/components/ClusterTable.tsx`, `app/page.tsx`: removal of now-unreachable deleted-row rendering (status badge, opacity, button-hiding, search term).
- No change to `retentionDays` itself as a setting, or to anything about the age-status/notification model from the collapse-age-status-tiers change - this is scoped purely to how deletion is represented and displayed.
