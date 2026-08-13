## Why

The dashboard's cluster status is frequently wrong in ways operators can't tell apart from being right. A manual turn-off/turn-on writes an *assumed* terminal status the instant Capella returns its fire-and-forget 202 - not what Capella actually reports - so the row can claim "Turned Off" while the cluster is still transitioning. An automatic (reconciliation-loop) turn-off/delete doesn't touch the status field at all, so the row can sit on a stale "Active" for up to an hour, until the next scheduled sync. Separately, the Status badge colors clusters by a regex on the display label, so "Turning Off" and "Turned Off" render identically; and the Consent column fuses the owner's consent decision with the execution outcome of acting on it, so an operational failure ("Turn off failed") reads as a consent state. Fixing status accuracy and untangling consent-from-outcome now, together, avoids operators distrusting or misreading the one column the whole workflow depends on.

## What Changes

- Manual turn-off/turn-on actions record the operational status Capella itself reports as in-progress for that direction immediately after the API call, instead of assuming the terminal status before Capella has confirmed it.
- The reconciliation loop's automatic turn-off/delete does the same at the moment it calls Capella, instead of leaving the Status column showing whatever it displayed before the action, unchanged until the next scheduled sync cycle.
- The Status badge's color and (for in-progress states) animation are driven by a fixed classification of Capella's own operational-state values - active, transitioning, off, unknown - instead of a substring match against the formatted label text.
- The Action outcome (performed/skipped/failed) is shown in its own column, separate from Consent (pending/approved/snoozed/expired/none/etc.), including the outcome of manual dashboard actions, which persists across a page reload rather than only appearing in a session-local result message.
- Logging in triggers a cluster sync in the background immediately after authentication succeeds, without delaying the redirect to the dashboard, so a fresh session catches up on Capella-side changes without an operator having to press Refresh.

No changes to the underlying Capella operations themselves (turn-off, turn-on, delete still work exactly as before); this only changes what status value gets recorded and how it's displayed.

## Capabilities

### New Capabilities
_None._

### Modified Capabilities
- `cluster-dashboard-ui`: Status badge color/animation is now derived from a fixed classification of Capella's operational-state values rather than label text matching; the Action outcome is shown as its own column, separate from Consent, and persists manual-action results across reloads.
- `manual-cluster-actions`: After a manual turn-off or turn-on call succeeds, the system records the in-progress operational status Capella itself reports for that direction, not an assumed terminal status.
- `cluster-lifecycle-actions`: After the reconciliation loop's turn-off or delete call succeeds, the system records the in-progress operational status Capella itself reports, immediately, rather than leaving the status field untouched until the next sync cycle.
- `dashboard-auth`: A successful login triggers a cluster sync in the background, without blocking the redirect to the dashboard.

## Impact

- **Code**: `src/lib/manualActions.ts` (status written post-action), `src/lib/reconciliation.ts` (status written post-action), `app/components/ClusterTable.tsx` (`StatusBadge`, Consent/Action column split), `app/actions.ts` (`loginAction` background sync trigger). `src/lib/capellaClient.ts` may gain a documented list/type for Capella's `currentState` enum values if one doesn't already exist, to back the status classification.
- **Data model**: No schema changes - `ClusterRecord.config.status` continues to hold a raw Capella state string; `consentStatus`/`actionOutcome` are already separate fields, only their presentation changes.
- **Dependency**: The exact Capella `currentState` values for in-progress transitions (e.g. the real names for "turning off" / "turning on" / "deploying" / "destroying") need to be confirmed against Couchbase's published Capella Management API spec before the status-writing and classification logic can be implemented, per the earlier decision to use Capella's own status vocabulary rather than inventing labels.
- **No breaking changes**; no new settings or external dependencies.
