## Context

`computeAgeStatus` (`src/lib/ageStatus.ts:9-33`) today only ever consults activity to *rescue* a cluster already old enough (by `staleDays`/`forgottenDays`) to be Stale or Forgotten back to "Established" - a cluster younger than `staleDays` is "New" or "Established" purely by age, no activity check at all. Separately, `sync.ts`'s `resolveActivityFromSyncObservation` (`src/lib/sync.ts:85-99`) already seeds `lastActivityAt = createdAt` (source `"sync-observed"`) for a cluster with no real Activity Log or `audit.modifiedAt` signal, and - critically - leaves it pinned there on later syncs as long as the cluster's config fingerprint hasn't changed. That existing seed is what makes the new model possible without a separate creation-grace setting: a never-touched cluster's "last activity" already *is* its creation date, growing stale at exactly the same rate the cluster itself ages.

Every current age threshold (`newDays`, `staleDays`, `forgottenDays`, `inactivityGraceDays`) is day-granular via `ageDaysBetween` (`src/lib/format.ts:3-5`), which does `Math.floor(ms / DAY_MS)` - two clusters 2 hours and 23 hours old are currently indistinguishable to every comparison in the system.

See proposal.md for motivation; see the three modified specs for the behavior contract.

## Goals / Non-Goals

**Goals:**
- "In Use" requires evidence (real or creation-proxied activity within `activityGraceHours`) from the first sync, not just as a rescue once a cluster is already old.
- Hour-granular thresholds for the two age-tier settings that remain, without requiring fractional input anywhere.
- Minimal settings surface: two thresholds (`activityGraceHours`, `forgottenHours`) instead of four, one ordering constraint instead of three-way.
- A safe, one-time migration of existing day-based settings that doesn't silently discard a customized threshold without a defensible equivalent.

**Non-Goals:**
- `retentionDays`, `consentExpiryDays`, `consentReminderMax`, `syncIntervalHours` are untouched - this is scoped to age-tier detection speed, not consent-cycle or sync-cadence timing.
- No change to `syncIntervalHours`'s own floor of 1 hour - detection latency stays bounded by however often sync actually runs, however fine the tier thresholds get.
- Not adding a "turn cluster back on" control, and not introducing any automatic (non-consent) action - this change only touches how a tier is *computed and labeled*, not what happens as a consequence of a tier.

## Decisions

**`computeAgeStatus` becomes activity-first, not age-first.**
```
heldByActivity = lastActivitySource !== "unknown"
              && lastActivityMs !== null
              && ageHoursBetween(lastActivityMs, nowMs) <= activityGraceHours

if (heldByActivity) return "In Use"
return ageHoursSinceCreation < forgottenHours ? "Stale" : "Forgotten"
```
`lastActivityMs` needs no special-casing for "never touched" - it's already creation-proxied by `sync.ts` before this function ever sees it. `ageHours` (age since creation) is now only consulted for the Stale/Forgotten split, not for the In-Use decision at all.

*Alternative considered*: a separate `creationGraceHours` alongside `activityGraceHours` (what was discussed before this simplification). Rejected once it was confirmed `sync.ts` already proxies a never-touched cluster's activity to its creation date - a second setting would just be redundant with what the existing proxy already provides for free.

**New `ageHoursBetween` in `src/lib/format.ts`, alongside (not replacing) `ageDaysBetween`.**
`Math.floor(ms / HOUR_MS)`, mirroring `ageDaysBetween`'s structure exactly. Used by `ageStatus.ts` and `notifications.ts`'s `computeRecordAgeStatus` for tier computation. `ageDaysBetween` stays as-is for everything out of scope: the dashboard's plain "Age" column base case, `retentionDays`, `consentExpiryDays`/reminder spacing.

**`formatAge` (`src/lib/format.ts:7-12`) gets hour-aware display for sub-day ages.**
Today anything under 24h renders as the string `"< 1 day"`. Once tiering can flip to Stale within hours, a cluster showing "< 1 day" while badged "Stale" reads as contradictory - the same class of inconsistency flagged when reviewing the settings panel earlier in this exploration. Show real hours below a day (e.g. `"3h"`, `"18h"`), day-granular above it exactly as today.

**"In Use" stays hardcoded-excluded from notification config**, same protection "New" has today (`NotifiableAgeStatus = Exclude<AgeStatus, "In Use">`). Explicit choice, not a default nobody considered: your current live settings have `askDelete: true` on "Established" - if "In Use" inherited that slot as configurable, a cluster could be asked about deletion while still within its creation grace, which is exactly what today's hardcoded "New" exclusion prevents. Carrying that protection forward under the new name preserves the existing guarantee rather than silently loosening it.

**Migration on read, in `src/lib/settings.ts`'s existing defaults-merge path** (same mechanism `readSettings` already uses for fields absent on older records):
- `forgottenHours = forgottenDays * 24` - one-to-one unit conversion, no ambiguity.
- `activityGraceHours = inactivityGraceDays * 24` - the closest existing analog to "how fresh must evidence be," since that's the field that already meant exactly that.
- `newDays` and `staleDays` are read and discarded - there's no equivalent slot for them in the new model.
- The `notificationsByTier` entry for `"Established"` is discarded. There's no destination tier to carry its `notify`/`askTurnOff`/`askDelete` values into, since "In Use" isn't configurable. This is a real, one-time loss of operator-set configuration, not a cosmetic rename - called out explicitly rather than silently dropped.

**Slack copy (`src/lib/slack.ts`) needs updating at every place it names `staleDays`/`forgottenDays`/`ageDays` in a tier description.**
`describeTier` (`slack.ts:58-72`) currently switches on all three notifiable tiers and interpolates `settings.staleDays`/`settings.forgottenDays`/`settings.inactivityGraceDays` directly into owner-facing sentences; it needs to drop the "Established" case entirely (never reached once "In Use" isn't notifiable) and reference `activityGraceHours`/`forgottenHours`. Recommend stating these plainly in hours in the message text (e.g. "past the 72-hour threshold") rather than converting back to a rounded day figure for display - a rounded conversion risks reading as a different number than what's actually configured. `describeLastActivity` (`slack.ts:98-104`) similarly age-describes in whole days ("3 days ago") - should gain the same sub-day hour phrasing as `formatAge` for the same consistency reason.

## Risks / Trade-offs

- **A cluster gets exactly one grace window, whether it's brand new or was previously active and went quiet** - no separate, longer leniency for "still being set up." This is the deliberate point of the change (evidence required from day 0), but it means an aggressively short `activityGraceHours` gives a freshly-created cluster very little room before it's flagged. Worth choosing that number deliberately rather than carrying forward whatever `inactivityGraceDays` happened to be.
- **Migration silently drops the "Established" notification config and the `newDays`/`staleDays` values** with no way to recover them short of re-entering settings from scratch. Acceptable given there's no equivalent slot for either in the new model, but worth surfacing to whoever operates this dashboard rather than only being discoverable by noticing the settings page looks different after an upgrade.
- **Proxied ("just created, no real signal") and genuinely-detected ("we saw a config change") activity share the same `lastActivitySource: "sync-observed"` label** (a pre-existing property of `sync.ts`, not introduced by this change) - now load-bearing for tiering rather than just a display nicety. Any future work that wants to tell these apart (e.g. to phrase a Slack message more precisely) will need `sync.ts` itself to distinguish them, which is out of scope here.
