## Why

Today the dashboard can only *ask* a cluster's owner to turn off or delete it, via Slack, and wait — there's no way for an operator to act immediately from the dashboard itself. `turnOffCluster()`/`deleteCluster()` already exist against the Capella API but are wired only into the consent-approval reconciliation loop. Operators need a direct, admin-initiated override for cases that can't wait on owner response (e.g. cleaning up a clearly abandoned or costly cluster right now).

## What Changes

- Add "Turn off" and "Delete" controls to a cluster's row-detail panel in the dashboard (the "Cluster" group of the existing expandable row), operating independently of the owner-consent workflow - **BREAKING** in the sense that a cluster can now be turned off or deleted without any owner consent step at all, by design.
- Turning off requires an inline confirm step (button becomes an inline "Turn off this cluster? / Confirm / Cancel" prompt).
- Deleting requires stronger friction: a modal where the operator must type the cluster's exact name before the delete can be submitted.
- Both actions call the existing `turnOffCluster()`/`deleteCluster()` Capella client functions directly and immediately, bypassing the `consentStatus`/reconciliation state machine entirely - this is a new, separate action path, not a shortcut into the existing one.
- If a cluster has a live pending Slack consent message when a manual action is taken, that message is superseded so the owner isn't left responding to a request about a cluster that's already gone or off.
- Buttons are hidden/disabled to match current state: no "Turn off" once the cluster is already turned off; neither button once the cluster is already deleted.
- Turning a cluster back on is out of scope - these are one-way actions only.
- No new permission tier is introduced; any operator who can reach the dashboard can use these controls, same as every other existing dashboard action.

## Capabilities

### New Capabilities
- `manual-cluster-actions`: lets an operator directly and immediately turn off or delete a cluster from the dashboard, with confirmation gestures scaled to each action's risk, independent of the owner-consent workflow.

### Modified Capabilities
(none)

## Impact

- `app/components/ClusterTable.tsx`: add action controls to the "Cluster" detail group.
- New client component(s) for the confirm-inline turn-off control and the type-to-confirm delete modal.
- `app/actions.ts`: new server actions calling `turnOffCluster`/`deleteCluster` from `src/lib/capellaClient.ts` directly.
- `src/lib/notifications.ts`: reuse `supersedeLiveMessage` when a manual action supersedes a live consent cycle.
- No changes to `src/lib/reconciliation.ts` or the `ConsentStatus`/`ConsentActionOutcome` state machine - this path is deliberately separate from it.
