## Why

The "Age Status" concept and its "In Use" / "Stale" / "Forgotten" tier names overclaim what the system actually observes: `computeAgeStatus` only knows whether a discrete signal (an audit-log event, a `modifiedAt` change, or a config-fingerprint diff) has occurred recently — it has no visibility into real database usage. "Forgotten" reads as a judgment about neglect, and pairing it with an unrelated "Status" (Capella's own operational state, e.g. "Healthy") in the same row confuses operators into thinking the two are related or contradictory, when they're orthogonal axes. Renaming the concept to "Recency" and its tiers to "Fresh" / "Aging" / "Old" describes only what is actually measured — how recently a signal was last observed — without claiming knowledge of usage or neglect.

## What Changes

- Rename the `AgeStatus` type and concept to `Recency` throughout the codebase (types, functions, DB columns, UI, Slack copy). **BREAKING**: the persisted tier strings change, requiring a data migration for existing rows.
- Rename tier values: "In Use" → "Fresh", "Stale" → "Aging", "Forgotten" → "Old".
- Rename the UI column header "Age Status" to "Recency" (`app/components/ClusterTable.tsx`).
- Update Slack copy ("Usage status: *In Use*" etc.) to use the new tier names.
- Add a data migration that rewrites existing `lastNotifiedAgeStatus` values and the `tier` CHECK-constrained table's rows from the old strings to the new ones, and updates the `CHECK (tier IN ('Stale', 'Forgotten'))` constraint to the new allowed values.
- Update all delta-affected specs (`cluster-age-status`, `cluster-consent-notifications`, `cluster-dashboard-ui`, `dashboard-settings`) to reference "Recency" / "Fresh" / "Aging" / "Old" instead of the old terms.
- Leave `ClusterConfig.status` (the Capella operational state, e.g. "healthy"/"turnedOff") and its "Status" UI label completely unchanged — it mirrors Capella's own API naming and is not part of this rename.
- No behavior change: thresholds (`activityGraceHours`, `forgottenHours`), tiering logic, and notification rules are unchanged — this is a naming/data-migration change only.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `cluster-age-status`: the three age-status tiers are renamed "In Use"/"Stale"/"Forgotten" → "Fresh"/"Aging"/"Old", and the concept itself is renamed "age status" → "recency".
- `cluster-consent-notifications`: all references to age-status tier names ("In Use", "Stale", "Forgotten") in notification configuration and copy update to the new tier names ("Fresh", "Aging", "Old").
- `cluster-dashboard-ui`: the "Age Status" column header, badge, and quick-filter labels are renamed to "Recency" / "Fresh" / "Aging" / "Old".
- `dashboard-settings`: per-tier notification settings reference the new tier names ("Fresh", "Aging", "Old") instead of the old ones.
- `theme-preference`: the semantic-status-colors requirement's list of status kinds and its example scenario reference "recency" / "Old" instead of "age status" / "Forgotten".

## Impact

- **Code**: `src/types.ts` (`AgeStatus` type and derived types), `src/lib/ageStatus.ts`, `src/lib/notifications.ts`, `src/lib/settings.ts`, `src/lib/slack.ts`, `src/lib/slackBot.ts`, `src/lib/reconciliation.ts`, `src/lib/store.ts`, `app/components/ClusterTable.tsx`.
- **Database**: `src/lib/db.ts` — `lastNotifiedAgeStatus` column values and the `tier TEXT PRIMARY KEY CHECK (tier IN ('Stale', 'Forgotten'))` constraint both require a migration rewriting old tier strings to new ones, respecting this repo's schema-migration guard rails.
- **Tests**: ~10 test files assert on the literal old tier strings and need updating: `ageStatus.test.ts`, `notifications.helpers.test.ts`, `slack.test.ts`, `reconciliation.test.ts`, `sync.integration.test.ts`, `consent.integration.test.ts`, `manualActions.test.ts`, `db.migration.test.ts`, `store.roundtrip.test.ts`.
- **Specs**: `openspec/specs/cluster-age-status/spec.md` and its cross-referencing specs (`cluster-consent-notifications`, `cluster-dashboard-ui`, `dashboard-settings`) need their requirement text updated to the new terminology. `theme-preference/spec.md` has one incidental mention of "Forgotten" age status as an example that should also be updated for consistency.
- **No behavior change**: tiering thresholds, computation logic, and notification rules are unaffected.
