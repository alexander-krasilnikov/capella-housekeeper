## Context

See proposal.md - Why. Relevant existing mechanics this design builds on rather than replaces:

- `applyConsentNotifications` (`src/lib/notifications.ts`) already owns tier-transition detection, reminder spacing, and expiry detection, mutating `ClusterRecord` in place once per sync cycle.
- The reconciliation loop (`src/lib/reconciliation.ts`) already acts on any record with `consentStatus` of `approved-turnoff`/`approved-delete`, re-verifying the tier hasn't changed since `consentTierAtDecision` was set, independent of *how* that status got set - a Slack click (`slackBot.ts`) and this change's new automatic path both just write the same two fields.
- `ClusterRecord`'s existing consent fields (`consentStatus`, `consentCycleStartedAt`, `remindersSent`, `consentTierAtDecision`, `slackChannelId`/`slackMessageTs`) all reset to a blank slate on a genuine tier transition, and `remindersSent`/`consentTierAtDecision`/`actionOutcome` (but not `consentCycleStartedAt`, which restarts) reset again each time a snoozed cycle resumes. This second reset is precisely what makes today's snoozing unlimited - nothing survives it to count against.

## Goals / Non-Goals

**Goals:**
- Reuse the reconciliation loop as the single place a Capella turn-off call is ever made, for both owner-clicked and system-triggered approvals.
- Make the new behavior strictly per-tier opt-in, defaulting to today's exact behavior.
- Close the unlimited-snoozing loophole with a counter that survives a snooze-cycle resume and resets only on a real tier change.

**Non-Goals:**
- Auto-delete. Automatic action is turn-off only, per proposal.md.
- Notifying owners about manual dashboard actions (`manualActions.ts`) - that path is synchronous and already returns its result directly to the operator who clicked it in-app; it doesn't go through consent or reconciliation at all.
- Changing the re-verification safety check itself - it already applies uniformly regardless of who/what set `approved-turnoff`.

## Decisions

**Auto-turn-off writes the same fields a Slack click writes, and nothing else.** Both `applyConsentNotifications` (on expiry) and the Slack snooze handler (on cap exceeded) will, when eligible, set `consentStatus = "approved-turnoff"` and `consentTierAtDecision = tier` directly - exactly what `handleConsentAction` does today for a manual click - rather than teaching the reconciliation loop a new status or a new code path. Alternative considered: a distinct status like `"auto-approved-turnoff"` to make the origin explicit in the data model. Rejected - the origin doesn't change how reconciliation should behave (same re-verify-then-act), and the two places that produce it already know their own context well enough to send the right owner-facing message at the moment of the decision, so nothing downstream needs to distinguish them from the stored status alone. The one place origin does matter for the record - the audit log - is handled by a new `HistoryTrigger` value instead (see below).

**Eligibility gating: `askTurnOff` and not-already-off, checked at the moment of the automatic decision.** Auto-turn-off only fires when the tier's `askTurnOff` is also true (the system won't do something automatically that the tier isn't even configured to ask a human for) and the cluster isn't already off (nothing to do). Alternative considered: making auto-turn-off independent of `askTurnOff`, so an operator could suppress the manual ask but still want automatic cleanup. Rejected as a footgun - a tier with `askTurnOff: false` reads as "don't touch this tier's power state," and having a separate toggle silently override that reads as surprising; an operator who wants both just enables both.

**Snooze cap enforcement point: at the Slack button handler, before opening the modal.** `slackBot.ts`'s `consent_snooze` action handler will look up the cluster's current tier and snooze count and, if at the cap, skip `views.open` entirely, instead calling the same auto-turn-off-decision path and showing an ephemeral message explaining why. Alternative considered: let the modal open and reject on submission. Rejected - it's a worse experience (the owner fills out a justification for a snooze that was never going to happen) for no benefit; refusing up front is both more honest and simpler.

**New persisted field: `snoozeCount` on `ClusterRecord`.** Incremented by `handleSnoozeSubmission` on every recorded snooze. Reset to 0 only in the tier-transition branch of `applyConsentNotifications` (the same block that already zeroes `remindersSent`), and explicitly *not* reset in the snooze-resume branch - that omission is the entire fix for the unlimited-snoozing loophole.

**New `HistoryTrigger` value: `"auto-turnoff-decision"`.** Distinguishes an automatically-recorded approval from a human's `"slack-decision"` in the audit log, without needing a new `ConsentStatus`. `reconciliation.ts`'s own outcome-recording still uses its existing `"reconciliation"` trigger unchanged.

**Completion notification lives in `reconciliation.ts`, editing the existing live message.** `applyActionOutcome` gains a Slack call using the record's already-stored `slackChannelId`/`slackMessageTs` (the same `updateMessage` helper `notifications.ts` and `slackBot.ts` already use), sent after the outcome is written, for all three outcomes (performed/skipped/failed). If there's no live message on record (e.g. it was already superseded by other activity in the interim), the notification is skipped rather than sent somewhere out of context - per the new spec's "No live Slack message to update" scenario. Alternative considered: putting this notification in `notifications.ts` instead, keeping all Slack-sending code in one module. Rejected - `reconciliation.ts` is the only place that knows the actual outcome and already owns the write; routing back through another module to send a message about a write that module didn't make adds a hop for no benefit, and `reconciliation.ts` already imports what it needs (`readClusters`/`upsertClusters`) following the same "re-read fresh right before writing" discipline it already uses for `actionOutcome`.

**Messaging content changes are data-driven, not new copy paths.** `buildConsentMessage`'s "consequence of no response" line and `handleSnoozeSubmission`'s confirmation text both become conditional on the tier's `autoTurnOffOnInaction`/`maxSnoozes` settings and the record's current `snoozeCount`, rather than adding parallel message-building functions - the existing functions already take `settings` and the record.

## Risks / Trade-offs

- **Two code paths can now set `approved-turnoff` on the same field the reconciliation loop watches** (the existing Slack click, and this change's expiry/cap path) → mitigated by both going through the identical field-write shape reconciliation already handles uniformly; no new branching needed in `reconciliation.ts` itself.
- **An operator flips `autoTurnOffOnInaction` on for a tier with a low `maxSnoozes` and surprises owners who were used to unlimited snoozing** → mitigated by the messaging change making the real consequence explicit on every notification and snooze confirmation once enabled, and by defaulting the feature off.
- **Race between an owner's snooze click and a concurrent sync-cycle tier transition resetting `snoozeCount` to 0** → same class of concurrency already handled elsewhere in this codebase (e.g. `sync.ts`'s re-read-before-final-write comments); the Slack handler already re-reads the record fresh before acting, so a transition that lands first simply means the click now applies to a fresh cycle, which is correct.

## Migration Plan

Purely additive: new settings fields default to `autoTurnOffOnInaction: false` (existing tiers behave exactly as before), and `snoozeCount` defaults to `0` for existing records (backfilled lazily like other optional fields such as `lastNotifiedAgeStatus`, per existing precedent in `types.ts`). No data migration script needed. Rollback is deploying the prior version; no destructive schema change to undo.
