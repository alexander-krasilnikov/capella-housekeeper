## Context

See proposal.md - Why/What Changes for motivation and scope.

`src/lib/db.ts`'s migration system (`bootstrapSchema`, `MIGRATIONS`, `SCHEMA_VERSION`) has, so far, only ever done additive column changes: each `MIGRATIONS[v]` entry is a plain `string[]` of `ALTER TABLE ... ADD COLUMN` statements, run inside one transaction, version-gated via `PRAGMA user_version`. `db.migration.test.ts` freezes the outgoing schema as `src/test/__fixtures__/schema-v<N>.sql` (plus a generated `db-v<N>.sqlite3` data fixture) before each version bump, and asserts that upgrading that frozen fixture produces a database structurally and semantically identical to a fresh one.

This change is the first migration that isn't purely additive:
- `clusters.lastNotifiedAgeStatus` and `history.lastNotifiedAgeStatus` need both a column rename and a rewrite of their existing string values ("In Use"/"Stale"/"Forgotten" → "Fresh"/"Aging"/"Old").
- `clusters.consentTierAtDecision` and `history.consentTierAtDecision` keep their column name but need the same value rewrite.
- `tier_notifications.tier` has a `CHECK (tier IN ('Stale', 'Forgotten'))` constraint. SQLite cannot alter a `CHECK` constraint in place, so this table needs a full rebuild (create new table with the new constraint, copy rows across with values remapped, drop the old table, rename the new one into place).

## Goals / Non-Goals

**Goals:**
- Migrate every existing row's stored tier strings to the new vocabulary, with no data loss, atomically with the rest of the schema bootstrap.
- Keep using the existing `MIGRATIONS[v]: string[]` mechanism rather than inventing a new migration abstraction for this one change.
- Preserve the existing guard rails (frozen fixture, schema-identity assertion, rollback-on-failure) for this migration the same way they exist for every prior one.

**Non-Goals:**
- No change to tiering logic, thresholds, or notification rules (see proposal.md).
- No rename of the `activityGraceHours`/`forgottenHours` settings keys, or of `ClusterConfig.status`/the "Status" UI label - both are explicitly out of scope per the proposal.
- No rename of `consentTierAtDecision` itself - only its stored values change, since the column name doesn't reference "AgeStatus".
- No general-purpose "data migration" framework - this is a one-off extension of the existing mechanism, not a new pattern to standardize.

## Decisions

**Extend `MIGRATIONS[2]` with raw SQL, not a new migration mechanism.** `MIGRATIONS[v]` already executes arbitrary SQL strings inside a transaction - the doc comment's "`ALTER TABLE ... ADD COLUMN` is the only schema change these support" describes the discipline every migration has followed so far, not an enforced limitation of the executor. Adding non-additive statements to this same list is simpler than introducing a second migration path, and keeps `bootstrapSchema`'s transaction/rollback guarantee for free. Alternative considered: a separate "data migration" step outside `bootstrapSchema` - rejected as unnecessary machinery for a single one-off rename.

**Column rename via native `ALTER TABLE ... RENAME COLUMN`.** SQLite supports this directly (no rebuild needed): `ALTER TABLE clusters RENAME COLUMN lastNotifiedAgeStatus TO lastNotifiedRecency`, and the same for `history`.

**Value rewrite via `UPDATE ... SET col = CASE col WHEN ... END`.** Applied to `lastNotifiedRecency` and `consentTierAtDecision` on both `clusters` and `history`:
```sql
UPDATE clusters SET lastNotifiedRecency = CASE lastNotifiedRecency
  WHEN 'In Use' THEN 'Fresh' WHEN 'Stale' THEN 'Aging' WHEN 'Forgotten' THEN 'Old'
  ELSE lastNotifiedRecency END;
UPDATE clusters SET consentTierAtDecision = CASE consentTierAtDecision
  WHEN 'In Use' THEN 'Fresh' WHEN 'Stale' THEN 'Aging' WHEN 'Forgotten' THEN 'Old'
  ELSE consentTierAtDecision END;
-- (mirrored for `history`)
```
The `ELSE` branch leaves `NULL` and any already-migrated value untouched, so the statement is safe to reason about even if ever re-run.

**`tier_notifications` CHECK-constraint change via table rebuild.** SQLite has no `ALTER ... CHECK`. Rebuild inside the same transaction: create `tier_notifications_new` with `CHECK (tier IN ('Aging', 'Old'))`, copy rows across remapping `tier` the same way as above, `DROP TABLE tier_notifications`, then `ALTER TABLE tier_notifications_new RENAME TO tier_notifications`. The existing "produces an identical schema snapshot" test in `db.migration.test.ts` already diffs a migrated database's full schema (including `CHECK` text) against a freshly-bootstrapped one, so this rebuild is verified to match `SCHEMA_STATEMENTS` exactly, not just approximately.

**Freeze `schema-v2.sql` (and a `db-v2.sqlite3` fixture + generator) before writing the migration**, mirroring the existing `schema-v1.sql`/`db-v1.sqlite3`/`generate-db-v1.mjs` pattern, since `SCHEMA_VERSION` moves from 2 to 3. The v2 fixture must include rows carrying the pre-rename tier strings (as the current `db-v1.sqlite3` fixture already does for `consentTierAtDecision: "Stale"`), so the new migration test actually exercises the rewrite rather than passing vacuously on empty tables.

**Bump `SCHEMA_VERSION` to 3.**

## Risks / Trade-offs

- **[Risk]** The `tier_notifications` rebuild (drop + rename) has no rollback beyond transaction atomicity if a bug in the copy statement loses rows. → **Mitigation:** it runs inside `bootstrapSchema`'s existing `BEGIN`/`ROLLBACK` wrapper, which `db.migration.test.ts` already proves rolls back cleanly on any failure mid-migration; extend that same test file with a golden-fixture-survives-upgrade case for this migration before merging.
- **[Risk]** `db.migration.test.ts`'s existing "existing data survives an upgrade" assertions hard-code the *old* tier strings as the expected post-upgrade values (e.g. `consentTierAtDecision: "Stale"`, `lastNotifiedAgeStatus: "Stale"`). These will start failing - correctly - the moment this migration exists, and must be updated to expect `"Aging"`/`lastNotifiedRecency` as part of this same change, not discovered later as a broken test. → **Mitigation:** tracked explicitly in tasks.md.
- **[Risk]** Any out-of-band tooling or manual SQL against `data/store.sqlite3` that references the old column name or tier strings breaks silently after upgrade. → **Mitigation:** out of this codebase's control; call out as a breaking change in release notes.

## Migration Plan

1. Freeze `src/test/__fixtures__/schema-v2.sql` and a `db-v2.sqlite3` + generator script from the current (pre-rename) schema and representative data, mirroring the v1 fixtures.
2. Bump `SCHEMA_VERSION` to 3 and add the `MIGRATIONS[2]` entry with the rename/rewrite/rebuild statements above.
3. Update `db.migration.test.ts`: add a `schema-v2` parallel to the existing `schema-v1` describe blocks, and update any assertion that still expects an old tier string post-upgrade.
4. Update application code (types, functions, UI, Slack copy - see proposal.md Impact) and all other affected tests to the new vocabulary.
5. Update the delta specs' cross-referenced main specs at archive time; directly edit the two Purpose lines that mention "age-status" (`cluster-age-status/spec.md`, `dashboard-settings/spec.md`), since delta `## Purpose` sections are ignored for existing capabilities. The one incidental "Forgotten age status" example in `theme-preference/spec.md` is requirement/scenario text, not a Purpose line, so it goes through a normal MODIFIED-Requirements delta like the other capabilities instead.

**Rollback:** the existing migration system has no down-migration mechanism for any prior version bump either; the only rollback path is restoring `data/store.sqlite3` from a backup taken before upgrading. This is consistent with today's behavior, not a regression introduced by this change - worth stating explicitly in release notes given this is the first non-additive migration.
