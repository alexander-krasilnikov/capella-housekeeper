## 1. Store primitives

- [x] 1.1 Add `removeClusters(clusterIds: string[])` to `src/lib/store.ts`: reads `clusters.json`, filters out the given IDs, writes back only if anything changed - mirroring `purgeExpiredTombstones`'s conditional-write style. No-ops on an empty array.
- [x] 1.2 Rewrite `purgeExpiredTombstones` as `purgeExpiredHistory(now, retentionDays)`: drop the live-store-filtering half entirely; keep only the unconditional "trim any history snapshot older than `retentionDays`" half (no more special-casing snapshots belonging to a since-purged tombstone - there is no such event anymore). Update its return shape accordingly (no more `purgedClusterIds`).
- [x] 1.3 Update the one caller of `purgeExpiredTombstones` (`sync.ts`) and any `SyncResult` field derived from `purgedClusterIds` to match the renamed function and its new return shape. (Also updated `scheduler.ts`'s log line and `app/actions.ts`'s `refreshAction` message, both of which read `result.purgedClusterIds` - not called out explicitly in this task, but the same rename ripples there.)

## 2. Sync: final snapshot instead of live tombstone

- [x] 2.1 In `runSyncCycleUnguarded` (`src/lib/sync.ts`), change the "cluster no longer seen" branch to only collect the list of `removedClusterIds` (same detection: `seenOrgIds.has(existing.orgId)`, `!seenClusterIds.has(existing.clusterId)`) - stop pushing a tombstoned record into `records`.
- [x] 2.2 After the existing `freshExisting` re-read (already done later in the function for consent-field reconciliation), build one final snapshot per ID in `removedClusterIds` from the freshest available copy (`freshExisting.get(id)`, falling back to the original `existingClusters` entry), stamped with `deletedAt` (reusing an already-set value from a legacy tombstone, or `now` otherwise) and `lastSyncedAt: now`, and push each into `snapshots`.
- [x] 2.3 Call `removeClusters(removedClusterIds)` alongside the existing `upsertClusters(records)`/`appendHistory(snapshots)` calls, then call the renamed `purgeExpiredHistory` in place of `purgeExpiredTombstones`.
- [x] 2.4 One-time migration sweep: dropped the `if (existing.deletedAt) continue;` line from the detection loop entirely, so a legacy tombstone (org still synced, ID not seen) is naturally caught by the same "gone" detection as a fresh deletion - no separate branch needed. Did not add a check for an existing history entry at that `deletedAt` time (as the task description suggested) - the tombstoning branch never wrote a snapshot before this change existed, so there is nothing to duplicate; this only ever fires once per legacy tombstone since it's removed from `clusters.json` immediately after.

## 3. Manual delete: same treatment

- [x] 3.1 In `manualDelete` (`src/lib/manualActions.ts`): after `deleteCluster` succeeds and the fresh re-read, instead of `fresh.deletedAt = ...; upsertClusters([fresh])`, append one history snapshot (`{ clusterId, takenAt: now, record: { ...fresh, deletedAt: now } }`) and call `removeClusters([clusterId])`.

## 4. Remove now-unreachable code

- [x] 4.1 In `app/page.tsx`: remove the `deleted` field from `ClusterRow` and its computation (`c.deletedAt !== null`) - `readClusters()` can no longer return a record with non-null `deletedAt`.
- [x] 4.2 In `app/components/ClusterTable.tsx`: remove `StatusBadge`'s "Deleted" branch and the `deleted` prop it took; remove the deleted-row opacity styling on the `<tr>`; remove the `!row.original.deleted` conditions gating `ManualTurnOffButton`/`ManualDeleteButton`/`SendConsentRequestButton`; remove `"deleted"` from the fuzzy-filter search haystack.
- [x] 4.3 In `src/lib/notifications.ts`: remove `applyConsentNotifications`'s now-unreachable `if (record.deletedAt !== null) continue;` guard.
- [x] 4.4 In `src/lib/manualActions.ts`: remove `resolveClusterAndOrg`'s now-unreachable "already deleted" check.

## 5. Verification

- [x] 5.1 Run `npm run typecheck` and `npm run build`.
- [x] 5.2 Verify (via an isolated reimplementation against real scratch-directory files, not the live app/real Capella credentials - same caution as prior changes) that `removeClusters` and `purgeExpiredHistory` behave correctly: removal drops only the targeted IDs and no-ops when nothing matches; history trimming drops snapshots older than the cutoff regardless of which cluster they belong to. 5/5 checks pass.
- [ ] 5.3 Manually verify end-to-end once comfortable testing against a disposable cluster: deleting a cluster (via Capella directly, or the dashboard's manual delete button) makes it disappear from the table on the next sync/action, with exactly one new entry in `history.json` stamped with a `deletedAt`.
- [ ] 5.4 Manually verify the upgrade path: seed `clusters.json` with a legacy tombstoned record (non-null `deletedAt`), run a sync cycle, confirm it's removed and a final history snapshot exists for it.
- [x] 5.5 Run `openspec validate move-tombstones-to-history --strict` and fix any reported issues.
