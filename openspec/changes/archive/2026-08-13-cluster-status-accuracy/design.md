## Context

See proposal.md for motivation. Relevant current-state facts that shape the approach:

- Capella's turn-off/turn-on/delete calls (`capellaClient.ts`) return 202 with no body - fire-and-forget, no confirmation of end state.
- `currentState` is documented as an exhaustively-enumerated field in Couchbase's Capella Management API OpenAPI spec, but this codebase has never captured that enum - it just passes the raw string through (`toClusterConfig`) and reformats it for display (`formatStatusLabel`).
- `setClusterPower` (manualActions.ts) and the reconciliation loop (reconciliation.ts) both already re-read the cluster fresh and write back only the fields they own, right before their write, to avoid clobbering concurrent changes during the Capella call's latency - this discipline is reused as-is, not redesigned.
- `consentStatus` and `actionOutcome` are already separate fields on `ClusterRecord`; the conflation the user flagged is purely in how `ClusterTable.tsx`'s `describeConsent()` renders them together.
- The user explicitly decided, during exploration: no new polling/push infrastructure anywhere (manual-action re-check relies on the existing sync cadence; the reconciliation loop's visibility stays exactly as it is; login sync runs in the background rather than blocking).

## Goals / Non-Goals

**Goals:**
- `config.status` never has an assumed/guessed value written into it - only values Capella itself is known to report, or that a status write is deferred until Capella has actually reported them.
- The Status badge's color and animation are driven by a declared classification of Capella's real `currentState` values, not by pattern-matching the display label.
- The Consent badge reflects only the consent decision; the outcome of acting on it (performed/skipped/failed) is shown as its own signal, for both reconciled and manual actions.
- A fresh login kicks off a sync without making the operator wait for it.

**Non-Goals:**
- No new continuous polling, SSE, or WebSocket infrastructure for live status updates - explicitly decided against.
- No change to the underlying turn-off/turn-on/delete/reconciliation policy or Capella call sequence itself.
- No change to `formatStatusLabel`'s humanization of Capella's raw status string - only the color/animation classification changes.
- Not fixing the pre-existing gap where a manual turn-off leaves a stale "Pending" consent badge in place - noted below as a known, deliberately out-of-scope inconsistency.

## Decisions

### 1. A declared enumeration of Capella's `currentState` values, bucketed
Add a single source of truth (in `capellaClient.ts`, alongside the existing `currentState` documentation comment) enumerating Capella's known operational-state values, grouped into the four buckets the UI needs: active, transitioning, off, and an explicit fallback for anything not recognized. Both the status-writing decisions (#2) and the badge classification (#4) read from this one list, so they can never disagree about which bucket a given value belongs to.

**Alternative considered**: keep inferring buckets from the string at render time (e.g. `/turning/i`). Rejected - that's the exact fragile approach being removed; a closed set of real values needs to be declared, not guessed at render time.

### 2. Manual and reconciled actions write Capella's in-progress value, not an assumed terminal one
`setClusterPower` (manual turn-off/turn-on) and the reconciliation loop's turn-off/delete branch each stop hardcoding the terminal status (`"turnedOff"`/`"healthy"`) after a successful Capella call, and instead write the transitioning-bucket value for that direction, from the same enumeration as #1. This reuses the existing re-read-fresh-then-write-back discipline at both call sites unchanged - only the literal value assigned changes.

Delete's write is best-effort: the record is removed outright once the next sync cycle observes the cluster is gone (existing `cluster-sync` behavior, unchanged), so an in-progress "destroying" value is only ever visible in the narrow window between the delete call and that next sync.

### 3. No targeted re-poll after an action; rely on the existing sync cadence
Confirmed with the user: neither manual nor reconciled actions get a dedicated re-check loop. The in-progress value written by #2 is corrected only by whatever next observes Capella's real state - the scheduled sync (`syncIntervalHours`), an operator-triggered Refresh, or the new login-triggered sync (#6).

**Trade-off accepted**: a row can show an in-progress state for anywhere from moments up to the next scheduled sync if nothing else triggers one first. This is acceptable because the badge is now *honest about being unconfirmed* rather than *wrong about being done* - the actual problem being fixed.

### 4. Bucket → color/animation mapping
- active → emerald (unchanged)
- transitioning → a shared distinct color, with an animated/pulsing dot - same visual language `SlackConnectionIndicator` already uses for its "connecting"/"reconnecting" states via `animate-pulse`, applied consistently for a familiar in-progress signal within this app
- off → amber (unchanged)
- unrecognized → a neutral fallback, distinct from all three, so an unexpected value from Capella never mis-reads as one of the known states

Display text is untouched - `formatStatusLabel` keeps humanizing whatever raw value Capella reports, per the user's decision to keep Capella's own status vocabulary. Only the color/animation lookup changes, from a label regex to a value-keyed bucket lookup against #1's enumeration.

### 5. Action column carries the persisted outcome; Consent carries only the decision
The Action column (already spec'd to host each control plus its own ephemeral click-result message) gains a small persistent badge for `actionOutcome` (performed/skipped/failed) once the reconciliation loop has acted on a consent decision. `describeConsent()` stops taking `actionOutcome` as an input - it becomes a pure function of `consentStatus` alone.

Because the Action column now carries a persistent, occasionally load-bearing signal (a failed automatic action) rather than only an ephemeral per-click message, it moves into the default-visible column set (previously hidden by default) so a failure isn't invisible to an operator who hasn't customized columns.

**Alternative considered**: a two-line Consent badge (decision + outcome stacked in one cell) instead of a real column. Rejected per the user's explicit choice of the separate-columns option during exploration.

**Known, deliberately out-of-scope inconsistency**: a manual turn-off today doesn't clear a stale "Pending" consent badge left over from an in-flight consent ask (only manual turn-*on* resets the consent cycle). Splitting the columns makes this more visible, not less, but fixing it is a separate behavioral decision left for a future change.

### 6. Login triggers a background sync, without blocking the redirect
`loginAction` calls `runSyncCycle()` without awaiting it (fire-and-forget) immediately after establishing the session, then redirects as it does today. This relies on `runSyncCycle`'s existing `cycleInFlight` de-duplication, so a login-triggered sync can never race the scheduler's own interval tick or another login's sync into two overlapping cycles - whichever caller finds one already in flight is satisfied by it.

**Trade-off accepted** (matches the user's explicit choice): login stays fast; the very first dashboard paint after login can still show pre-login data if the sync hasn't finished by the time that request is served. Judged acceptable because the alternative being replaced is "never syncs on login at all."

## Risks / Trade-offs

- **[Risk]** Capella adds or renames a `currentState` value not yet in the declared enumeration → it falls into the "unrecognized" bucket (neutral color) instead of crashing or silently mis-bucketing into active/off. **Mitigation**: the unrecognized fallback is a declared, spec'd case (see cluster-dashboard-ui's new "unrecognized status" scenario), not an oversight to patch later.
- **[Risk]** No targeted re-poll means an in-progress badge can outlive the real Capella transition by minutes if nothing else triggers a refresh. **Mitigation**: none by design - this is the explicitly accepted trade-off in Decision #3.
- **[Risk]** Making the Action column default-visible shifts the table's default layout for operators who haven't customized their columns. **Mitigation**: one-time, low-severity shift; anyone with a saved column configuration (which already takes priority) is unaffected.
- **[Risk]** Two logins seconds apart, or a login racing the scheduler's own tick, could in principle double up sync work. **Mitigation**: already prevented by `sync.ts`'s existing `cycleInFlight` guard - no new risk introduced.

## Migration Plan

No data migration - `config.status` remains a raw string field; this change only affects which literal values get written into it and how those values are classified for display. Ships as a single deploy. Rollback is a plain revert; no persisted-state format changes need reversing.

## Open Questions

- The exact Capella `currentState` spelling for each transitional state (turning off / turning on / deploying / destroying / scaling) needs to be confirmed against Couchbase's published Capella Management API OpenAPI spec before Decision #1's enumeration is written. This doesn't change the bucket mechanism or any requirement above - it's a lookup to do during implementation, tracked as its own task.
