## 1. Schema migration and fixtures

- [x] 1.1 Freeze `src/test/__fixtures__/schema-v2.sql` from the current (pre-rename) schema, mirroring `schema-v1.sql`.
- [x] 1.2 Generate `src/test/__fixtures__/db-v2.sqlite3` (plus its generator script, mirroring `generate-db-v1.mjs`) with representative rows carrying the old tier strings (e.g. `consentTierAtDecision: "Stale"`, `lastNotifiedAgeStatus: "Forgotten"`), so the migration test actually exercises the rewrite.
- [x] 1.3 Bump `SCHEMA_VERSION` to 3 in `src/lib/db.ts`.
- [x] 1.4 Add the `MIGRATIONS[2]` entry: `ALTER TABLE ... RENAME COLUMN lastNotifiedAgeStatus TO lastNotifiedRecency` on `clusters` and `history`; `UPDATE` statements rewriting `lastNotifiedRecency` and `consentTierAtDecision` values ("In Use"→"Fresh", "Stale"→"Aging", "Forgotten"→"Old") on both tables; the `tier_notifications` table rebuild (new table with `CHECK (tier IN ('Aging', 'Old'))`, copy remapped rows, drop old, rename new into place) - per design.md Decisions.
- [x] 1.5 Update `db.migration.test.ts`: add a schema-v2 upgrade path (parallel to the existing schema-v1 blocks), and update the "existing data survives an upgrade" assertions that currently expect old tier strings (`"Stale"`) to expect the new ones (`"Aging"`) and the renamed column.

## 2. Core types and logic

- [x] 2.1 Rename `AgeStatus` type to `Recency` in `src/types.ts`, updating its literal values to `"Fresh" | "Aging" | "Old"`, and rename derived types `NotifiableAgeStatus`/any `AgeStatus`-typed fields accordingly (e.g. `lastNotifiedAgeStatus` field → `lastNotifiedRecency` to match the DB column rename).
- [x] 2.2 Rename `computeAgeStatus` (`src/lib/ageStatus.ts`, renamed to `src/lib/recency.ts`) and `computeRecordAgeStatus` (`src/lib/notifications.ts`) to their `Recency`-based equivalents, updating internal tier-name literals.
- [x] 2.3 Update `src/lib/settings.ts` (`NotifiableAgeStatus`, `NOTIFIABLE_TIERS`) to the new type/tier names.
- [x] 2.4 Update `src/lib/store.ts` to read/write the renamed column and field.
- [x] 2.5 Update `src/lib/reconciliation.ts` and `src/lib/slackBot.ts` references to the renamed type/tier values.
- [x] 2.6 (found via typecheck, not in original scope) Update `src/lib/sync.ts`'s `lastNotifiedAgeStatus` references to `lastNotifiedRecency`.

## 3. UI

- [x] 3.1 Rename the "Age Status" column header to "Recency" in `app/components/ClusterTable.tsx`, along with the `ageStatus` accessor/id, `AgeStatusBadge` component, and `AGE_STATUS_OPTIONS` filter list.
- [x] 3.2 Update badge/tier display labels to "Fresh"/"Aging"/"Old".

## 4. Slack copy

- [x] 4.1 Update `src/lib/slack.ts` tier-name literals and copy (e.g. "Usage status: *In Use*" → "Recency: *Fresh*") at the call sites identified in the proposal's Impact section.

## 5. Tests

- [x] 5.1 Update literal tier-string assertions in `ageStatus.test.ts` (renamed `recency.test.ts`), `notifications.helpers.test.ts`, `slack.test.ts`, `reconciliation.test.ts`, `sync.integration.test.ts`, `consent.integration.test.ts`, `manualActions.test.ts`, `store.roundtrip.test.ts` to the new tier names.
- [x] 5.2 Run the full test suite and fix any remaining reference to the old vocabulary surfaced by failures.

## 6. Specs and docs

- [x] 6.1 Directly edit the Purpose lines in `openspec/specs/cluster-age-status/spec.md` and `openspec/specs/dashboard-settings/spec.md` to say "recency" instead of "age status" (delta `## Purpose` sections are ignored for existing capabilities, per design.md).
- [x] 6.2 Add `theme-preference` as a modified capability with a proper MODIFIED-Requirements delta for its "Forgotten age status" example, rather than a direct edit - it's requirement/scenario text, not a Purpose line, so it belongs in the delta like the other capabilities.
- [x] 6.3 Confirm `openspec validate --strict` passes for this change and that archiving applies the delta specs cleanly.
