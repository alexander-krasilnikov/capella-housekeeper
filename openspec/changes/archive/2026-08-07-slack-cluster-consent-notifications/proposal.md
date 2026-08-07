## Why

Operators currently only learn a cluster has gone `Stale` or `Forgotten` by opening the dashboard and looking. Nothing proactively reaches the person who can actually decide what to do about it, and nothing captures that decision or acts on it. This change closes that loop: when a cluster's age status crosses into a tier an operator cares about, its derived owner gets a Slack DM, can consent to turning it off or deleting it, and an approved decision is carried out automatically after a final safety check.

This intentionally moves the app from "phase one: read-only visibility" (see README) into its first write-capable, cleanup-triggering territory - not incidentally, but as the explicit point of this change.

## What Changes

- Age-status tier transitions (not level, edge-triggered) become notification events, gated per-tier by new settings (`notify`, `askTurnOff`, `askDelete` per `New`/`Established`/`Stale`/`Forgotten`).
- On a watched transition, the app resolves the cluster's derived owner (`ClusterRecord.ownerDerived`) to a Slack user via a bot token and sends a DM with real interactive buttons. If the owner isn't email-shaped or can't be resolved, the notification is skipped entirely - no fallback recipient.
- Button clicks are captured over a connection this app opens outward to Slack (Socket Mode), not via a Slack-registered Request URL calling into this app - there is no publicly-reachable inbound endpoint anywhere in this feature. Turn-off and delete buttons carry a native Slack confirmation dialog as their mis-click guard; decline doesn't need one.
- Unanswered requests get a configurable number of reminder re-sends before a configurable expiry window elapses, after which the request is `expired`. Any terminal outcome (`approved-*`, `declined`, `expired`) holds until the cluster's next age-status tier transition, which resets the cycle.
- **New capability**: a reconciliation loop (sibling to the existing sync scheduler, same always-on process) that finds approved-but-not-yet-actioned clusters, re-verifies each is still in its flagged tier immediately before acting (closing the race window between approval and reconciliation), and calls new Capella write operations to turn off or delete the cluster.
- **BREAKING** (scope, not API): this is the first capability in the app that performs a destructive write against a real Capella cluster. Everything before this change was read-only.

## Capabilities

### New Capabilities
- `cluster-consent-notifications`: detects watched age-status tier transitions, resolves the cluster owner, sends and tracks a Slack DM consent request (real interactive buttons) through its pending/reminder/expiry/decision lifecycle.
- `cluster-lifecycle-actions`: reconciles approved consent decisions into real Capella actions (turn off, delete), including the pre-action re-verification safety check and outcome tracking.

### Modified Capabilities
- `dashboard-settings`: adds the Slack bot token, per-tier notification configuration (`notify`/`askTurnOff`/`askDelete`), and the reminder-count/expiry-days values as new operator-configurable, validated settings.

## Impact

- `src/types.ts`: new `ClusterRecord` fields for last-notified age status, consent status, reminders-sent count, ask-cycle start time, and the currently-live Slack message's channel/ts (for in-place updates); new `Settings` fields for Slack + per-tier notification config.
- `src/lib/settings.ts`: validation and merge logic for the new settings fields, following the existing per-field pattern.
- `src/lib/capellaClient.ts`: new write operations for cluster turn-off and delete (confirmed against the official Management API spec before implementation, matching how every existing method here was sourced).
- `src/lib/sync.ts`: detects tier transitions per cluster during each sync cycle and triggers the notification flow.
- `src/lib/scheduler.ts` (or a new sibling module): a second self-rescheduling loop for reconciliation.
- New `@slack/bolt` dependency: a long-lived Socket Mode `App` (started alongside the sync scheduler) that receives button-click events and records decisions; sending itself uses the lighter `@slack/web-api` `WebClient`, independent of the Socket Mode connection's health.
- `app/settings/`: a new settings section for the Slack bot token, app-level token, and per-tier notification configuration.
- New outbound dependencies: a Slack bot token (`chat:write`, `users:read.email`, `im:write`) and a Slack app-level token (`connections:write`, for Socket Mode) - no inbound Slack-facing endpoint of any kind.
