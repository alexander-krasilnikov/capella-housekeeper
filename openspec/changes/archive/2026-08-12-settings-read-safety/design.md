## Context

See org-credential-resolution-fix's design.md Decision 2 for the incident this directly responds to: `readSettings()`'s old fallback (`validateSettings(merged) ?? { ...DEFAULT_SETTINGS, sessionSecret }`, then unconditionally written to disk) turned any validation failure - including a transient one caused by a code bug mid-deploy - into a permanent, silent data loss.

## Goals / Non-Goals

**Goals:**
- Make it structurally impossible for a validation failure to result in real configuration being overwritten with defaults.
- Preserve the one genuinely useful part of the old fallback: filling in fields that are entirely absent after an upgrade, without discarding anything already present.

**Non-Goals:**
- Building a general schema-migration framework. `migrateLegacyAgeSettings` and `migrateOrgConfigIds` remain the ad hoc, purpose-built migrations they were; this change doesn't add infrastructure for future ones beyond the pattern they already establish.
- Making `readSettings()` self-heal an invalid file automatically. Once a present field fails validation, a human needs to look at it - this change deliberately trades "always returns something" for "never silently destroys data."

## Decisions

**1. Three-tier resolution: as-is, gap-filled, throw - never a fourth "wipe" tier.**
The removed code had a hidden fourth tier that discarded everything. The new structure stops at three: validate the file as read (after ID migration); if that fails, validate again after filling in keys the file doesn't have at all (an honest "upgrade" case, safe because it can't discard anything); if that also fails, throw. There is no code path left that constructs a `Settings` object from `DEFAULT_SETTINGS` while a real file with real content exists.

**2. Throwing over "return a best-effort in-memory settings object without persisting."**
Considered letting `readSettings()` return something usable (e.g. the gap-filled-but-still-invalid object) without writing it, so the app could keep limping along. Rejected - a `Settings` value that didn't pass `validateSettings` isn't actually type-safe to hand to callers expecting a `Settings`, and "keep running against subtly-broken settings" is a worse failure mode than "stop and surface it," especially for a tool making real writes (turn-off/delete) against Capella. A thrown error propagates predictably: Server Components render Next's error boundary (visible), Server Actions that already wrap calls in try/catch (e.g. `refreshAction`) surface it as a message, and the background sync/reconciliation loops (which already wrap their whole pass in try/catch, logging to `console.error`) just retry on the next tick without touching the file - loud in the logs, harmless to the data.

**3. Regression-tested directly, with a mocked filesystem, rather than only verified live.**
The live verification during `org-credential-resolution-fix` (restart, confirm the real file, etc.) proved the fix worked at that moment, but nothing prevented a future edit from reintroducing the same fallback shape. `src/lib/settings.test.ts` mocks `node:fs` (same pattern as `store.test.ts`) and asserts, for a present-but-invalid field, that (a) `readSettings()` rejects and (b) the mocked file's bytes are exactly unchanged - a test that would fail immediately if the destructive fallback ever came back.

## Risks / Trade-offs

- **[Risk]** Any caller of `readSettings()` that didn't already tolerate a thrown rejection could now surface an unhandled error where it previously got a (possibly-wrong-but-present) `Settings` object. → **Mitigation**: audited every call site (`scheduler.ts`, `sync.ts`, `reconciliation.ts`, `manualActions.ts`, `notifications.ts`, `slackBot.ts`, `auth.ts`, `app/actions.ts`, `app/page.tsx`, `app/settings/page.tsx`); the background loops already wrap their passes in try/catch, Server Actions that call it either already have a surrounding try/catch or are simple reads where a thrown error becoming a visible 500/error toast is the intended, honest outcome instead of proceeding on invalid settings.

## Migration Plan

No data migration - this only changes behavior on the (now much narrower, and hopefully never-hit-again) failure path. Rollback is a plain revert of `settings.ts`'s `readSettings()` and the new test file.
