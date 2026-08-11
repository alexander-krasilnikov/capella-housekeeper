## 1. Action summary copy

- [x] 1.1 In `src/lib/slack.ts`, drop the `turnoff`/`delete` entries from `ACTION_EXPLANATIONS` (or remove the map entirely if `snooze` becomes its own constant) and make `ACTION_CONFIRM_SUMMARY` the single canonical one-line string for each, reused by both the confirm dialog and the message body.
- [x] 1.2 Tighten the `snooze` explanation to a one-line summary (no confirm dialog exists to defer detail to).
- [x] 1.3 Update `buildConsentMessage`'s "What each option means" block to render the one-line summaries instead of the old full-paragraph `ACTION_EXPLANATIONS` bullets.
- [x] 1.4 Confirm `confirmDialog`/`ACTION_CONFIRM_SUMMARY` usage for turn-off/delete is unaffected (still shows the same one-line summary it always has).

## 2. No-response notice

- [x] 2.1 Rewrite `describeNoResponseConsequence` to produce a single sentence covering reminder count, expiry period, and "no automatic action taken."
- [x] 2.2 Shorten the Forgotten-tier addendum to one short clause appended to that sentence, keeping the configured grace-period hour count.

## 3. Text fallback

- [x] 3.1 Change `buildConsentMessage`'s `text` construction to a short standalone string (heading + cluster name + org/project + tier), independent of the block/body line variables.

## 4. Verification

- [x] 4.1 Manually construct (or add a small script/test) sample messages for Stale and Forgotten tiers, with turnoff+delete+snooze and with only snooze offered, and read the rendered `blocks`/`text` to confirm the required no-response content (reminder count, expiry period, no-auto-action, Forgotten grace-period note) is still present.
- [x] 4.2 Confirm the turn-off/delete confirm dialogs still show their existing one-line summaries unchanged.
- [x] 4.3 Run the existing test suite (if any covers `src/lib/slack.ts`) and typecheck.
