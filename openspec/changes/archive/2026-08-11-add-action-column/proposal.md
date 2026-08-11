## Why

The three per-cluster operator controls — Ask (manual consent request), Turn off, and Delete — are currently split across two different places in the dashboard: Ask lives inline in the main grid's Consent column, while Turn off and Delete are hidden inside the row-detail panel and only reachable after expanding a row. This makes the two most consequential controls the least discoverable, and scatters "things an operator can do to this cluster" across the UI with no single place to look. Consolidating them into one always-visible Action column also surfaces two behavior gaps worth closing at the same time: Turn off's already-off state is currently communicated by silently omitting the control (rather than showing why it's unavailable), and Ask has no visual indication that it will fail until after it's clicked.

## What Changes

- Add a new "Action" column to the main cluster table, rightmost among the existing columns, containing all three controls — Ask, Turn off, Delete — inline in every row.
- Remove the Ask control from the Consent column (the Consent badge remains there on its own).
- Remove the "Actions" field (Turn off / Delete) from the row-detail panel's Cluster group; the detail panel no longer hosts any action controls.
- Turn off's confirmation step changes from an inline in-place `[Confirm] [Cancel]` swap to a modal dialog, matching Delete's existing modal pattern, so confirming/canceling no longer changes the table row's height.
- Turn off's control is now always shown per row: instead of being omitted when the cluster is already turned off, it is shown disabled (with an explanation of why).
- The Ask control is disabled, before any click, when the cluster's derived owner is absent or not email-shaped, instead of always being clickable and only failing after the click.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `cluster-dashboard-ui`: the main table gains a unified Action column (Ask, Turn off, Delete) as its rightmost column; Ask is removed from the Consent column; the row-detail panel's Cluster-group Actions field is removed.
- `manual-cluster-actions`: the turn-off confirmation step becomes a modal dialog instead of an inline in-place swap; the turn-off control is shown disabled rather than omitted when the cluster is already turned off.
- `cluster-consent-notifications`: the manual consent-request (Ask) control is disabled when the cluster has no email-shaped derived owner, rather than always enabled and failing silently after being clicked.

## Impact

- `app/components/ClusterTable.tsx`: new "Action" column definition; Consent column cell drops `SendConsentRequestButton`; detail-row Cluster group drops its Actions `dd`.
- `app/components/SendConsentRequestButton.tsx`: gains a disabled state driven by owner eligibility (email-shaped `ownerDerived`).
- `app/components/ManualTurnOffButton.tsx`: confirmation UI changes from inline swap to a modal dialog (mirroring `ManualDeleteButton.tsx`'s existing modal); gains a disabled state (with explanatory title/tooltip) for the already-off case instead of not rendering at all.
- `app/page.tsx`: `ClusterRow` construction already exposes `statusIsOff`; no new server-side data needed for Turn off's disabled state. Ask's disabled state needs the same email-shape check `notifications.ts` already performs server-side, evaluated client-side (or passed down) per row.
- No changes to `src/lib/manualActions.ts` or `src/lib/notifications.ts` server-action logic — this change is confined to control placement, visibility, and confirmation UI.
