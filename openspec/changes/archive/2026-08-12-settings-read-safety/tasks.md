## 1. Remove the destructive fallback

- [x] 1.1 Restructure `readSettings()` into three tiers (validate as-is → validate after filling only genuinely-absent fields → throw), removing the final `?? { ...DEFAULT_SETTINGS, sessionSecret }` wipe.
- [x] 1.2 Keep the first-run case (no file at all) persisting defaults - the one case where nothing existing can be lost.
- [x] 1.3 Throw (rather than silently coercing to `{}`) when the file exists but isn't a JSON object at all.

## 2. Regression coverage

- [x] 2.1 Add `src/lib/settings.test.ts`, mocking `node:fs` in-memory (same pattern as `store.test.ts`) so tests never touch the real `data/settings.json`.
- [x] 2.2 Test: a present-but-invalid field (reproducing the real incident) causes `readSettings()` to reject, with the mocked file left byte-for-byte unchanged - across a single failed read and across repeated failed reads.
- [x] 2.3 Test: fixing the offending field by hand lets a subsequent read succeed normally.
- [x] 2.4 Test: a non-object file also throws rather than being coerced.
- [x] 2.5 Test: a genuinely-absent field (upgrade case) still gets safely filled from defaults and persisted.
- [x] 2.6 Test: `capellaOrgs` entries missing `id` get a stable id backfilled and persisted, idempotently across repeated reads (covers the `org-credential-resolution-fix` migration path this change sits alongside).

## 3. Verify

- [x] 3.1 `npm run typecheck` clean; `npm test` 64/64 passing (56 prior + 8 new).
- [x] 3.2 Re-triggered a real page load against the live dev server's actual `data/settings.json` (already migrated, valid) and confirmed it still loads correctly with no change in behavior for the healthy-file path.
