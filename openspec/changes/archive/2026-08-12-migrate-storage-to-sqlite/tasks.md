## 1. Schema and database bootstrap

- [x] 1.1 Create a new `src/lib/db.ts` that opens (creating if absent) the SQLite database file under `./data` via `node:sqlite`, sets `PRAGMA journal_mode = WAL` and `PRAGMA foreign_keys = ON`, and exports the shared connection.
- [x] 1.2 In `db.ts`, implement schema bootstrap gated on `PRAGMA user_version`: at version 0, run `CREATE TABLE IF NOT EXISTS` for `settings`, `org_configs`, `tier_notifications`, `snooze_day_options`, `clusters`, `history` (per design.md Decisions 3-6) plus indexes `idx_history_cluster (clusterId, takenAtMs)` and `idx_history_lifecycle (isLifecycleChange, takenAtMs)`, then set `user_version = 1`.
- [x] 1.3 Add epoch-ms timestamp and boolean (0/1) conversion helpers shared by `store.ts` and `settings.ts` (e.g. `toEpochMs(iso: string | null)`, `fromEpochMs(ms: number | null)`, `toSqliteBool`, `fromSqliteBool`).

## 2. Settings store rewrite

- [x] 2.1 Rewrite `readSettings()` in `src/lib/settings.ts` to assemble a `Settings` object from `SELECT * FROM settings WHERE id = 1` joined with `org_configs`, `tier_notifications` (ordered/keyed by tier), and `snooze_day_options` (ordered by `position`), preserving the existing three-tier resolution behavior (as-is / gap-filled-from-defaults / throw) from `validateSettings()`.
- [x] 2.2 Rewrite `writeSettings(partial)` to validate the merged view exactly as today, then persist via targeted statements: `UPDATE settings SET <only the scalar columns present in partial>`, plus full-replace-by-diff of `org_configs`/`tier_notifications`/`snooze_day_options` only when `partial` actually includes those keys (never touched otherwise).
- [x] 2.3 Port `migrateLegacyAgeSettings` and `migrateOrgConfigIds` semantics to run against the SQLite-backed read path (still ad hoc, per design.md Decision 8 - no general migration framework).
- [x] 2.4 First-run seeding: if `settings` table is empty, insert `DEFAULT_SETTINGS` plus a freshly generated `sessionSecret`, matching today's first-run behavior.

## 3. Clusters store rewrite

- [x] 3.1 Define the `clusters` table schema in `db.ts` with one column per `ClusterRecord` field (see design.md Decision 4), `nodeCpu`/`nodeRam` flattened from `NodeSpec`, and epoch-ms columns for every timestamp field.
- [x] 3.2 Rewrite `readClusters()` in `src/lib/store.ts` to `SELECT * FROM clusters` and map rows back into `ClusterRecord` (un-flattening `nodeCpu`/`nodeRam` into `config.nodeSpec.compute`, converting epoch-ms columns back to ISO strings), preserving `withConsentDefaults`' role for any column that's nullable pending a future migration.
- [x] 3.3 Rewrite `upsertClusters(records)` as a per-row `INSERT ... ON CONFLICT(clusterId) DO UPDATE SET ...` (all columns), replacing the read-all/map-merge/write-all pattern.
- [x] 3.4 Rewrite `removeClusters(clusterIds)` as `DELETE FROM clusters WHERE clusterId IN (...)`.

## 4. History store rewrite and write-time lifecycle precomputation

- [x] 4.1 Define the `history` table schema in `db.ts` mirroring `clusters`' columns plus `id` (autoincrement PK), `clusterId`, `takenAtMs`, `trigger`, `isLifecycleChange`.
- [x] 4.2 Change `appendHistory(snapshots)` in `store.ts` to accept snapshots that already carry `isLifecycleChange`, and insert each as a row via a single transaction (`INSERT` per row, not read-all-then-rewrite).
- [x] 4.3 Update `appendHistoryIfChanged(prior, next, trigger, takenAt)` to compute `isLifecycleChange(computeFieldChanges(prior, next))` at the call site (it already has `prior`/`next` in scope) and pass it through to `appendHistory`.
- [x] 4.4 Update `sync.ts`'s `changedSnapshots` construction to compute and attach `isLifecycleChange` per snapshot the same way, using the same `prior` it already resolves for the `historyEntriesDiffer` gate.
- [x] 4.5 Rewrite `readHistory()` to `SELECT * FROM history` and map rows back to `ClusterSnapshot` (reconstructing the nested `record: ClusterRecord` shape from the mirrored columns), for callers that still need the full shape (e.g. `getClusterHistory`).
- [x] 4.6 Rewrite `purgeExpiredHistory(now, retentionDays)` as `DELETE FROM history WHERE takenAtMs < ?`, returning the deleted row count from the statement result instead of computing `before.length - after.length`.

## 5. Lifecycle audit log query rewrite

- [x] 5.1 Rewrite `getLifecycleAuditLog()` in `src/lib/historyView.ts` to query `SELECT * FROM history WHERE isLifecycleChange = 1 ORDER BY takenAtMs DESC`, then compute each entry's displayed diff against its immediately-preceding row for the same `clusterId` (a small, indexed per-cluster lookup, not a full-table group-by).
- [x] 5.2 Confirm `getClusterHistory(clusterId)` uses an indexed `WHERE clusterId = ? ORDER BY takenAtMs` query instead of filtering the full in-memory array.

## 6. One-time JSON import migration

- [x] 6.1 Add a startup check: if the SQLite database file doesn't yet exist and any of `data/clusters.json`/`data/history.json`/`data/settings.json` are present, run the import.
- [x] 6.2 Implement the import inside a single transaction (design.md Migration Plan step 1-2): create schema, read and convert each JSON file's records into the new typed/normalized tables, commit; on any error, roll back and throw without leaving a partial database file or touching the source JSON files.
- [x] 6.3 Wire the startup check into the app's existing startup path (wherever `readSettings()`/`readClusters()` are first invoked, e.g. `scheduler.ts` or the Next.js server entry point) so it runs once before any other store access.

## 7. Tests

- [x] 7.1 Rewrite `src/lib/store.test.ts` to use an in-memory (`:memory:`) `node:sqlite` database per test instead of mocking `node:fs`, covering the same behaviors (consent defaults, history trigger defaults, append/purge, upsert/remove semantics).
- [x] 7.2 Rewrite `src/lib/settings.test.ts` the same way, keeping the existing assertion that a present-but-invalid field never triggers a write (design.md Non-Goals; see archived `settings-read-safety`).
- [x] 7.3 Add a test for write-time `isLifecycleChange` precomputation: appending a snapshot whose diff includes only routine (non-lifecycle) fields stores `isLifecycleChange = 0`, and one with a lifecycle field change stores `1`.
- [x] 7.4 Add a test for the new `cluster-history-ui` scenario: an entry's lifecycle classification, once written, doesn't change when the classification rules are (simulated to be) different at read time.
- [x] 7.5 Add a test for the one-time import: given sample legacy JSON files, the imported SQLite data matches the original records field-for-field (accounting for type conversions), and a second run is a no-op.

## 8. Cleanup and verification

- [x] 8.1 Run `npm run typecheck` and `npm test` and confirm all existing tests pass against the new store implementation.
- [x] 8.2 Manually verify against a copy of the real `data/*.json` files: run the import, confirm the dashboard, settings page, cluster history timeline, and lifecycle audit log all render identically to before the migration.
- [x] 8.3 Confirm `data/clusters.json`, `data/history.json`, `data/settings.json` are left untouched (not deleted, not written to) after the migration, per design.md's rollback safety note.

## 9. Post-migration cleanup

Once this deployment's data was verified fully migrated (task 8.2/8.3), the transition-window safety net (design.md Migration Plan point 5) was removed:

- [x] 9.1 Delete `data/clusters.json`, `data/history.json`, `data/settings.json` - the real, no-longer-read legacy files.
- [x] 9.2 Delete `src/lib/jsonImport.ts` and `src/lib/jsonImport.test.ts`.
- [x] 9.3 Remove the `importLegacyJsonIfNeeded` import and call from `instrumentation.ts`.
- [x] 9.4 Remove the now-unused `databaseFileExists()` export from `db.ts` (it existed only for the importer).
- [x] 9.5 Un-export `insertFullSettings` (settings.ts), `upsertClusterRow`, `insertHistoryRow`, and `previousHistoryRow` (store.ts) - each stays in use internally, but was only exported for the importer's cross-table transaction.
- [x] 9.6 Re-run `npm run typecheck` and `npm test` to confirm the cleanup didn't break anything still relying on the removed exports.
