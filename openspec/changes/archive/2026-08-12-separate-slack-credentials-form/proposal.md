## Why

The settings page renders once per page load, so the Notifications form's Slack bot/app token fields carry whatever value was current at that moment - not the live value. Saving that form for any reason (e.g. flipping a per-tier notification checkbox) resubmits those stale token values and overwrites whatever is currently persisted, including wiping real tokens down to blank if the page was loaded before they were last set. This has already happened more than once. `saveCredentialsAction` avoids the equivalent problem for the dashboard password (`newPassword || settings.dashboardPassword` - blank means "keep current"); the Slack token fields never got the same treatment and are bundled into a form that's saved far more often than tokens actually change.

## What Changes

- Move the Slack bot token and app-level token fields, and the "Test connection" action, out of the per-tier notification settings form into their own settings section with its own save action.
- The per-tier notification preferences form (tiers, reminder max, expiry days, snooze day options) no longer reads or writes the Slack tokens at all.
- Submitting a blank token field in the new Slack credentials form leaves the corresponding stored token unchanged rather than clearing it - clearing a token requires explicitly editing the field to empty is no longer sufficient; an explicit action (e.g. an unmask-and-clear step) is needed. (Finalized in design.md.)

## Capabilities

### Modified Capabilities
- `dashboard-settings`: Slack bot/app tokens move to their own settings section and save action, independent of per-tier notification preferences; a blank token submission no longer clears a previously saved token.

## Impact

- `app/settings/NotificationsEditor.tsx`: drop token fields and the "Test connection" control.
- `app/settings/page.tsx`: add a new settings section (e.g. "Slack credentials") hosting the token fields and test-connection control; pass tokens to it instead of to `NotificationsEditor`.
- `app/actions.ts`: `saveNotificationsAction` drops `slackBotToken`/`slackAppToken` from its written partial; a new `saveSlackCredentialsAction` (or similar) owns them, with blank-means-unchanged semantics.
- `openspec/specs/dashboard-settings/spec.md`: requirement covering Slack token configuration updated to reflect the separate form and blank-preserves-current behavior.
