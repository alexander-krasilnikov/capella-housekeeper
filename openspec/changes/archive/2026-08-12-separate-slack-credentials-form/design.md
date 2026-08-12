## Context

See proposal.md - Why. Today `app/settings/page.tsx` calls `readSettings()` once per page render and builds every settings section (including `NotificationsEditor`, which currently owns the Slack token fields) from that single snapshot. `SettingsShell` is a client component that only toggles which already-rendered section is visible - it never re-fetches. `saveNotificationsAction` (`app/actions.ts`) unconditionally writes `slackBotToken`/`slackAppToken` from whatever the form submits, so a stale page load's blank or outdated token values silently overwrite the live ones on any notification-preference save.

`saveCredentialsAction` already solves the equivalent problem for the dashboard password with `newPassword || settings.dashboardPassword` (blank submission = no change). This change applies the same shape to the Slack tokens, plus moves them out of the form that gets saved for unrelated reasons.

## Goals / Non-Goals

**Goals:**
- Make it structurally impossible for a per-tier notification preference save to touch the Slack tokens.
- Make a blank/stale token submission a no-op against the persisted value, closing the staleness window entirely rather than just shrinking it.
- Preserve the existing "Test connection" capability (test tokens currently in the form, saved or not).

**Non-Goals:**
- General settings-page staleness (e.g. a stale Orgs tab overwriting orgs added elsewhere) - out of scope; those forms only submit fields they own and don't carry a secret whose blank state is otherwise meaningful, so the risk profile is different. Not addressed here.
- Concurrent-write locking for `settings.json` (`writeSettings` has no mutex, unlike `store.ts`'s `serialize()` for clusters/history). A true concurrent-write race is a separate, lower-likelihood problem from the staleness bug this change fixes; not addressed here.

## Decisions

**1. New "Slack credentials" settings section, own form and action.**
`NotificationsEditor.tsx` keeps per-tier notification preferences, `consentReminderMax`, `consentExpiryDays`, and `snoozeDayOptionsCsv`. A new `SlackCredentialsEditor.tsx` client component owns the bot/app token fields, the masked/reveal toggle, and the "Test connection" button (moved verbatim - it already reads tokens from its own form via `FormData`, so it works unchanged once it's the only thing in that form). `page.tsx` adds a new section (e.g. id `"slack-credentials"`) alongside the existing seven, passing `settings.slackBotToken`/`slackAppToken` to it instead of to `NotificationsEditor`. A new `saveSlackCredentialsAction` in `app/actions.ts` owns writing just the two token fields.

Alternative considered: keep one form, but gate which fields get written based on which submit button was clicked (two `<button formAction=...>` in the same `<form>`). Rejected - two actions reading from one shared `FormData` is more state to reason about for no real benefit, and the spec requirement that saving one SHALL NOT touch the other is easiest to guarantee when they're separate `<form>` elements with separate server actions, not shared form-level plumbing.

**2. Blank token field means "keep current," matching `saveCredentialsAction`'s password handling exactly.**
`saveSlackCredentialsAction` reads the submitted token; if the trimmed value is empty, it omits that key from the `writeSettings` partial entirely (rather than passing the old value through explicitly) - `writeSettings` already merges the partial onto current settings, so omitting the key is sufficient and avoids a redundant read-before-write in the action itself. This closes the staleness window structurally: no code path exists anymore where a blank field can persist.

**3. Explicit "Clear" control per token field, since blank-preserves-current removes the previous (accidental) way to clear one.**
Before this change, clearing a token meant blanking the field and saving - exactly the footgun being removed. `SlackCredentialsEditor` adds a small "Clear" button next to each token's Show/Hide toggle that sets a hidden per-field input (e.g. `clearSlackBotToken=1`) when clicked. `saveSlackCredentialsAction` checks that flag first: if set, the token is explicitly written as `""`; otherwise a blank submitted value is ignored per Decision 2. This keeps "disable Slack notifications entirely" (a real, already-supported state - see `notifications.ts`'s `if (!settings.slackBotToken) return`) reachable through the UI without reintroducing the accidental-wipe path.

## Risks / Trade-offs

- **[Risk]** An operator who genuinely wants to clear a token might just blank the field and save, as the old UI trained them to do, and be confused when nothing happens. → **Mitigation**: the "Clear" button is the labeled, discoverable way to do this now; the hint text under each field is updated to say so.
- **[Risk]** Moving "Test connection" to a new component could regress it if the move isn't exact. → **Mitigation**: `runTest()`'s logic (read `FormData` from the enclosing form ref, call `testSlackConnectionAction`) is copied unchanged - it already only depends on its own form's fields, not on anything specific to `NotificationsEditor`.

## Migration Plan

No data migration - `settings.json`'s shape is unchanged (`slackBotToken`/`slackAppToken` remain top-level string fields). This only changes which UI component/action reads and writes them and the semantics of a blank submission. Rollback is a plain revert of the touched files.
