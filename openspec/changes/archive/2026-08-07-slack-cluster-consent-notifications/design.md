## Context

See `proposal.md` for motivation. Relevant current-state constraints this design works within:

- Age status (`New`/`Established`/`Stale`/`Forgotten`) is computed on the fly at page-render time (`computeAgeStatus` in `src/lib/ageStatus.ts`, called from `app/page.tsx`) from `ClusterRecord` + `Settings`. It is not persisted anywhere today, and nothing observes it outside of a browser loading the dashboard.
- The only recurring background process is the sync scheduler (`src/lib/scheduler.ts`): a self-rescheduling `setTimeout` loop, started once from `instrumentation.ts`, running in the same always-on Node process as the web server (not compatible with serverless/edge - see README).
- `src/lib/capellaClient.ts` is read-only except for one billing POST. Every existing method's comment cites the exact official OpenAPI operation it was confirmed against; there is no turn-off or delete method yet.
- `ClusterRecord.ownerDerived` (`src/lib/sync.ts`, `resolveOwner`) is best-effort: an email if the Capella Users API lookup succeeded and returned one, otherwise a display name or the raw Capella user ID, otherwise `null` if unresolved or no creation audit exists at all. It is not reliably an email.
- `src/lib/settings.ts` follows a strict pattern: a pure `validateSettings` function, a `readSettings` that seeds/repairs defaults, and a `writeSettings` that merges a partial update onto current settings and re-validates the whole object. New settings fields extend this same pattern rather than introducing a parallel one.
- `src/lib/auth.ts` already has an HMAC sign/verify pattern for session tokens (`sign`/`verifySessionToken`) keyed on `Settings.sessionSecret`.
- The app has zero `app/api` routes today; every mutation is a `"use server"` action invoked from an authenticated browser session (`app/actions.ts`).

## Goals / Non-Goals

**Goals:**
- Detect age-status tier transitions during the existing sync cycle (the only place that runs unattended) and drive notifications from there, not from page views.
- Deliver real Slack interactive buttons and capture the click, without ever exposing a publicly-reachable inbound endpoint that Slack's infrastructure calls into.
- Keep the reconciliation loop's write actions gated by a re-check immediately before execution, independent of how long ago consent was given.

**Non-Goals:**
- Dashboard UI changes to show consent/notification status (e.g. a new table column) - this change is about the notification and action pipeline, not visualizing its state. A follow-up change can surface it once this exists.
- Any Slack channel/group delivery, or any fallback recipient when the derived owner can't be resolved to an email.
- Multi-tenant Slack configuration (per-org bot tokens, per-org channel routing) - one bot token, matching the app's existing single `settings.json` model.
- Any action beyond turn-off and delete (e.g. resize, migrate).

## Decisions

### Tier-transition detection lives in the sync cycle, not at render time
`runSyncCycle` (`src/lib/sync.ts`) is extended to call `computeAgeStatus` per cluster (it doesn't today) and compare against a new persisted `lastNotifiedAgeStatus` field on `ClusterRecord`. This is the only correct place for it: it's the only code that runs on a schedule regardless of whether anyone opens the dashboard. The alternative - deriving transitions from history snapshots after the fact - was rejected because it would require diffing `ClusterSnapshot` history on every cycle instead of a single stored field, for no benefit.

### Real Slack interactive buttons over a self-initiated connection (Bolt, Socket Mode)
Superseded during implementation (see below for the superseded version). The app runs a `@slack/bolt` `App` in Socket Mode: it opens an *outbound* WebSocket connection to Slack (authenticated with an app-level token, `connections:write` scope) and Slack pushes button-click (`block_actions`) events down that connection. Nothing ever reaches in from the internet to a route this app hosts - there is no Request URL to register, and no HTTP signature to verify, because the interaction never arrives as an inbound HTTP request in the first place; it arrives over a connection this process opened. This is a better fit for "no inbound Slack-facing endpoint" than the originally-considered plain-link approach, while getting real button UX: the click is a genuine Slack interaction (not an automatable link fetch), and the handler can update the original message in place (`respond`/`chat.update`) to show the outcome and disable further clicks.

The Socket Mode connection is a second long-lived thing this process keeps open, alongside the sync scheduler's timer loop - both fit the "single always-on Node process" model the app already commits to (see README), just via a persistent connection instead of a timer. Bolt handles reconnection on drop internally.

Two things this removes, since they were solving problems specific to the plain-link approach: no consent-token signing (no `consentSigningSecret` setting, no HMAC payload) - the button's own `action_id`/`value` carries the cluster and action, and the click's authenticity comes from arriving over the authenticated Socket Mode connection rather than from a signed URL; and no `/consent` confirmation route or app-reachable base URL setting (no `appBaseUrl`) - there is no bare link for a preview-fetcher to prefetch, so the GET-is-inert/POST-confirms split doesn't apply. Turn-off and delete buttons instead use Block Kit's native `confirm` object (a Slack-rendered "Are you sure?" dialog before the click event even fires) as the safety step against a mis-click; `Decline` doesn't need one.

**Superseded**: plain `url`-type link buttons pointing at a self-hosted `/consent/<token>` route, with an HMAC-signed token (reusing `src/lib/auth.ts`'s pattern) and an inert-GET/confirm-POST split to guard against link-preview prefetchers. Rejected in favor of the above once Socket Mode was considered: it gives the same "no public inbound endpoint" property without needing a confirmation page, a token scheme, or losing in-place message updates.

### Owner resolution requires a real bot token, not an incoming webhook
Because the recipient varies per cluster (the derived owner), delivery needs `users.lookupByEmail` + `conversations.open` + `chat.postMessage` with a bot token (`chat:write`, `users:read.email`, and `im:write` - confirmed by hitting `missing_scope` on `conversations.open` with only the first two) - a plain Incoming Webhook is bound to one fixed destination chosen at creation time and can't address an arbitrary user dynamically. If `ownerDerived` isn't email-shaped or is absent, the notification is skipped outright (per proposal - no fallback recipient), which also means no bot-token-driven send is attempted for that cluster at all. Sending itself doesn't need Socket Mode (only *receiving* button clicks does) - the sync cycle sends via a plain `@slack/web-api` `WebClient` built from the bot token, independent of the long-lived Bolt `App` that only exists to receive clicks.

### A reminder is a new message, not an edit to the old one
Each reminder re-send posts a fresh message with its own live buttons, rather than editing the original. The original message from a prior reminder is updated in place only when it is actually acted on (clicked) or superseded by a newer reminder/notification for the same cluster, whichever comes first - so there is never more than one message with still-live buttons outstanding per cluster at a time.

### Consent state and reset semantics
New per-cluster fields (exact shape TBD in tasks, conceptually): `lastNotifiedAgeStatus`, `consentStatus` (`none | pending | approved-turnoff | approved-delete | declined | expired`), `consentCycleStartedAt`, `remindersSent`, `actionOutcome` (`none | performed | skipped | failed`), plus `slackChannelId`/`slackMessageTs` for the one currently-live message (if any) so the Bolt action handler and the reconciliation loop can update it in place. A tier transition (any change in `computeAgeStatus`'s result from what's stored in `lastNotifiedAgeStatus`) resets `consentStatus` to `none`/fresh eligibility and clears `actionOutcome`, then re-evaluates whether the new tier is configured to notify. This means a recovery transition (e.g. `Forgotten` → `Established` via renewed activity) already clears a stale `approved-*` outcome as a side effect of the general reset rule - the reconciliation loop's pre-action re-check (below) exists only for the narrower race where activity resumes *after* approval but *before* the next sync cycle runs and performs that reset.

### Reconciliation loop is a sibling scheduler, not folded into sync
A second self-rescheduling loop, structurally identical to `startSyncScheduler`, scans for `consentStatus` in `approved-turnoff`/`approved-delete` with `actionOutcome: none`. Kept separate from `runSyncCycle` rather than merged into it, so a slow or failing Capella write call can't delay the read-only sync cycle that everything else (the dashboard's data freshness) depends on.

### Re-verification is a live re-check, not a cached comparison
Immediately before calling the new turn-off/delete client methods, the reconciliation loop recomputes the cluster's current age status from its latest synced record and `Settings`, and compares it to the tier that was active when consent was granted. If it no longer matches, the action is skipped and `actionOutcome` is set to `skipped` - not treated as an error.

## Risks / Trade-offs

- **[Risk] A Slack bot token with `chat:write`/`im:write` is a credential that can message any user in the workspace, not just resolved cluster owners.** → Mitigation: store it with the same masking-by-default treatment as Capella API keys (see `dashboard-settings` delta); scope is a Slack App configuration concern outside this codebase, but document the minimum required scopes in the settings UI's help text. The app-level token (`connections:write`, for Socket Mode) gets the same masked treatment.
- **[Risk] Turn-off/delete are irreversible-in-effect actions gated only by whether someone's email resolves and they click a button.** → Mitigation: Block Kit's native `confirm` dialog on both destructive buttons guards against a mis-click; re-verification catches the case where the cluster recovered in the interim; this is a deliberate, explicit crossing of the "read-only" boundary the proposal calls out, not an incidental side effect.
- **[Risk] `ownerDerived` quality varies (email vs. raw ID vs. null) and this feature silently does nothing for the non-email cases.** → Mitigation: accepted per proposal (skip, no fallback) - surfacing "clusters with unnotifiable owners" is a reasonable follow-up for the dashboard UI, out of scope here.
- **[Risk] The Socket Mode connection is a new long-lived dependency - if it's down, button clicks silently have nowhere to land.** → Mitigation: Bolt reconnects automatically on drop; sending notifications (via the plain `WebClient`) is entirely independent of the Socket Mode connection's health, so a connection blip delays consent capture, not delivery.

## Migration Plan

- Existing `ClusterRecord`s in `data/clusters.json` lack the new fields entirely; `readClusters`/`upsertClusters` (`src/lib/store.ts`) should treat their absence as `lastNotifiedAgeStatus: null` / `consentStatus: "none"`, so the very next sync cycle's transition check for every existing cluster compares against "no prior tier" - equivalent to a fresh transition into whatever tier it's currently in. This is acceptable (worst case: every existing cluster gets exactly one notification pass on first deploy of this change) and needs no explicit backfill script.
- Existing `Settings` in `data/settings.json` similarly lack the new fields; `readSettings`'s existing merge-with-defaults path (`src/lib/settings.ts`) covers this the same way it already does for prior settings additions - new fields default to "notifications disabled for every tier" so nothing fires until an operator explicitly configures both tokens and the per-tier config.
- Rollback is deleting the new scheduler's and Socket Mode `App`'s startup calls and leaving the persisted fields inert (unused but harmless) - no destructive migration to reverse.

## Open Questions

- Exact reminder-spacing algorithm within the expiry window (e.g. evenly spaced vs. a fixed interval that simply stops once expiry is reached) - doesn't change the spec-level behavior (a bounded number of reminders, then expiry), only its timing curve.
- The real Couchbase Capella Management API operations and request/response shapes for cluster turn-off and delete - needs confirming against the official OpenAPI spec before `capellaClient.ts` implementation, the same way every existing method there was individually sourced. Doesn't change this design's shape, only the eventual client method bodies.
