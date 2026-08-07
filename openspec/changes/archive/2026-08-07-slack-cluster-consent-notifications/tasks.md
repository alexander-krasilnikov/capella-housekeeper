## 1. Data model

- [x] 1.1 Add `lastNotifiedAgeStatus: AgeStatus | null`, `consentStatus: "none" | "pending" | "approved-turnoff" | "approved-delete" | "declined" | "expired"`, `consentCycleStartedAt: string | null`, `remindersSent: number`, `consentTierAtDecision: AgeStatus | null`, `actionOutcome: "none" | "performed" | "skipped" | "failed"`, and `slackChannelId: string | null` / `slackMessageTs: string | null` (the currently-live message, if any, for in-place updates) to `ClusterRecord` in `src/types.ts`.
- [x] 1.2 Add Slack + notification fields to `Settings` in `src/types.ts`: `slackBotToken: string`, `slackAppToken: string` (app-level token, `connections:write`, for Socket Mode), `notificationsByTier: Record<AgeStatus, { notify: boolean; askTurnOff: boolean; askDelete: boolean }>`, `consentReminderMax: number`, `consentExpiryDays: number`. Extend `DEFAULT_SETTINGS` with every tier defaulted to all-`false` and reasonable positive defaults for the reminder/expiry counts.
- [x] 1.3 Update `src/lib/settings.ts`'s `validateSettings` to validate the new fields (both tokens as strings, empty meaning "not configured"; per-tier booleans; positive integers for reminder max/expiry days), following the existing `isPositiveInteger`/`isNonEmptyString` helpers.
- [x] 1.4 Update `src/lib/store.ts`'s read path so a `ClusterRecord` loaded without the new fields is treated as `lastNotifiedAgeStatus: null`, `consentStatus: "none"`, `remindersSent: 0`, `consentTierAtDecision: null`, `actionOutcome: "none"`, `slackChannelId: null`, `slackMessageTs: null` (see design.md Migration Plan) rather than failing validation.

## 2. Capella write operations

- [x] 2.1 Confirm the real Couchbase Capella Management API operations for cluster turn-off and delete against the official OpenAPI spec (docs.couchbase.com/cloud/management-api-reference) - do not guess the path/method/payload shape.
- [x] 2.2 Add `turnOffCluster` and `deleteCluster` methods to `src/lib/capellaClient.ts`, matching the existing method style (typed response, `CapellaApiError` on failure, doc comment citing the confirmed spec operation).

## 3. Tier-transition detection

- [x] 3.1 In `src/lib/sync.ts`, compute each cluster's current `AgeStatus` during `runSyncCycleUnguarded` (reusing `computeAgeStatus` from `src/lib/ageStatus.ts`) and compare it to the record's stored `lastNotifiedAgeStatus`.
- [x] 3.2 On a transition (computed status differs from `lastNotifiedAgeStatus`), reset that cluster's `consentStatus` to `"none"`, `remindersSent` to `0`, `actionOutcome` to `"none"`, `consentTierAtDecision`/`slackChannelId`/`slackMessageTs` to `null`, and update `lastNotifiedAgeStatus` to the new status.
- [x] 3.3 If the new tier's `notificationsByTier` entry has `notify: true`, send the notification (section 4) and, if sent, set `consentStatus` to `"pending"` with `consentCycleStartedAt` set to now and `consentTierAtDecision` to the new tier.

## 4. Slack delivery (sending)

- [x] 4.1 Add `@slack/bolt` as a dependency (brings `@slack/web-api` transitively).
- [x] 4.2 Add a send-side module (e.g. `src/lib/slack.ts`) using `@slack/web-api`'s `WebClient` built from `Settings.slackBotToken`: resolve a Slack user ID via `users.lookupByEmail`, open a DM via `conversations.open`, and post a Block Kit message via `chat.postMessage` with interactive buttons (turn-off/delete carrying a Block Kit `confirm` dialog; decline without one). Each button's `action_id`/`value` encodes the cluster ID and action. Sending does not depend on the Socket Mode connection (section 5) - it's a plain API call.
- [x] 4.3 Add owner-email validation (an `isEmailLike` helper) - if `ClusterRecord.ownerDerived` doesn't pass it, or is null, skip the send entirely and leave `consentStatus` at `"none"` (no pending cycle is started for an unnotifiable cluster).
- [x] 4.4 On a successful send, record the returned channel ID and message timestamp on the cluster's `slackChannelId`/`slackMessageTs`. Send a reminder (section 6) as a new message with fresh buttons, not an edit of the prior one.

## 5. Slack delivery (receiving - Bolt, Socket Mode)

- [x] 5.1 Add a Bolt module (e.g. `src/lib/slackBot.ts`) that constructs a `@slack/bolt` `App` with `socketMode: true`, `token: Settings.slackBotToken`, `appToken: Settings.slackAppToken`, and starts it once (mirroring how `startSyncScheduler` guards against double-start).
- [x] 5.2 Register a `block_actions` handler for the turn-off/delete/decline `action_id`s: `ack()` immediately, decode the cluster ID and action from the action's `value`, verify the matching `ClusterRecord.consentStatus` is still `"pending"` (a stale/already-decided click is a no-op, not an error), then record the decision (`approved-turnoff` / `approved-delete` / `declined`).
- [x] 5.3 After recording a decision, update the original message in place (`chat.update` using the stored `slackChannelId`/`slackMessageTs`) to show the outcome and remove the now-stale buttons.
- [x] 5.4 Wire `startSlackBot()`'s startup call alongside `startSyncScheduler` in `instrumentation.ts`, guarded on both tokens being configured (skip starting Socket Mode entirely if either is empty).

## 6. Reminder and expiry lifecycle

- [x] 6.1 In the sync cycle (or a small helper it calls), for every cluster with `consentStatus: "pending"`, compare `consentCycleStartedAt` to now against `Settings.consentExpiryDays`.
- [x] 6.2 If expired, set `consentStatus` to `"expired"` and stop reminding. If not expired and `remindersSent < Settings.consentReminderMax`, resend the notification (section 4) and increment `remindersSent`.

## 7. Reconciliation loop

- [x] 7.1 Add a new self-rescheduling loop (e.g. `src/lib/reconciliation.ts`, structurally mirroring `startSyncScheduler` in `src/lib/scheduler.ts`) that periodically scans clusters with `consentStatus` in `approved-turnoff`/`approved-delete` and `actionOutcome: "none"`.
- [x] 7.2 For each, recompute current `AgeStatus` from the latest synced record and settings, and compare it to `consentTierAtDecision`. If it no longer matches, set `actionOutcome: "skipped"` and take no Capella action.
- [x] 7.3 If it still matches, call the corresponding `turnOffCluster`/`deleteCluster` method from section 2. On success, set `actionOutcome: "performed"`. On failure, set `actionOutcome: "failed"` and leave it eligible for retry on a later pass.
- [x] 7.4 Wire the new loop's startup call alongside `startSyncScheduler` in `instrumentation.ts`.

## 8. Settings UI

- [x] 8.1 Add a new settings section (alongside the existing sidebar sections in `app/settings/`) for the Slack bot token and app-level token (each masked by default, reveal action) and per-tier notify/askTurnOff/askDelete toggles.
- [x] 8.2 Add fields for `consentReminderMax` and `consentExpiryDays` to the same or an adjacent section.
- [x] 8.3 Add a server action (in `app/actions.ts`, following the existing `saveSettingsAction`/`saveOrgsAction` pattern) to persist these fields via `writeSettings`.

## 9. Verification

- [ ] 9.1 Exercise the full lifecycle manually against a test Slack workspace and a sandbox/test Capella org: tier transition → DM with buttons received → click turn-off/delete → confirm dialog → consent recorded, message updates in place → reconciliation loop turns off (or deletes) the test cluster.
- [ ] 9.2 Verify the "recovered before action" path: approve turn-off, force the cluster back to an unflagged tier before the reconciliation loop runs, confirm the action is skipped and not retried.
- [ ] 9.3 Verify reminder and expiry timing against configured `consentReminderMax`/`consentExpiryDays` values.
- [ ] 9.4 Verify an unresolvable owner (non-email `ownerDerived`, or null) results in no Slack send and no pending consent cycle.
- [ ] 9.5 Verify a click on a stale/already-decided message (e.g. after expiry, or after a newer reminder superseded it) is a no-op.
