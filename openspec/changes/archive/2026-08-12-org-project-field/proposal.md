## Why

The Capella organizations settings table already resolves an org's real display name live from the API instead of asking the operator to type it (see `dashboard-settings`'s "Organization name is shown read-only" requirement) - the same problem exists for which project(s) an org's API key can actually see, and today that's invisible until sync runs. Capella API keys can be scoped to a single project or to the whole organization, and nothing in the UI shows which; an operator adding a new row has no way to confirm the key is pointed where they think it is without waiting for the next sync cycle.

## What Changes

- Add a read-only "Project" column to the Capella organizations settings table, resolved live from the Capella API the same way the "Name" column already is (debounced lookup once org ID + API key are both present, cached fallback on reload, own idle/loading/ok/error states).
- The resolved value is the single project's name when the key can see exactly one project, or the literal "All projects" when it can see more than one - inferred from how many projects `listProjects` returns for that key, since Capella's API doesn't expose an explicit org-scoped-vs-project-scoped flag.
- Persist the resolved value as a new optional `projectSummary` field on `OrgConfig`, following the exact same fallback-cache pattern as `orgName`.
- An "owner" column (API-key or org owner) was considered and explicitly dropped: Capella's API has no org- or project-level "owner" concept, only per-cluster `createdBy` attribution, which is unrelated to this settings table.

## Capabilities

### Modified Capabilities
- `dashboard-settings`: adds a new read-only, API-resolved "project summary" requirement for each configured organization row, alongside the existing organization-name requirement.

## Impact

- `src/types.ts`: `OrgConfig` gains an optional `projectSummary` field.
- `src/lib/capellaClient.ts`: no new endpoint - reuses the existing `listProjects`.
- `src/lib/settings.ts`: `isOrgConfigList` and `validateSettings`'s `capellaOrgs` reshape both need to accept/persist `projectSummary` (a bug was hit here during implementation - see design.md).
- `app/actions.ts`: new `fetchOrgProjectSummaryAction`; `saveOrgsAction` reads a new `projectSummary` form field.
- `app/settings/OrgsEditor.tsx`: new "Project" column; the debounce/staleness lookup logic used only by the Name cell is generalized into a shared hook so the Project cell reuses it instead of duplicating it.
