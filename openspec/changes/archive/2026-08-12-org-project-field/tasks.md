## 1. Data model and API lookup

- [x] 1.1 Add optional `projectSummary?: string` to `OrgConfig` in `src/types.ts`, mirroring `orgName`'s fallback-cache pattern.
- [x] 1.2 Add `fetchOrgProjectSummaryAction(orgId, apiKey)` in `app/actions.ts`: calls `listProjects`, returns the single project's name when exactly one is visible, `"All projects"` when more than one, and an error result when zero (per design.md Decision 1).
- [x] 1.3 Extend `saveOrgsAction` to read a `projectSummary` form field per row and include it in the persisted `OrgConfig[]`.

## 2. Settings UI

- [x] 2.1 Extract `OrgNameCell`'s debounce/staleness logic into a shared `useDebouncedLookup` hook plus a shared `LookupCell` renderer (design.md Decision 2), so `OrgNameCell` becomes a thin wrapper.
- [x] 2.2 Add `ProjectSummaryCell` using the same hook with `fetchOrgProjectSummaryAction`.
- [x] 2.3 Add a "Project" column to the table in `OrgsEditor.tsx` (between Name and Organization ID), including its header, `addRow`'s new-row shape, and `toRows`'s mapping from `OrgConfig`.

## 3. Fix persistence bug and verify

- [x] 3.1 Fix `src/lib/settings.ts`: `isOrgConfigList` didn't type-check `projectSummary`, and `validateSettings`'s `capellaOrgs` reshape didn't carry it through - found by saving the settings form and inspecting `data/settings.json` directly, where the field was silently missing (design.md Decision 3). Both fixed to match `orgName`'s treatment.
- [x] 3.2 `npm run typecheck` clean; `npm test` 53/53 passing (unchanged - no new pure logic to unit-test here, the lookup is a thin API wrapper).
- [x] 3.3 Verify with Playwright against this environment's real Capella org (3 project-scoped API keys): "Project" column header renders; all three rows resolve real project names (`demo`, `sashakatjatest`, `Alex Testing`) rather than "All projects", consistent with each key being project-scoped; no console errors.
- [x] 3.4 Verify save round-trip: submitted the form, confirmed "Organizations saved", and confirmed `data/settings.json`'s `capellaOrgs` entries gained the correct `projectSummary` values (caught task 3.1's bug this way, then re-verified clean after the fix); reloading the settings page shows the cached values immediately (no "Looking up…" flash) while a fresh lookup re-confirms them in the background.
