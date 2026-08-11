## Why

`history.json` grows by one snapshot per cluster on every sync cycle regardless of whether anything changed - in the running instance, one long-lived test cluster has accumulated 238 entries across five days, of which 229 are byte-for-byte duplicates of the previous entry except for the sync timestamp. Sync is also the *only* code path that ever writes history: a Slack consent decision, a manual turn-off/delete, or a reconciliation-performed action all update `clusters.json` directly and leave no timestamped trace until the next sync cycle happens to run, at which point it's stamped with that cycle's time rather than the moment the action occurred. On top of that, none of this data is ever read back - there is no UI for it at all, which since a recent change (removing the live tombstone for deleted clusters) means a deleted cluster's final state is now completely unreachable in the dashboard.

## What Changes

- History entries are only appended when a cluster's meaningful fields actually differ from its last recorded entry for that cluster - not unconditionally every cycle. Compared fields: `config`, `actualCost.amountUsd`, `deletedAt`, `ownerDerived`, and the consent/lifecycle field group (`consentStatus`, `actionOutcome`, `snoozeUntil`, `snoozeJustification`, `remindersSent`, `consentCycleStartedAt`). Excluded: `lastSyncedAt`, `lastObservedFingerprint`, and `lastActivityAt`/`lastActivitySource` (these already change on a schedule independent of anything a person would call "a change").
- Every place that mutates a cluster record - the sync cycle, manual turn-off/delete, a Slack consent decision, reminder/expiry handling, and a reconciliation-performed/failed/skipped outcome - writes its own change-gated history entry at the moment it happens, tagged with what triggered it, instead of relying on the next sync cycle to notice indirectly.
- **New**: a per-cluster history timeline, reachable from the dashboard's existing row-detail panel, listing this cluster's recorded history entries in chronological order as a sequence of what changed between each one and the last.
- **New**: a cross-cluster lifecycle audit log view, showing only history entries triggered by a consent/lifecycle event (not routine config/cost drift), narrated in plain language ("Notified owner - Stale", "Owner approved turn-off via Slack", "Turned off") in reverse-chronological order across all clusters, including ones since deleted.

## Capabilities

### New Capabilities
- `cluster-history-ui`: The two reading surfaces built on top of the history store - a per-cluster timeline in the row-detail panel, and a cross-cluster lifecycle audit log - including how deleted clusters remain visible there.

### Modified Capabilities
- `cluster-sync`: Changes the "existing cluster updated" persistence requirement from an unconditional per-cycle append to a change-gated one, and adds the requirement that non-sync mutation sources (manual actions, Slack decisions, reconciliation) each write their own history entry at the moment they occur.

## Impact

- `src/lib/store.ts`: history read/append gains a change-comparison helper; `ClusterSnapshot` write path takes a trigger reason.
- `src/lib/sync.ts`: snapshot push becomes conditional on the comparison helper.
- `src/lib/manualActions.ts`, `src/lib/slackBot.ts`, `src/lib/notifications.ts`, `src/lib/reconciliation.ts`: each now calls the same change-gated append at its own mutation point.
- `src/types.ts`: `ClusterSnapshot` gains a trigger/reason field.
- `app/components/ClusterTable.tsx` (or a new component): per-cluster timeline rendering in the row-detail panel.
- New route/component for the cross-cluster audit log view.
- `openspec/specs/cluster-sync/spec.md` (modified), `openspec/specs/cluster-history-ui/spec.md` (new).
