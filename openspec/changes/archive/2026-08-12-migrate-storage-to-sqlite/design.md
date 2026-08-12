## Context

See proposal.md - Why. Today's storage layer (`src/lib/store.ts`, `src/lib/settings.ts`) reads a whole JSON file into memory, mutates or merges in JS, and writes the whole file back via `writeJsonFileAtomic` (write-to-tmp, then rename). That pattern is what let a validation gap turn into a full-object overwrite in the incident `settings-read-safety` and `org-credential-resolution-fix` responded to. A single in-process write-queue (`serialize()` in store.ts) is sufficient for concurrency today because the app runs as one always-on Node process - that assumption is unchanged by this migration and is not being revisited here.

`history.json` is currently 393KB / ~12k lines. Every sync tick's `appendHistory` reads and rewrites it in full; `purgeExpiredHistory` does the same to filter by age; `getLifecycleAuditLog` (`src/lib/historyView.ts`) reads it in full on every dashboard load, groups entries by `clusterId` in JS, sorts, and re-diffs every consecutive pair via `computeFieldChanges`/`isLifecycleChange` (`src/lib/historyFields.ts`) just to filter down to lifecycle-relevant rows.

## Goals / Non-Goals

**Goals:**
- Make it structurally impossible for a write to one field/row to affect another - by construction (the SQL statement shape), not by validation discipline layered on top of a blob rewrite.
- Turn `history` append/purge/query operations from O(whole table) into O(affected rows), using real indexes.
- Use SQLite's own type system (INTEGER/TEXT/REAL, not JSON-inside-a-column) everywhere a value is filtered, sorted, or updated independently, so the schema itself documents and enforces the shape of the data.
- Keep every existing caller of `store.ts`/`settings.ts` working unchanged - this is an internals swap, not an API change.

**Non-Goals:**
- Building a general schema-migration framework. Future schema changes remain the same kind of ad hoc, purpose-built migration `settings.ts` already does for `migrateLegacyAgeSettings`/`migrateOrgConfigIds` - this change doesn't add tooling beyond that pattern (see Decisions - Schema evolution).
- Revisiting the single-process/in-process-mutex concurrency model. SQLite's own locking is a bonus, not the reason for this change.
- Changing any user-observable behavior other than the one explicitly called out in the modified `cluster-history-ui` spec (lifecycle classification fixed at write time). Settings validation semantics, retention behavior, and dashboard behavior are all preserved exactly.

## Decisions

**1. Driver: `node:sqlite`, not `better-sqlite3`.**
The project has zero database dependencies today. `node:sqlite` is built into Node and stable on the project's Node v26.7.0 runtime, so this adds no new dependency, no native-module build step, and nothing for a future Docker/deploy pipeline to compile. `better-sqlite3` was considered - its API is slightly more ergonomic and it has a longer track record - but the zero-dependency win outweighs that for a single-process app with modest concurrency needs. If `node:sqlite` proves to have a gap (e.g. missing a needed pragma or API), that's a cheap, isolated swap later since both present a synchronous, prepared-statement API.

**2. Column-level/row-level writes replace whole-object read-merge-write.**
`writeSettings(partial)` today does `merged = {...current, ...partial}; validate(merged); writeWhole(merged)`. The SQLite equivalent updates only the columns present in `partial`:
```sql
UPDATE settings SET slackBotToken = ? WHERE id = 1;
```
Validation still runs (SQLite doesn't know the cross-field rules like `activityGraceHours < forgottenHours`), but it runs *before* the UPDATE, on the merged view assembled from a fresh read plus the partial - the same logic `validateSettings()` has today, just gating a targeted UPDATE instead of a full-row write. A field that isn't part of `partial` is never named in the SQL statement, so it cannot be the accidental victim of a fallback path the way `capellaOrgs` was.

Likewise `upsertClusters`/`removeClusters` become `INSERT ... ON CONFLICT(clusterId) DO UPDATE SET ...` and `DELETE FROM clusters WHERE clusterId IN (...)` - per-row, not a load-the-whole-map-then-rewrite-the-whole-array operation.

**3. Normalize the three array/object-shaped settings fields into their own tables.**
`capellaOrgs` (a list), `notificationsByTier` (a fixed 2-key map), and `snoozeDayOptions` (an ordered list) are relations, not scalars, wearing a JSON-blob costume inside one settings object. Splitting them into `org_configs`, `tier_notifications`, and `snooze_day_options` tables means a write to one org's API key is `UPDATE org_configs SET apiKey = ? WHERE id = ?` - it cannot be reached by a bug in code that only ever touches the `settings` table. This directly targets the field the original incident destroyed.

Alternative considered: keep these as JSON columns within the `settings` table (less migration work, still a schema improvement over a single JSON *file*). Rejected because it reintroduces exactly the blob-rewrite risk for that column - `UPDATE settings SET capellaOrgs = ?` is still a whole-array replace, just scoped to one column instead of one file.

**4. Typed columns, not JSON, for `clusters` and `history`; `NodeSpec` flattened; `history` mirrors `clusters` column-for-column.**
`clusters` gets one real column per `ClusterRecord` field, including `nodeCpu`/`nodeRam` in place of the nested `NodeSpec.compute` object (flattened per explicit decision - nothing about CPU/RAM benefits from staying nested, and it's simple numeric data). `history` duplicates every one of those columns plus `id` (autoincrement PK), `clusterId`, `takenAtMs`, `trigger`, `isLifecycleChange` - i.e. each history row is a fully typed snapshot, not a JSON blob with a few indexed columns bolted on. This is a deliberate choice over a hybrid (typed columns only for filtered/sorted fields, JSON for the rest): `historyFields.ts`'s `describe()` functions already read individual fields (`r.actualCost.amountUsd`, `r.config.status`, ...) per entry to render the timeline and audit log, which is exactly the access pattern typed columns serve. The cost is schema duplication - a future `ClusterRecord` field addition touches both `clusters` and `history` table definitions - accepted as the standard shape for an audit/temporal table (mirroring the live table plus event metadata), consistent with the existing codebase style of explicit, purpose-built code over generic abstraction.

**5. Timestamps as `INTEGER` epoch-milliseconds.**
SQLite has no native datetime type - only type affinity. Epoch-ms was chosen over `TEXT` ISO-8601 because it matches the codebase's own existing convention for exactly this purpose (`CostSnapshot.takenAtMs` in `src/lib/costSeries.ts`), turns `purgeExpiredHistory`'s date math into a plain indexed `WHERE takenAtMs < ?` instead of parsing a string per row, and composes directly with the `.getTime()` arithmetic already used throughout `format.ts`/`ageStatus.ts`. Conversion to/from the ISO strings `ClusterRecord`/`Settings`/the rest of the app use happens at the `store.ts`/`settings.ts` boundary, the same place JSON parsing happens today - callers never see epoch-ms.

**6. Booleans as `INTEGER` (0/1) with `CHECK` constraints.**
Matches SQLite's own boolean convention (no native boolean type) and lets a `CHECK (x IN (0,1))` catch a malformed value at the database layer instead of trusting application code.

**7. Write-time precomputation of `isLifecycleChange`, replacing read-time recomputation.**
Every history-append call site already has the `prior` record in scope: `sync.ts`'s `changedSnapshots` filter (`historyEntriesDiffer(prior, snapshot.record)`) and `store.ts`'s `appendHistoryIfChanged(prior, next, ...)`. Both call sites compute `computeFieldChanges(prior, next)` and `isLifecycleChange(changes)` (already-existing, already-tested functions in `historyFields.ts`) once, at write time, and persist `isLifecycleChange` as an indexed column. `getLifecycleAuditLog()` becomes:
```sql
SELECT * FROM history WHERE isLifecycleChange = 1 ORDER BY takenAtMs DESC;
```
with no per-read scan, grouping, or re-diffing. `getClusterHistory()` (the per-cluster timeline) still diffs consecutive rows on read - that's an inherently small, indexed-by-`clusterId` query (one cluster's history, not all history), so no precomputation is needed there.

This is the one change with genuine externally-observable impact, captured in the modified `cluster-history-ui` spec: classification becomes fixed at write time rather than fully dynamic. Alternative considered: a SQL window function (`LAG() OVER (PARTITION BY clusterId ORDER BY takenAtMs)`) to fetch prior-row pairs at read time without a full JS-side group-by, keeping classification fully dynamic. Rejected as the primary mechanism because it doesn't fix the actual cost driver - the audit log still touches every row across every cluster on every load rather than only the ones already known to qualify - though it remains available later as the mechanism for a backfill migration if `HISTORY_FIELDS` ever changes (see Risks).

**8. Schema evolution stays ad hoc, guarded by `PRAGMA user_version`.**
No migration-framework dependency is introduced (see Non-Goals). Startup checks `PRAGMA user_version`; version 0 (fresh database) runs the full `CREATE TABLE` schema and sets it to 1. A future schema change bumps the version and runs a purpose-built `ALTER TABLE`/backfill step, the same ad hoc pattern `migrateLegacyAgeSettings`/`migrateOrgConfigIds` already establish for settings.

## Risks / Trade-offs

- **[Risk]** Write-time-fixed `isLifecycleChange` means a future change to `HISTORY_FIELDS`' lifecycle-relevant subset does not retroactively reclassify existing rows, unlike today's fully-dynamic recompute-on-read. → **Mitigation**: documented explicitly in the modified `cluster-history-ui` spec as intended behavior, not a bug; if a reclassification is ever genuinely needed, it's a one-time backfill migration (`UPDATE history SET isLifecycleChange = ...` recomputed from each row's own stored fields against the new rules) - the same shape of ad hoc migration the codebase already uses elsewhere.
- **[Risk]** `history` mirroring `clusters` column-for-column means every future `ClusterRecord` field addition requires updating two table schemas instead of one. → **Mitigation**: accepted trade-off for query performance and type safety; the two schemas evolving together is enforced by code review, the same way `HISTORY_FIELDS` already has a comment noting it's "kept as one list" specifically to prevent drift between two related pieces of logic.
- **[Risk]** `node:sqlite` is a newer API than `better-sqlite3` with a smaller track record in production Node apps. → **Mitigation**: both expose a synchronous, prepared-statement API, so a swap to `better-sqlite3` later - if a real gap surfaces - touches only the internals of `store.ts`/`settings.ts`, not callers.
- **[Risk]** The one-time JSON→SQLite import could fail partway (e.g. malformed legacy data) and leave a half-populated database. → **Mitigation**: run the import inside a single SQLite transaction; on any error, roll back entirely and leave the JSON files as the still-authoritative source, surfaced as a loud startup failure (consistent with `readSettings()`'s existing "throw rather than silently corrupt" philosophy) rather than a partial, silently-incomplete migration.

## Migration Plan

1. On startup, if no SQLite database file exists yet and `data/settings.json`/`data/clusters.json`/`data/history.json` are present, run a one-time import inside a single transaction: create the schema (Decision 8), read each JSON file, insert rows with the type conversions described above (ISO strings → epoch-ms, nested `NodeSpec`/`OrgConfig[]`/`notificationsByTier`/`snoozeDayOptions` → their normalized tables), commit.
2. If the import transaction fails, roll back, leave no database file behind, and throw - the app fails loudly on startup rather than running against a partially-imported store. The original JSON files are never modified or deleted by this step, so a failed import is retryable after fixing the underlying data issue.
3. Once the database exists (whether freshly imported or previously created), the importer is a no-op on every subsequent startup - it checks for the database file's existence, not a flag inside it.
4. Rollback: since the JSON files are left untouched by a successful import, reverting this change's code (back to JSON-file `store.ts`/`settings.ts`) and removing the SQLite database file restores the prior behavior against the same data, provided no writes have happened through the new SQLite path that weren't also reflected back to JSON - i.e. rollback is safe only until the app has been running on SQLite long enough that JSON and SQLite would disagree. This is a one-way migration in practice; the untouched JSON files are a safety net for the transition window, not an ongoing dual-write.
5. Once the import has been verified against this deployment's real data (see tasks.md "Post-migration cleanup"), the transition window is over: the legacy `data/*.json` files and the one-time importer (`jsonImport.ts` and its test) are deleted outright, along with the now-unused `databaseFileExists()` export and the `export` keyword on the row-level helpers (`insertFullSettings`, `upsertClusterRow`, `insertHistoryRow`) that existed only for the importer's cross-table transaction. This is deliberately a separate, later step rather than part of the same commit as the migration itself, so the rollback path in point 4 stays available for the length of that transition window.
