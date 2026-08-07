## Why

The current four-tier model ("New", "Established", "Stale", "Forgotten") gives every cluster a free pass on age alone for its first `staleDays` days - activity is never even checked until a cluster is already old enough to be Stale or Forgotten. A cluster created and immediately abandoned looks identical to a genuinely active one for that whole window, which is backwards for a tool whose purpose is catching unused clusters as soon as possible. Separately, every age threshold is day-granular, so nothing shorter than a day can ever be expressed or detected.

## What Changes

- **BREAKING**: Collapse "New" and "Established" into a single "In Use" tier, determined by evidence of use (recent real activity, or a cluster's own creation date standing in for activity when no real signal exists yet - already how `sync.ts` seeds `lastActivityAt` for a cluster with none) checked from the moment a cluster is first synced, not only once it's already old. `AgeStatus` becomes `"In Use" | "Stale" | "Forgotten"`.
- **BREAKING**: Remove `newDays`, `staleDays`, and `inactivityGraceDays` as separate settings; replace with a single `activityGraceHours` (how fresh evidence of use must be to count as "In Use") and rename `forgottenDays` to `forgottenHours` (how long with no evidence before a cluster escalates from "Stale" to "Forgotten"). Both are hour-granular, not day-granular.
- "In Use" stays hardcoded non-configurable for notifications, the same protection "New" has today - it is not offered as a notify/ask-turn-off/ask-delete tier. Only "Stale" and "Forgotten" are configurable, down from today's "Established", "Stale", "Forgotten".
- The single ordering constraint `activityGraceHours < forgottenHours` replaces today's three-way `newDays < staleDays < forgottenDays`.
- Existing settings migrate on read: `forgottenHours = forgottenDays * 24`, `activityGraceHours = inactivityGraceDays * 24`. `newDays` and `staleDays` have no equivalent in the new model and are discarded. Any existing per-tier notification config for "Established" is discarded (no destination tier to carry it into, since "In Use" isn't configurable).
- Dashboard age-status badges and the quick-filter row drop from four options to three.
- Out of scope: `retentionDays`, `consentExpiryDays`, `consentReminderMax`, and `syncIntervalHours` stay exactly as they are (days/hours respectively) - this change only touches the age-tier thresholds, not the consent-cycle or sync-cadence settings.

## Capabilities

### Modified Capabilities
- `cluster-age-status`: the tier model itself - three tiers instead of four, activity-based determination from the first sync instead of only as a late rescue, hour-granular thresholds instead of day-granular.
- `cluster-consent-notifications`: per-tier notification configuration now excludes "In Use" instead of "New", and covers "Stale"/"Forgotten" instead of "Established"/"Stale"/"Forgotten".
- `dashboard-settings`: the settings page's threshold fields, their validation, and the per-tier notification configuration list all change to match.

## Impact

- `src/lib/ageStatus.ts`: `computeAgeStatus` rewritten around a single activity-recency check plus a Stale/Forgotten age split.
- `src/lib/notifications.ts`: `computeRecordAgeStatus` switches from day-based to hour-based age; `NotifiableAgeStatus`/`NOTIFIABLE_TIERS` shrink to `"Stale" | "Forgotten"`.
- `src/lib/format.ts`: new `ageHoursBetween` helper; `formatAge` needs hour-aware display for sub-day ages so the visible age doesn't contradict an already-Stale badge.
- `src/types.ts`: `AgeStatus`, `Settings` (new/renamed threshold fields), `NotifiableAgeStatus`, `DEFAULT_SETTINGS`, `DEFAULT_NOTIFICATIONS_BY_TIER`.
- `src/lib/settings.ts`: `validateSettings` field/ordering changes; one-time migration of legacy day-based fields on read.
- `app/page.tsx`, `app/components/ClusterTable.tsx`: badge colors/labels, quick-filter buttons.
- `app/settings/page.tsx`, `app/settings/NotificationsEditor.tsx`: threshold fields (renamed, hour-labeled), per-tier notification list.
- `src/lib/slack.ts`: any consent-message copy referencing `staleDays`/`forgottenDays`/day-based age needs updating to the new fields.
