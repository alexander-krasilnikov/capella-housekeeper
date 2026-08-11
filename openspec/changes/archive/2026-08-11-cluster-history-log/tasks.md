## 1. Data model and shared comparator

- [x] 1.1 Add `HistoryTrigger` type and `trigger` field to `ClusterSnapshot` in `src/types.ts`
- [x] 1.2 In `src/lib/store.ts`, default a missing `trigger` to `"sync"` when reading history (mirroring `withConsentDefaults`)
- [x] 1.3 In `src/lib/store.ts`, add a comparator over the fixed field set (`config`, `actualCost.amountUsd`, `deletedAt`, `ownerDerived`, `consentStatus`, `actionOutcome`, `snoozeUntil`, `snoozeJustification`, `remindersSent`, `consentCycleStartedAt`), deep-comparing `config`/`actualCost`
- [x] 1.4 Add a gated-append helper (`appendHistoryIfChanged` or similar) that takes a prior record, a next record, and a trigger, and appends only when the comparator reports a difference

## 2. Wire the gated append into every mutation site

- [x] 2.1 `src/lib/sync.ts`: filter the batched `snapshots` array through the comparator before the final `appendHistory` call, using `freshExisting` (not the stale `existingById`) as the comparison baseline - see design.md's note on the mid-cycle race
- [x] 2.2 `src/lib/manualActions.ts`: call the gated-append helper at `manualTurnOff` and `manualDelete`, tagged `"manual-turn-off"` / `"manual-delete"`
- [x] 2.3 `src/lib/slackBot.ts`: call the gated-append helper at each consent-decision write (approve/snooze), tagged `"slack-decision"`
- [x] 2.4 `src/lib/notifications.ts`: call the gated-append helper at the out-of-band write (`sendManualConsentRequest`), tagged `"manual-consent-request"` - the automatic reminder/expiry logic in `applyConsentNotifications` never calls `upsertClusters` itself (only `sync.ts` does, once, at cycle end), so its changes are already covered by sync's own `"sync"`-tagged gate; the trigger name was corrected from `"reminder-expiry"` to reflect the code path that actually needed its own write
- [x] 2.5 `src/lib/reconciliation.ts`: call the gated-append helper at `applyActionOutcome`, tagged `"reconciliation"`

## 3. Verify duplication is actually gone

- [x] 3.1 Add/run a test exercising an unchanged cluster across multiple sync cycles, asserting no new history entry is appended
- [x] 3.2 Add/run a test exercising a consent decision landing mid-sync-cycle (the race in design.md), asserting exactly one history entry is written, not two
- [x] 3.3 Add/run a test asserting a cluster's deletion still produces exactly one final history entry (the existing `cluster-sync` deletion requirement), now via the general gate rather than a special case

  Test infrastructure did not exist in this repo before this change - added Vitest (`vitest.config.mts`, `test` script in `package.json`) plus `src/lib/store.test.ts` (13 tests, `node:fs` mocked in-memory so nothing touches the real `data/history.json`).

## 4. Per-cluster history timeline (UI)

- [x] 4.1 Add a server action/query that returns a cluster's history entries (by `clusterId`) with a field-level diff computed against each entry's predecessor
- [x] 4.2 Add a "View history" action in the row-detail panel's Cluster group, alongside the existing manual turn-off/delete buttons
- [x] 4.3 Build the history modal/panel rendering entries oldest-to-newest with their diffs
- [x] 4.4 Handle the single-entry case (no diff to show) per the `cluster-history-ui` spec

  Extracted `FormattedDateTime`/`formatDateTime` out of `ClusterTable.tsx` into `app/components/FormattedDateTime.tsx` (shared, no logic duplicated) and added `src/lib/historyFields.ts` as the single source of truth both `historyEntriesDiffer` (the write-gate) and the new diff-rendering (`computeFieldChanges`, `isLifecycleChange`) build on - `store.ts` now re-exports `historyEntriesDiffer` from there instead of defining it inline.

## 5. Cross-cluster lifecycle audit log (UI)

- [x] 5.1 Add a server-side query that scans all history entries, computes each one's diff against its predecessor for the same cluster, and keeps only entries whose diff touches a consent/lifecycle field
- [x] 5.2 Build the audit log view: reverse-chronological list, each entry rendered as a plain-language sentence (cluster name, action, timestamp) using the `trigger` tag to phrase the action
- [x] 5.3 Surface the audit log from the dashboard
- [x] 5.4 Confirm deleted clusters' entries appear in this view (sourced from `history.json` directly, not joined against live `clusters.json`)

  **Revised after initial implementation**, per direct feedback: instead of a standalone `/history` route linked from the header, the audit log is now a "History" tab alongside "Clusters" on the dashboard itself (`DashboardTabs.tsx`), and instead of a plain `<ol>` list it's a sortable, searchable grid (`HistoryTable.tsx`) matching `ClusterTable.tsx`'s visual language (TanStack table, same search-input styling, pagination). The `/history` route and its page component were removed. `TRIGGER_LABEL`/`describeAuditEntry`/`AuditLogEntry` moved from `historyView.ts` to `historyFields.ts` (no `node:fs` dependency) so `ClusterHistoryButton.tsx`, a Client Component, could import them without pulling `readHistory`'s fs code into the browser bundle - the original placement broke `next build` outright (Turbopack couldn't chunk `node:fs` for the browser).

  Also fixed during this pass: `describeAuditEntry` had a bug where an `actionOutcome` reset to `"none"` (alongside a `consentStatus` reset, on a tier change after a resolved decision) printed the literal string `"none"` instead of a real sentence - reported by the user against real data in `data/history.json` ("loyalalaincolmerauer — none - detected during sync"). Fixed by excluding `actionOutcome === "none"` from the action-performed branch and reading `entry.consentStatus`/`entry.actionOutcome` (current values) rather than only the changed-field deltas, so "Turned off" vs "Deleted" is now correctly distinguished too. Covered by a regression test in `historyView.test.ts` and re-verified directly against the real `data/history.json` that originally showed the bug.

## 6. Retention interaction

- [x] 6.1 Confirm both UI surfaces only ever read entries `purgeExpiredHistory` hasn't yet removed - no separate retention logic needed in the UI layer itself

  Both `getClusterHistory` and `getLifecycleAuditLog` (`src/lib/historyView.ts`) read exclusively via `readHistory()`, which only ever returns what's currently on disk - `purgeExpiredHistory` (run at the end of every sync cycle, unchanged by this work) is what keeps that current. No separate retention filtering needed or added in the UI/query layer.

## 7. Verification

- [x] 7.1 `npm run typecheck` - clean
- [x] 7.2 `npm run test` (Vitest) - 29 tests passing across `store.test.ts`, `historyFields.test.ts`, `historyView.test.ts`
- [x] 7.3 `npm run build` - compiles; `/history` registered as a dynamic route alongside `/` and `/settings`
