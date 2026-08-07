## 1. Types

- [x] 1.1 In `src/types.ts`: change `AgeStatus` to `"In Use" | "Stale" | "Forgotten"`.
- [x] 1.2 Change `NotifiableAgeStatus` to `Exclude<AgeStatus, "In Use">` (its comment should explain why "In Use" is excluded, same reasoning "New" carried before).
- [x] 1.3 Replace `newDays`, `staleDays`, `forgottenDays`, `inactivityGraceDays` on `Settings` with `activityGraceHours` and `forgottenHours`.
- [x] 1.4 Update `DEFAULT_SETTINGS` and `DEFAULT_NOTIFICATIONS_BY_TIER` (`Established` key removed, only `Stale`/`Forgotten` remain) for the new fields.

## 2. Core age-status computation

- [x] 2.1 Add `ageHoursBetween(fromMs, nowMs)` to `src/lib/format.ts` (`Math.floor(ms / HOUR_MS)`, alongside `ageDaysBetween`, not replacing it).
- [x] 2.2 Update `formatAge` to show real hours for ages under a day (e.g. `"3h"`, `"18h"`) instead of the current fixed `"< 1 day"` string; keep day-granular display at and above 24h as today.
- [x] 2.3 Rewrite `computeAgeStatus` in `src/lib/ageStatus.ts`: `In Use` whenever `lastActivitySource !== "unknown" && lastActivityMs !== null && ageHoursBetween(lastActivityMs, nowMs) <= activityGraceHours`; otherwise `Stale` if age-since-creation (in hours) is less than `forgottenHours`, else `Forgotten`.
- [x] 2.4 Update `computeRecordAgeStatus` in `src/lib/notifications.ts` to compute age in hours (via `ageHoursBetween`) instead of days, matching the new `computeAgeStatus` signature.
- [x] 2.5 Update the call site in `app/page.tsx` that builds `ageStatus` for each row to pass hours instead of days.

## 3. Settings validation and migration

- [x] 3.1 In `src/lib/settings.ts`'s `validateSettings`: require `activityGraceHours`/`forgottenHours` as positive integers and `activityGraceHours < forgottenHours`, replacing the old three-way check.
- [x] 3.2 Add one-time migration in the `readSettings` defaults-merge path: derive `forgottenHours = forgottenDays * 24` and `activityGraceHours = inactivityGraceDays * 24` from legacy fields when the new fields are absent; discard `newDays`/`staleDays`.
- [x] 3.3 Migrate `notificationsByTier`: drop any legacy `"Established"` entry, keep `"Stale"`/`"Forgotten"` as-is.
- [x] 3.4 Update `app/actions.ts`'s `saveSettingsAction`/`saveNotificationsAction` field lists (`INT_SETTINGS_FIELDS`, `NOTIFIABLE_TIERS`) for the renamed fields and shrunk tier list.

## 4. Settings page UI

- [x] 4.1 In `app/settings/page.tsx`: replace the four threshold `NumberField`s with two (`activityGraceHours`, `forgottenHours`), hour-labeled, with hint text stating the `activityGraceHours < forgottenHours` relationship directly (addressing the earlier finding that this constraint was invisible in the panel).
- [x] 4.2 Update `app/settings/NotificationsEditor.tsx`'s tier list to `Stale`/`Forgotten` only.

## 5. Notification copy

- [x] 5.1 In `src/lib/slack.ts`'s `describeTier`: drop the `"Established"` case, update `"Stale"`/`"Forgotten"` cases to reference `activityGraceHours`/`forgottenHours` in hours (not converted to days).
- [x] 5.2 Update `describeLastActivity` in `src/lib/slack.ts` to show hours for sub-day recency, matching `formatAge`'s new behavior.
- [x] 5.3 Update the `cluster-consent-notifications`-spec-covered "no-response notice" scenario's wording if any literal Slack copy hardcodes tier names beyond what's already covered above. (Also fixed `src/lib/notifications.ts`'s three literal `"New"` tier comparisons to `"In Use"` - not called out explicitly in this task, but required for the `NotifiableAgeStatus` type change to compile and behave correctly.)

## 6. Dashboard UI

- [x] 6.1 In `app/components/ClusterTable.tsx`: update `AGE_STATUS_STYLE`/`AGE_STATUS_OPTIONS` and the age-status quick-filter row for the three-tier list (drop "New"/"Established", add "In Use").
- [x] 6.2 Verify the row-detail panel and any other place `AgeStatus` values are rendered or compared for the old four-tier list. (Repo-wide grep confirms the only remaining `newDays`/`staleDays`/`forgottenDays`/`inactivityGraceDays`/`"Established"` references are the deliberate migration code in `settings.ts`.)

## 7. Verification

- [x] 7.1 Run `npm run typecheck` and `npm run build`.
- [x] 7.2 Verify migration logic (`newDays`/`staleDays`/`forgottenDays`/`inactivityGraceDays` -> `activityGraceHours`/`forgottenHours`, `Established` dropped from `notificationsByTier`) against an isolated reimplementation of `migrateLegacyAgeSettings` - not run against the live app or `data/settings.json` (real Capella credentials), per the same caution applied to the manual-cluster-actions change. All checks pass.
- [x] 7.3 Verify a freshly-created cluster (proxied activity = createdAt) computes "In Use" while within `activityGraceHours` and "Stale" once past it, via an isolated reimplementation of `computeAgeStatus` - pure-function check, no live cluster needed. Passes.
- [x] 7.4 Verify a cluster with real recent activity computes "In Use" regardless of raw age, and one with old/unknown activity reaches "Forgotten" once past `forgottenHours` - same isolated check. Passes.
- [x] 7.5 Verify the ordering/positivity validation (`activityGraceHours >= forgottenHours` rejected, zero/negative rejected) against an isolated reimplementation of the relevant `validateSettings` checks. Passes. Did not click through the live settings UI or per-tier notification list - see note on 7.2.
- [x] 7.6 Run `openspec validate collapse-age-status-tiers --strict` and fix any reported issues.
