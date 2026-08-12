## Context

The `org-project-field` change (see its archived proposal/design) made it a legitimate, supported settings configuration for multiple `capellaOrgs` entries to share one `orgId` - a Capella API key can be scoped to a single project, so an operator covering several projects in one org needs one entry per key. That change didn't touch the write path (manual actions, reconciliation), which still assumed `orgId` uniquely identified a credential. This surfaced as a real production 403: `manualTurnOff` picked the array's first same-`orgId` entry regardless of which project the cluster was actually in.

## Goals / Non-Goals

**Goals:**
- Make the correct API key get used for every write action, even with duplicate `orgId`s.
- Self-heal existing (already-synced) `ClusterRecord`s without a manual migration step - the fix should propagate on the next ordinary sync cycle.

**Non-Goals:**
- Preventing an operator from configuring duplicate `orgId`s in the first place, or validating that a set of entries' scopes don't overlap/conflict - Capella's own key-scoping is the source of truth; this fix only makes the app *use* whichever entry actually worked, not police the configuration itself.

## Decisions

**1. A new stable `OrgConfig.id`, generated once and never re-derived, rather than reusing `apiKey` or a hash of it as the identity.**
`orgId` is exactly the field that's no longer guaranteed unique, so it can't identify a specific entry. The raw `apiKey` could serve as a natural unique key, but persisting it (or a lookup keyed by it) onto every `ClusterRecord` would spread a live secret far more widely than necessary - `id` is a meaningless, non-secret UUID that serves the same disambiguation purpose without that exposure.
- *Alternative considered*: resolve the correct entry at action-time by re-checking which configured key can currently see the cluster's `projectId` (via a fresh `listProjects` call per candidate). Rejected - slower (N extra API calls per action), and still ambiguous if two keys can see the same project (which of them should perform the write?). Recording what actually worked during sync is simpler and faster than re-deriving it.

**2. `id` is backfilled via a migration in `readSettings()`, mirroring the existing `migrateLegacyAgeSettings` pattern - but persisted immediately, not left to a later write.**
`migrateLegacyAgeSettings`'s migrated values are deterministic (a fixed unit conversion), so recomputing them on every read without persisting is safe. `migrateOrgConfigIds` is not deterministic - it mints a fresh random UUID for any entry missing one. Persisting only lazily (e.g. whenever some later write happens to save settings) would mean every `readSettings()` call before that point mints a *different* id for the same entry, which defeats the entire purpose of a stable id. `readSettings()` therefore detects (via reference inequality against the pre-migration object) whether a backfill actually happened and, if so, writes the result back to disk immediately, before returning it.
- **Real incident during implementation**: editing `isOrgConfigList`/`validateSettings` to *require* `id` landed slightly before the migration that backfills it, in separate tool calls. In that window, the live dev server (already running, hot-reloading on save) had a background sync/reconciliation tick call `readSettings()`, which failed validation against the real on-disk `capellaOrgs` (no `id` yet), fell through to `readSettings()`'s pre-existing "validation failed entirely -> merge onto `DEFAULT_SETTINGS`" fallback, and **persisted `capellaOrgs: []` to disk** - wiping three real API keys. Caught immediately by checking the file, restored from a backup taken before the round started (recovering everything except the derived `projectSummary` display cache, which re-fetches live on the next settings-page load). This is now moot once every touched file is in its final, mutually consistent state, but is recorded here because it demonstrates a real risk of editing `settings.ts`'s validation logic incrementally while a long-running process can call `readSettings()` mid-edit: a stricter validator without its accompanying migration doesn't just reject a read, it can *destructively rewrite* the settings file. Future changes to `isOrgConfigList`/`validateSettings` should land together with any needed migration in the same edit, not split across steps.

**3. Resolution order is `orgConfigId` match, then `orgId` match as a fallback - not "`orgConfigId` required."**
A `ClusterRecord` synced before this fix has no `orgConfigId`. Making it required would mean every existing cluster fails to resolve any org at all until re-synced. The `orgId` fallback preserves today's (buggy, but at-least-sometimes-correct) behavior for that narrow window; the very next sync cycle populates `orgConfigId` and the fallback stops being exercised for that record.

**4. `capellaClient.ts`'s functions take a new `ApiCredential = Pick<OrgConfig, "orgId" | "apiKey">` instead of the full `OrgConfig`.**
Adding a required `id` to `OrgConfig` broke two call sites in `app/actions.ts` that build an ad hoc `{ orgId, apiKey }` object for a live settings-form lookup (an org/project name check before the row is even saved, so it has no real `id` yet). Since no function in `capellaClient.ts` ever reads `id`/`orgName`/`projectSummary`, narrowing the parameter type is more accurate than fabricating a meaningless id at every such call site.

## Risks / Trade-offs

- **[Risk]** A `ClusterRecord` whose org has genuinely-ambiguous duplicate `orgId`s, and which hasn't been re-synced since this fix shipped, can still resolve to the wrong credential during that one window. → **Mitigation**: self-heals on the very next sync cycle (default hourly, or on-demand via Refresh) - confirmed live by triggering a Refresh and observing the previously-403ing cluster gain the correct `orgConfigId` and then successfully turn off.
- **[Risk]** `isOrgConfigList` now rejects a `capellaOrgs` entry missing `id` outright - if the migration step were ever skipped or removed from `readSettings()`'s call chain, real configurations would fail validation and (per the pre-existing fallback design flagged in Decision 2) settings could be silently reset to defaults. → **Mitigation**: covered by the incident in Decision 2, which is exactly this failure mode; the fix keeps the migration and the stricter validation in the same landed state, and this design doc records the danger for future editors of `settings.ts`.

## Migration Plan

`migrateOrgConfigIds` in `readSettings()` handles the data migration transparently and idempotently on first read after upgrade - no manual step. Rollback would mean reverting `OrgConfig.id`/`ClusterRecord.orgConfigId` and the resolution-order changes in `manualActions.ts`/`reconciliation.ts`; existing `id` fields left on disk are simply ignored by the old code, harmless extra data.
