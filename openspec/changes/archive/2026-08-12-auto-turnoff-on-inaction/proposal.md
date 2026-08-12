## Why

Today, a consent request that goes unanswered simply "expires" with no action taken, and an owner can snooze a request indefinitely — every snooze, once it ends, resets the reminder count and restarts the full expiry window from zero, so there is no ceiling on how long a forgotten cluster can keep running. Separately, once an owner approves a turn-off or delete in Slack, the reconciliation loop performs it up to 5 minutes later but never tells the owner what actually happened (performed, skipped because the cluster became active again, or failed) — the owner is left with only the initial "will be turned off after a final check" message. This change closes both gaps: it gives operators a per-tier option to auto-turn-off a cluster after prolonged inaction or after its snooze allowance is exhausted, and it makes the reconciliation loop report back to the owner once an approved action (whether owner-clicked or system-triggered) is actually resolved.

## What Changes

- Add two per-tier settings (Stale, Forgotten independently): `autoTurnOffOnInaction` (default off, preserving today's behavior) and `maxSnoozes` (default `3`, only enforced when the former is on).
- When `autoTurnOffOnInaction` is on for a tier and a pending request expires with no decision, the system now records an approved-turnoff (as if the owner had clicked it) instead of merely marking the request expired, and notifies the owner that this happened automatically.
- When `autoTurnOffOnInaction` is on and an owner tries to snooze past that tier's `maxSnoozes` count, the snooze is refused at the point of the click (no modal opens) and the same automatic-turnoff path fires immediately, with an explanatory message to the owner.
- Auto-turn-off only ever turns a cluster off, never deletes it, and only applies when the tier's `askTurnOff` option is also enabled and the cluster isn't already off — it never does something the tier wasn't already configured to ask a human for.
- Consent notifications and snooze confirmations now state the remaining snooze allowance when `autoTurnOffOnInaction` is on for that tier, and the "consequence of no response" text reflects the real consequence (auto turn-off vs. no action) per tier.
- The reconciliation loop notifies the cluster's owner via Slack once an approved action (owner-clicked or auto-triggered) is resolved: performed, skipped (cluster recovered before action), or failed (will retry).
- **BREAKING**: none — new settings default to today's exact behavior (`autoTurnOffOnInaction: false`), so existing installs see no behavior change until an operator opts in per tier.

## Capabilities

### New Capabilities
(none - this extends two existing capabilities)

### Modified Capabilities
- `cluster-consent-notifications`: adds per-tier auto-turn-off-on-inaction and a per-tier snooze cap, changes what happens at expiry and at a refused snooze, and changes the no-response/snooze-remaining messaging to reflect the configured consequence.
- `cluster-lifecycle-actions`: adds an owner-facing completion notification once the reconciliation loop resolves an approved action, and recognizes system-triggered (not just owner-clicked) approvals as valid input to the existing re-verify-then-act flow.

## Impact

- `src/types.ts` - `TierNotificationConfig` gains `autoTurnOffOnInaction` and `maxSnoozes`; `ClusterRecord` gains a persisted snooze counter; `HistoryTrigger` gains a value for system-authored approvals.
- `src/lib/notifications.ts` - expiry handling branches on the new setting; message-building states the remaining snooze count and the real no-response consequence.
- `src/lib/slackBot.ts` - the snooze button handler enforces the cap before opening the modal.
- `src/lib/reconciliation.ts` - gains a Slack notification step after resolving each action's outcome; no change to the re-verification safety check itself, which already applies uniformly to any `approved-turnoff`/`approved-delete` record regardless of how it got there.
- `app/*` (settings UI) - two new per-tier controls.
