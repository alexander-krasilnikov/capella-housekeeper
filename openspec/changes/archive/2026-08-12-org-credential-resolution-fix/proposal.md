## Why

A real manual turn-off failed against the live Capella API with a 403: `Couldn't turn off refinedmargaretburnett: ... returned 403`. Root cause - the `org-project-field` change made it a supported configuration for multiple `capellaOrgs` entries to share one `orgId` (one Capella org, several project-scoped API keys), but every place that resolves *which* API key to use for an already-synced cluster (`manualTurnOff`/`manualDelete`, and the reconciliation loop) looked it up by `orgId` alone. With duplicates, that's ambiguous - `Array.find`/`Map` construction silently picked an arbitrary entry, which 403s unless it happens to be the one actually scoped to that cluster's project.

## What Changes

- Each `capellaOrgs` entry gets a stable `id`, independent of `orgId` (which is no longer guaranteed unique) - generated for new rows, and backfilled once for existing settings files via a migration in `readSettings()`.
- Cluster sync now records, on each `ClusterRecord`, the specific `orgConfigId` of the entry that actually saw it - the one fact that disambiguates duplicate `orgId`s, known only at the moment `listClusters` succeeds.
- `manualTurnOff`, `manualDelete`, and the reconciliation loop's action step now resolve the API key via that `orgConfigId` first, falling back to an `orgId` match only for records synced before this fix (self-healing on the next sync).
- `capellaClient.ts`'s request functions now take a narrower `Pick<OrgConfig, "orgId" | "apiKey">` type instead of the full `OrgConfig`, since none of them need `id`/`orgName`/`projectSummary` - this avoids ad hoc credential lookups (e.g. the settings-form live name/project lookups) needing to fabricate a meaningless `id`.

## Capabilities

### Modified Capabilities
- `dashboard-settings`: clarifies that multiple organization entries may share an organization ID (distinct project-scoped API keys against one Capella org) and are each tracked by their own stable identity.
- `manual-cluster-actions`: adds a requirement that manual actions use the specific credential that discovered the cluster, not an arbitrary same-`orgId` entry.
- `cluster-lifecycle-actions`: adds the equivalent requirement for the reconciliation loop's automatic actions.

## Impact

- `src/types.ts`: `OrgConfig.id` (new, required); `ClusterRecord.orgConfigId` (new, optional).
- `src/lib/settings.ts`: `migrateOrgConfigIds` (new migration, called from `readSettings`), `isOrgConfigList`/`validateSettings` updated to carry `id`.
- `src/lib/sync.ts`: records `orgConfigId: org.id` on every built `ClusterRecord`.
- `src/lib/manualActions.ts`: new exported `resolveOrgConfig` helper, used by `manualTurnOff`/`manualDelete`; `manualActions.test.ts` (new) covers it directly.
- `src/lib/reconciliation.ts`: `runReconciliationPass` resolves the acting org the same way (`orgConfigId` first, `orgId` fallback).
- `src/lib/capellaClient.ts`: every request function's `org` parameter narrowed to `ApiCredential`.
- `app/settings/OrgsEditor.tsx`, `app/actions.ts`: `id` round-trips through the organizations form as a hidden field, generated client-side for a new row.
