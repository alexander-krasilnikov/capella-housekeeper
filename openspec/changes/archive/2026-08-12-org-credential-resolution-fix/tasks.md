## 1. Stable identity for each org-config entry

- [x] 1.1 Add `OrgConfig.id: string` and `ClusterRecord.orgConfigId?: string` to `src/types.ts`.
- [x] 1.2 `src/lib/settings.ts`: add `migrateOrgConfigIds` (backfills a fresh UUID for any entry missing `id`); update `isOrgConfigList` to require it; update `validateSettings`'s `capellaOrgs` reshape to carry it through.
- [x] 1.3 Wire the migration into `readSettings()`, persisting immediately when a backfill actually occurred (reference-equality check against the pre-migration object) - see design.md Decision 2 for why lazy persistence isn't safe here.
- [x] 1.4 `app/settings/OrgsEditor.tsx`: add `id` to `Row`/`toRows`; `addRow` generates one via `crypto.randomUUID()`; round-trip it through a hidden `orgConfigId` input.
- [x] 1.5 `app/actions.ts`: `saveOrgsAction` reads `orgConfigId` and includes it as `id` (defensive `crypto.randomUUID()` fallback for a hand-crafted request without one).

## 2. Sync records which credential saw each cluster

- [x] 2.1 `src/lib/sync.ts`: set `orgConfigId: org.id` when building each `ClusterRecord`.

## 3. Fix resolution at every write site

- [x] 3.1 `src/lib/manualActions.ts`: add exported `resolveOrgConfig(record, settings)` (orgConfigId match, falling back to orgId match); use it in `manualTurnOff` and `manualDelete` in place of the old ambiguous `orgId`-only `find`.
- [x] 3.2 `src/lib/reconciliation.ts`: `runReconciliationPass` resolves the same way (`orgsByConfigId` lookup first, `orgsByOrgId` fallback) in place of the old single `orgId`-keyed `Map`.
- [x] 3.3 `src/lib/capellaClient.ts`: narrow every request function's `org` parameter from `OrgConfig` to a new `ApiCredential = Pick<OrgConfig, "orgId" | "apiKey">`, fixing the two ad hoc `{ orgId, apiKey }` call sites in `app/actions.ts` that don't have a real `id` to give it.
- [x] 3.4 Add `src/lib/manualActions.test.ts` covering `resolveOrgConfig`: picks the matching `orgConfigId` entry over a same-`orgId` sibling; falls back to `orgId` when `orgConfigId` is absent; falls back to `orgId` when `orgConfigId` no longer matches any entry.

## 4. Verify against the real failure

- [x] 4.1 `npm run typecheck` clean; `npm test` 56/56 passing (53 prior + 3 new).
- [x] 4.2 Triggered `readSettings()` against the real `data/settings.json` (3 entries, no `id` yet); confirmed migration backfilled and persisted stable UUIDs, and a second read left them unchanged (idempotent).
- [x] 4.3 Triggered a real sync (Refresh); confirmed `refinedmargaretburnett` (the cluster from the original 403) picked up `orgConfigId` matching the "sashakatjatest" entry - not the "demo" entry that was wrongly used before.
- [x] 4.4 Performed the actual manual Turn-off against the live Capella API for that cluster: succeeded ("Turned off refinedmargaretburnett.") where it previously 403'd.
- [x] 4.5 **Incident during 1.2/1.3**: landing the stricter `isOrgConfigList` before the migration existed let the live dev server's background sync tick wipe `capellaOrgs` to `[]` via `readSettings()`'s pre-existing invalid-settings fallback. Recovered from a pre-round backup (API keys intact; `projectSummary` re-fetched live afterward). See design.md Decision 2.
