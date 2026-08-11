## Why

The Slack consent DM (`buildConsentMessage` in `src/lib/slack.ts`) is a wall of text: a full paragraph explaining each offered action plus a full paragraph on reminder/expiry consequences, totaling roughly 1,400 characters of body text before the buttons even appear. This buries the actual decision an owner needs to make. The turn-off/delete buttons already carry a native Slack confirmation dialog with a one-line summary (`ACTION_CONFIRM_SUMMARY`) as their mis-click guard - that short-form text is the natural place for full detail to live, since it's shown at the exact moment the decision is made, rather than duplicating it upfront in the message body.

## What Changes

- The message body's per-action list shows a one-line summary for each offered action (turn off, delete, snooze) instead of a full explanatory paragraph.
- For turn off and delete specifically, the full explanation moves out of the message body entirely - it is stated once, in the confirmation dialog shown before the decision is recorded, not duplicated in the body.
- The no-response consequence is stated as a single consolidated sentence (plus, for "Forgotten", one additional short clause) instead of two full sentences. The same required content - reminder count, expiry period, "no automatic action", and the Forgotten-specific grace-period note - is retained, just stated more tersely.
- The plain-text `text` fallback (used for push notifications/previews) is no longer a full concatenation of every body line; it's shortened to the heading, cluster, and tier - just enough to identify the request in a notification preview.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `cluster-consent-notifications`: the notification's action summaries and no-response notice become more concise, and full turn-off/delete explanations move from the message body to the confirmation dialog only.

## Impact

- `src/lib/slack.ts`: `buildConsentMessage` (action-summary text, no-response text, `text` fallback construction). `ACTION_EXPLANATIONS`/`ACTION_CONFIRM_SUMMARY` consolidate so there's one short-form string per action instead of a long-form and a short-form.
- No changes to `src/lib/slackBot.ts`, `src/lib/notifications.ts`, or persisted `ClusterRecord`/`Settings` fields - this is message-content only, not a lifecycle or state change.
