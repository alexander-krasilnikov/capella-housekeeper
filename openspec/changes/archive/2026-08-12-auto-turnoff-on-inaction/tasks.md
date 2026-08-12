## 1. Data model

- [x] 1.1 Add `autoTurnOffOnInaction: boolean` and `maxSnoozes: number` to `TierNotificationConfig` in `src/types.ts`, and default both in `DEFAULT_TIER_NOTIFICATION_CONFIG` (`autoTurnOffOnInaction: false`, `maxSnoozes: 3`).
- [x] 1.2 Add `snoozeCount: number` to `ClusterRecord` in `src/types.ts`, defaulting to `0` for records synced before the field existed (same pattern as `lastNotifiedAgeStatus`). Also threaded through `settings.ts` validation, `store.ts`'s `withConsentDefaults`, and `sync.ts`'s record construction / `consentFieldsEqual` / `adoptConsentFields`, which weren't called out as their own task but are required by every other place `ClusterRecord`'s consent fields are read or carried forward.
- [x] 1.3 Add `"auto-turnoff-decision"` to the `HistoryTrigger` union in `src/types.ts`.

## 2. Expiry and snoozing logic (`src/lib/notifications.ts`)

- [x] 2.1 Add a helper that decides auto-turn-off eligibility for a record/tier: tier's `autoTurnOffOnInaction` and `askTurnOff` both true, and the cluster's current operational state is not already off (reuse `isAlreadyOff` from `src/lib/slack.ts`).
- [x] 2.2 In the expiry branch of `applyConsentNotifications`, when eligible per 2.1: set `consentStatus = "approved-turnoff"` and `consentTierAtDecision = tier` instead of `"expired"`, send the owner an automatic-turn-off notice via `updateMessage`/`supersedeLiveMessage`-style edit of the live message. This path is logged with the existing `"sync"` trigger (not `"auto-turnoff-decision"`) since it's detected inside the regular sync-cycle batch, same as every other tier/expiry transition today - see the `HistoryTrigger` comment in `types.ts` and `describeAuditEntry`'s trigger-aware wording in `historyFields.ts`, which distinguishes it from an owner's own approval without needing a second trigger value for this path.
- [x] 2.3 In the tier-transition reset block, reset `snoozeCount` to `0` alongside the other consent fields already reset there.
- [x] 2.4 Confirm (no code change expected) that the snooze-resume branch does NOT reset `snoozeCount` - this is the loophole fix; add a comment noting the omission is deliberate.
- [x] 2.5 Update `buildConsentMessage` (`src/lib/slack.ts`) to state the real no-response consequence: auto-turn-off wording plus remaining-snooze count when eligible per 2.1, otherwise today's "no automatic action" wording. Keep the existing Forgotten-grace-period addendum.

## 3. Snooze cap enforcement (`src/lib/slackBot.ts`)

- [x] 3.1 In the `consent_snooze` action handler, before calling `views.open`: compute the cluster's current tier and check `record.snoozeCount >= tierConfig.maxSnoozes` when that tier's `autoTurnOffOnInaction` is enabled.
- [x] 3.2 If at the cap and eligible per the 2.1 helper: skip opening the modal, apply the same automatic-turnoff decision + owner notification + history entry as 2.2 (extracted as `applyAutoTurnOffDecision` in `notifications.ts`, shared by both call sites), and show the clicking user an ephemeral message explaining why no dialog opened. This path is tagged with the new `"auto-turnoff-decision"` trigger, since - unlike 2.2 - it happens at an isolated moment (a button click), not inside a sync batch.
- [x] 3.3 If at the cap but not eligible (e.g. `askTurnOff` disabled for the tier): fall back to opening the snooze modal as normal (today's unlimited behavior), since there's no automatic action to substitute.
- [x] 3.4 In `handleSnoozeSubmission`, increment `record.snoozeCount` on a successful snooze, and include the remaining-snooze count in the confirmation text edited onto the live message when the tier's `autoTurnOffOnInaction` is enabled.

## 4. Completion notifications (`src/lib/reconciliation.ts`)

- [x] 4.1 Add a Slack notification step to `applyActionOutcome`, called after the outcome is written, using the record's `slackChannelId`/`slackMessageTs` and the existing `updateMessage` helper.
- [x] 4.2 Compose distinct text per outcome: performed ("Done - turned off/deleted"), skipped ("No action taken - cluster became active again before we acted"), failed ("Couldn't turn off/delete - will retry").
- [x] 4.3 Skip sending when the record has no live `slackChannelId`/`slackMessageTs` (already superseded or never had one), matching the new spec's "No live Slack message to update" scenario.

## 5. Settings UI

- [x] 5.1 Add "Auto turn off on inaction" toggle and "Max snoozes" number input to the per-tier settings section (Stale/Forgotten rows), with the number input disabled when the toggle is off (extracted the tier row into its own `TierRow` client component to hold the toggle's local state).
- [x] 5.2 Wire the new fields through the settings save/load path (`app/actions.ts` / settings form) alongside the existing `notify`/`askTurnOff`/`askDelete` fields. A disabled max-snoozes field submits nothing, so a missing value falls back to the `3` default rather than being read as `0`.

## 6. Verification

`npm run typecheck`, `npm test` (36/36 passing, including new coverage for `snoozeCount` diffing and the trigger-aware audit wording), and `npm run build` all pass. The five items below need a real Slack workspace + Capella org and are **not done** - nothing in this session ran a live Slack send or an actual Capella turn-off call, deliberately, since that would affect real infrastructure without a separate explicit go-ahead.

- [ ] 6.1 Manually exercise: enable auto-turn-off for a test tier with a short expiry, let a request expire with no response, confirm the cluster gets an `approved-turnoff` decision and the owner-facing message updates, and reconciliation turns it off within one pass.
- [ ] 6.2 Manually exercise: set `maxSnoozes` to 1, snooze once, then attempt a second snooze - confirm the modal doesn't open and auto-turnoff fires instead.
- [ ] 6.3 Manually exercise: confirm a snooze-cycle resume does not reset `snoozeCount`, but a genuine tier transition does.
- [ ] 6.4 Manually exercise: confirm the reconciliation loop's completion message appears for performed, skipped, and failed outcomes on both an owner-clicked and an auto-triggered approval.
- [ ] 6.5 Confirm existing installs with `autoTurnOffOnInaction` unset/false see no behavior change (expiry still lands on `"expired"`, snoozing remains unlimited).
