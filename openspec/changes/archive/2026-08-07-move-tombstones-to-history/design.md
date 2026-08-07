## Context

Today, `sync.ts`'s "cluster no longer seen" branch (`src/lib/sync.ts:320-327`) pushes `{ ...existing, deletedAt: now, lastSyncedAt: now }` into `records`, which `upsertClusters` then merges into `clusters.json` as usual - a tombstone, not a removal. Critically, this branch never pushes to `snapshots`, so the exact moment a deletion is noticed is never recorded in history; history only has whatever periodic snapshots existed while the cluster was still alive. `store.ts`'s `purgeExpiredTombstones` already does two independent things every cycle: purge live-store tombstones older than `retentionDays`, and separately trim *every* cluster's history snapshots older than that same window, active or not - the second half is already exactly the "retention governs history" behavior this change wants; only the first half goes away.

`manualActions.ts`'s `manualDelete` tombstones the same way sync does (`fresh.deletedAt = ...; upsertClusters([fresh])`) - it needs the identical treatment for the two deletion paths to stay consistent with each other.

See proposal.md for motivation; see the cluster-sync and cluster-dashboard-ui deltas for the behavior contract.

## Goals / Non-Goals

**Goals:**
- A cluster gone from Capella disappears from the live store (and therefore the dashboard) in the same sync cycle that notices it, with no visible tombstone period.
- The moment of deletion is captured exactly once, as a real history snapshot - recoverable/inspectable later, just not as a table row.
- Sync-detected deletion and manual-delete-button deletion behave identically.
- `retentionDays` keeps exactly one meaning: how long a history snapshot survives, regardless of which cluster it belongs to or whether that cluster is still live.

**Non-Goals:**
- No change to `retentionDays` as a setting, or to how often sync runs.
- No change to the age-status/notification model from the collapse-age-status-tiers change.
- Not building any dashboard UI to browse history directly - history stays a JSON file on disk, same as today; this change only affects what gets written to it and what gets removed from `clusters.json`.

## Decisions

**New `removeClusters(clusterIds)` in `src/lib/store.ts`, alongside `upsertClusters`.**
`upsertClusters` only ever merges/overwrites by ID - it has no way to make an entry disappear. `removeClusters` reads `clusters.json`, filters out the given IDs, and writes back only if anything actually changed (mirroring `purgeExpiredTombstones`'s existing conditional-write style).

*Alternative considered*: give `upsertClusters` an implicit "anything not in this batch for a fully-synced org is gone" contract. Rejected - that's a much larger, riskier change to an already-subtle function (it would have to reason about which orgs/projects were fully synced this cycle, duplicating logic `sync.ts` already owns), for no benefit over a small, explicit, separately-testable removal function.

**`purgeExpiredTombstones` loses its live-store-purging half, keeps its history-trimming half, and is renamed to `purgeExpiredHistory`** since "tombstone" no longer describes anything in the live store. Its remaining job: drop any history snapshot older than `retentionDays`, unconditionally - no more special-casing "unless its cluster was already purged as a tombstone," since there's no such event anymore. This is a net simplification, not just a rename.

**Sync's "cluster no longer seen" branch re-reads fresh before writing the final snapshot**, rather than using the start-of-cycle `existing` copy directly - same principle already applied elsewhere in this file (the `freshExisting`/`adoptConsentFields` dance later in `runSyncCycleUnguarded`, and `reconciliation.ts`'s `applyActionOutcome`): a Slack click or manual action could have changed the record after this cycle's initial read but before this branch runs. The final snapshot should reflect the latest known state, not a stale one, even though the cluster is about to be removed either way.

**`manualDelete` (`src/lib/manualActions.ts`) writes its own final snapshot and calls `removeClusters`, instead of tombstoning.** Same shape as sync's branch: re-read fresh after the Capella call succeeds, stamp `deletedAt`, append one history snapshot, remove from the live store.

**Now-unreachable UI code is deleted, not left in place.** Once `readClusters()` can never return a record with non-null `deletedAt`, several things in `ClusterTable.tsx`/`app/page.tsx` become dead: the `deleted` flag on `ClusterRow`, `StatusBadge`'s "Deleted" branch, the deleted-row opacity styling, the conditional hiding of `ManualTurnOffButton`/`ManualDeleteButton`, and the `"deleted"` search term in the fuzzy-filter haystack. All removed rather than kept as inert defensive code.

**`applyConsentNotifications`'s `if (record.deletedAt !== null) continue;` guard and `manualActions.ts`'s `resolveClusterAndOrg`'s "already deleted" check both become unreachable** for the same reason, and are removed rather than kept as a check against a state that can no longer occur.

**`ClusterRecord.deletedAt` stays on the type**, since it's still meaningful on the copy embedded in a `ClusterSnapshot` - it's what marks a snapshot as the final one for its cluster. Only its *live-store* invariant changes: every record `readClusters()` returns now has `deletedAt: null`, always.

## Risks / Trade-offs

- **A consent decision made via Slack in the same narrow window a cluster is discovered deleted is lost along with the rest of the record**, rather than surviving in a visible (if tombstoned) row. Re-reading fresh before writing the final snapshot (above) minimizes this - the decision is at least captured in history - but once the live record is removed there's nowhere left to act on it. This is arguably correct (there's nothing left to turn off or delete), but it's a real behavior change from today's tombstone-preserves-everything approach.
- **Anyone relying on `clusters.json` ever containing a `deletedAt`-marked row** (there's no such external consumer today, but worth naming) would need to switch to reading `history.json`'s final snapshot per cluster instead.
- **Existing tombstones already in `clusters.json` at upgrade time** need the one-time migration named in the cluster-sync delta - swept up on the very next sync cycle rather than requiring a special startup step.
