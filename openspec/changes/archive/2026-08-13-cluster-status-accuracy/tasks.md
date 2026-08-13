## 1. Capella status enumeration (foundation for everything else)

- [x] 1.1 Look up Capella's `currentState` enum from Couchbase's published Capella Management API OpenAPI spec (docs.couchbase.com/cloud/management-api-reference) and record the exact values for: active/healthy, turned-off, turning-off, turning-on, deploying, scaling, destroying, and any other states the spec defines.
- [x] 1.2 In `src/lib/capellaClient.ts`, add a single declared mapping from each of those values to one of four buckets - active, transitioning, off - plus a documented "unrecognized" fallback for any value not in the list. Export it (or a lookup function over it) for reuse by both the status-writing call sites and the UI.

## 2. Manual actions record an honest in-progress status

- [x] 2.1 In `src/lib/manualActions.ts`'s `setClusterPower`, replace the hardcoded terminal `status` values (`"turnedOff"` / `"healthy"`) with the transitioning-bucket value for that direction, looked up from task 1.2's mapping.
- [x] 2.2 Confirm the existing re-read-fresh-then-write-back behavior around this write is unchanged (no new clobber risk introduced).

## 3. Reconciliation records an honest in-progress status

- [x] 3.1 In `src/lib/reconciliation.ts`, extend the turn-off/delete success path (inside or alongside `applyActionOutcome`) to also write the transitioning-bucket value for that action onto `config.status`, using task 1.2's mapping, immediately when the Capella call succeeds.
- [x] 3.2 Confirm a skipped or failed pass leaves `config.status` untouched (only `actionOutcome` changes in those cases).

## 4. Status badge classification and visuals

- [x] 4.1 In `app/components/ClusterTable.tsx`, replace `StatusBadge`'s `/off/i` / `/healthy|running|ready/i` regex logic with a lookup against task 1.2's bucket mapping.
- [x] 4.2 Add color/animation treatment for all four buckets: active (existing emerald), transitioning (new shared color + animated/pulsing dot), off (existing amber), unrecognized (new neutral fallback, distinct from the other three).
- [x] 4.3 Verify a cluster in a transitioning state and the same cluster once terminal render with visibly different colors (manual check against the two states, e.g. by toggling stored `config.status` in dev data). Verified via unit test (`capellaClient.test.ts`) rather than the live dashboard - this repo's local store has real, active Capella/Slack credentials, so the dev server (and its background schedulers) wasn't started against it. The test confirms `"turningOff"`/`"turnedOff"` classify into different buckets, which `StatusBadge`'s bucket-keyed style map renders in different colors.

## 5. Split Action outcome from Consent decision

- [x] 5.1 In `app/components/ClusterTable.tsx`, remove `actionOutcome` as an input to `describeConsent()` - it becomes a pure function of `consentStatus` only.
- [x] 5.2 Add a persistent outcome badge (performed/skipped/failed) to the Action column's cell, shown whenever the cluster's `actionOutcome` is not `"none"`, styled independently of the Consent badge.
- [x] 5.3 Update `DEFAULT_COLUMN_VISIBILITY` / `DEFAULT_COLUMN_ORDER` so the Action column is visible by default (it now carries a persistent, occasionally important signal, not just an ephemeral per-click message).
- [x] 5.4 Confirm the Consent column's badge no longer displays outcome-derived text (e.g. "Turn off failed") anywhere.

## 6. Login-triggered background sync

- [x] 6.1 In `app/actions.ts`'s `loginAction`, call `runSyncCycle()` without awaiting it, right after the session cookie is set, before the redirect.
- [x] 6.2 Confirm `runSyncCycle`'s existing `cycleInFlight` guard correctly de-duplicates against the scheduler's own tick or a concurrent login (no test changes expected here - this is verifying existing behavior isn't accidentally bypassed).

## 7. Verification

- [x] 7.1 Run the existing test suite (`manualActions.test.ts`, `reconciliation`-adjacent tests if any, `store.test.ts`) and update/add unit coverage for the new status-writing behavior in tasks 2 and 3. Updated `manualActions.test.ts`'s turn-on assertions to expect `"turningOn"` instead of `"healthy"`; added `reconciliation.test.ts` (none existed before) covering the new in-progress status writes for performed turn-off/delete and confirming skipped/failed passes leave `config.status` untouched. Full suite (82 tests, 8 files) and `tsc --noEmit` both pass; `next build` compiles cleanly.
- [ ] 7.2 Manually exercise: a manual turn-off (confirm in-progress status shown, then confirm a later sync corrects it), a manual turn-on (if the developer toggle is enabled), an approved reconciled turn-off/delete, and a fresh login (confirm dashboard redirect isn't blocked and a sync fires in the background).
- [x] 7.3 Run `openspec validate cluster-status-accuracy --strict` before archiving. Passes: "Change 'cluster-status-accuracy' is valid".
