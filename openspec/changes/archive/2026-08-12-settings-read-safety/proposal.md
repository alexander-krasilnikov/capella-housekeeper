## Why

`readSettings()`'s fallback for a file that fails validation used to persist `{ ...DEFAULT_SETTINGS, sessionSecret }` to disk unconditionally - silently replacing real configuration (Capella API keys, thresholds, dashboard credentials) with empty/default values whenever validation failed for *any* reason, including a code bug in the validator itself. This wasn't hypothetical: it's exactly what happened during the `org-credential-resolution-fix` change, wiping three live API keys. The user asked explicitly to exclude this class of failure and to double-check the fix.

## What Changes

- `readSettings()` no longer ever persists a defaults-derived object over a settings file that already exists and is a JSON object. It still safely fills in fields that are entirely *absent* (a genuine version upgrade), but the moment a field that's actually *present* fails validation and can't be repaired that way, it throws instead of guessing.
- Defaults are only auto-persisted when there is no settings file at all yet (first run - nothing to lose).
- Added `src/lib/settings.test.ts` with a direct regression test reproducing the original incident (a present field failing validation) and asserting the file on disk is left byte-for-byte untouched, plus coverage of the id-migration's backfill/idempotency and the safe gap-filling path.

## Capabilities

### Modified Capabilities
- `dashboard-settings`: "Settings persist across restarts" gains a scenario committing to this: a settings file that fails validation is never silently overwritten with defaults.

## Impact

- `src/lib/settings.ts`: `readSettings()` restructured; no behavior change for the already-valid-file path (the common case).
- `src/lib/settings.test.ts` (new).
