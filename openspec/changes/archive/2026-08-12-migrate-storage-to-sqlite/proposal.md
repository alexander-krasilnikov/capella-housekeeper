## Why

The JSON-file store's whole-object read-merge-write pattern has already caused a real incident: a validation gap in `readSettings()` silently overwrote `capellaOrgs` (wiping three live Capella API keys) because the only way to persist a partial change was to reconstruct and rewrite the entire settings object (see archived changes `org-credential-resolution-fix` and `settings-read-safety`). Two changes have already gone into hardening that one failure path with validation logic; the underlying hazard - a field that isn't being touched can still be overwritten because every write serializes the whole object - remains structurally possible anywhere the same pattern is used, including `clusters.json`. Separately, `history.json` (already 393KB / ~12k lines) is rewritten in full on every sync tick's append and scanned in full on every lifecycle-audit-log read, a cost that grows unbounded with cluster count and sync frequency.

## What Changes

- Replace the three JSON files (`data/clusters.json`, `data/history.json`, `data/settings.json`) with a single SQLite database (`node:sqlite`, no new dependency), read and written through `src/lib/store.ts` and `src/lib/settings.ts` with the same exported function signatures callers already use.
- Replace whole-object read-merge-write with per-column, per-row SQL statements (`UPDATE ... SET col = ? WHERE ...`, `INSERT`, `DELETE`) so a write that doesn't mention a field cannot alter it, structurally rather than by validation discipline.
- Normalize `Settings.capellaOrgs`, `Settings.notificationsByTier`, and `Settings.snoozeDayOptions` - each currently a JSON array/object nested inside the one settings blob - into their own tables (`org_configs`, `tier_notifications`, `snooze_day_options`), isolating them from every other settings write. `capellaOrgs` is specifically the field the prior incident destroyed.
- Give `clusters` and `history` fully typed columns (including a flattened `nodeCpu`/`nodeRam` in place of nested `NodeSpec`, and epoch-millisecond `INTEGER` columns for every timestamp) instead of storing records as opaque JSON blobs. `history` mirrors `clusters`' columns (a typed snapshot per row) plus event metadata (`takenAtMs`, `trigger`, `isLifecycleChange`).
- **BREAKING (internal only, not user-facing)**: precompute and persist `isLifecycleChange` on each history row at write time (using the existing `computeFieldChanges`/`isLifecycleChange` logic in `src/lib/historyFields.ts`, which already has the prior/next records in hand at every write site), instead of recomputing it from a full history scan on every read. This changes lifecycle-audit-log classification from fully dynamic (a code change to the classification rules retroactively reclassifies old entries) to fixed-at-write-time (old rows keep the classification that was true when they were written; a future rule change needs an explicit backfill, the same ad hoc pattern `settings.ts` already uses for its legacy migrations).
- Turn `purgeExpiredHistory` and `appendHistory` into indexed `DELETE`/`INSERT` statements instead of load-everything-filter-rewrite-everything.
- One-time, idempotent startup migration that imports existing `data/*.json` files into the new SQLite database if present, then is never re-run.
- `src/lib/store.test.ts` and `src/lib/settings.test.ts` move from mocking `node:fs` to an in-memory (`:memory:`) SQLite database per test.

## Capabilities

### New Capabilities

(none - this is a storage-layer change; no new user-facing capability is introduced)

### Modified Capabilities

- `cluster-history-ui`: lifecycle-audit-log classification (which history entries count as "consent/lifecycle" vs. "routine") is now fixed at the moment an entry is written, rather than recomputed dynamically on every read - a behavior visible if the classification rules ever change later.

## Impact

- **Code**: `src/lib/store.ts`, `src/lib/settings.ts` (internals rewritten; exported function signatures unchanged), `src/lib/historyView.ts` (`getLifecycleAuditLog` becomes an indexed query instead of a full-scan/group/diff), `src/lib/sync.ts` and `src/lib/store.ts`'s `appendHistoryIfChanged` (compute and pass `isLifecycleChange` at write time), `src/lib/store.test.ts`, `src/lib/settings.test.ts`.
- **Dependencies**: none added - uses `node:sqlite` (built into Node, available on the project's Node v26.7.0 runtime); zero new entries in `package.json`.
- **Data**: `data/clusters.json`, `data/history.json`, `data/settings.json` are superseded by a SQLite database file under `./data`; existing JSON files are imported once on first startup after this change and are no longer written to afterward.
- **Callers unaffected**: `reconciliation.ts`, `manualActions.ts`, `notifications.ts`, `slackBot.ts`, `app/actions.ts`, `app/page.tsx`, `app/settings/page.tsx` continue calling the same `store.ts`/`settings.ts` functions with the same shapes in and out.
