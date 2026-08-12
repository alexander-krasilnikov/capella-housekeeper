## 1. Slack credentials component

- [x] 1.1 Create `app/settings/SlackCredentialsEditor.tsx`: move the `MaskedTokenField` component, the bot/app token fields, and the "Test connection" button + `runTest()`/`testResult` logic out of `NotificationsEditor.tsx` into this new client component.
- [x] 1.2 Add a "Clear" control next to each token field's Show/Hide toggle, wired to a hidden input (e.g. `clearSlackBotToken` / `clearSlackAppToken`) set to `1` when clicked.
- [x] 1.3 Update each token field's hint text to note that leaving it blank on save keeps the current token, and that "Clear" is the way to remove it.

## 2. Notifications component

- [x] 2.1 Remove `slackBotToken`/`slackAppToken` props, the token fields, and the "Test connection" block from `NotificationsEditor.tsx`, leaving per-tier notifications, max reminders, expiry, and snooze day options.

## 3. Settings page wiring

- [x] 3.1 In `app/settings/page.tsx`, add a new section (e.g. id `"slack-credentials"`, label "Slack credentials") rendering `SlackCredentialsEditor`, passing `settings.slackBotToken`/`settings.slackAppToken`.
- [x] 3.2 Stop passing `slackBotToken`/`slackAppToken` to `NotificationsEditor` in `page.tsx`.
- [x] 3.3 Update `resolveInitialSection`'s `SHARED_SECTION_IDS` / banner wiring as needed so save/error redirects for the new section land back on it (mirror how `"notifications"` is handled today).

## 4. Server actions

- [x] 4.1 Add `saveSlackCredentialsAction` in `app/actions.ts`: for each of `slackBotToken`/`slackAppToken`, if its `clear...` flag is set, write `""`; else if the submitted value (trimmed) is non-empty, write it; else omit the key from the `writeSettings` partial entirely.
- [x] 4.2 Remove `slackBotToken`/`slackAppToken` from the partial built in `saveNotificationsAction`.
- [x] 4.3 Redirect `saveSlackCredentialsAction` back to `/settings?section=slack-credentials&{saved=1|error=...}`, matching the existing pattern used by `saveNotificationsAction`.

## 5. Tests

- [x] 5.1 Add/adjust tests (or manual verification steps, per this project's existing test coverage for settings actions) confirming: saving notification preferences with a blank/stale token field does not change the persisted token; saving Slack credentials with a blank field preserves the current token; saving Slack credentials with "Clear" checked writes `""`; saving Slack credentials with a new value writes that value. (`app/actions.ts` has no automated-test path - it imports via `@/lib/*` aliases that `vitest.config.mts` doesn't resolve, and no prior test covers it either - so this was covered by the browser-driven manual verification in section 6 instead.)

## 6. Manual verification

- [x] 6.1 Start the dev server, open Settings, set both Slack tokens, save, confirm `data/settings.json` has them.
- [x] 6.2 Without reloading, switch to Notifications, toggle a checkbox, save; confirm both tokens are still present in `data/settings.json`.
- [x] 6.3 Reload Settings, go to Slack credentials, confirm the fields show the persisted tokens; click Test connection and confirm it still works.
- [x] 6.4 Use "Clear" on one token, save, confirm it's now `""` in `data/settings.json` and the other token is untouched.
