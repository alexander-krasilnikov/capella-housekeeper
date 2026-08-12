## Context

`app/settings/OrgsEditor.tsx` already resolves an org's display name live from the Capella API via a debounced effect (`OrgNameCell`), with a cached `orgName` fallback on `OrgConfig` for instant render on reload. See proposal.md for why the same treatment is now needed for project visibility.

## Goals / Non-Goals

**Goals:**
- Reuse the existing Name-column lookup mechanics for a new Project column, without duplicating the debounce/staleness logic.
- Correctly distinguish an org-scoped key (sees many projects) from a project-scoped key (sees one), using only what `listProjects` already returns.

**Non-Goals:**
- An "owner" column - explicitly dropped per proposal.md; Capella has no org/project owner concept to resolve.
- Letting an operator pick which project a row's key should be scoped to. That's a property of the API key itself, set in Capella, not something this settings page can change.

## Decisions

**1. Infer "single project" vs. "all projects" from `listProjects`'s result count, not from an explicit scope flag.**
Capella's API key model supports both org-wide and project-scoped keys, but nothing in the `/organizations/{orgId}` or key metadata exposes which a given key is - the only observable signal is how many projects `listProjects` returns for it. Exactly one project means the key is (or currently behaves as) project-scoped, so that project's name is shown. More than one means it can see across the org, shown as the literal "All projects" rather than picking one arbitrarily from the list (which would misrepresent the key's actual reach). Zero projects is treated as a lookup failure ("No projects visible to this key"), the same as an org name that fails to resolve.
- *Alternative considered*: list every visible project name, comma-joined. Rejected - doesn't fit a single-line cell as cleanly, and "All projects" answers the operator's actual question ("is this key scoped down or not?") more directly than an enumeration would.

**2. Generalize the Name cell's debounce/staleness logic into a shared `useDebouncedLookup` hook, rather than duplicating it for Project.**
`OrgNameCell` already had non-trivial state handling: a cached-value fast path, a request-id guard against out-of-order responses, and an initial-mount vs. operator-edit distinction (a stale cached value silently re-verifies in the background; an actual edit shows a fresh loading/error state). All of that is identical for the Project lookup, so it's extracted into `useDebouncedLookup(orgId, apiKey, initialValue, fetcher)` returning a generic `LookupState`, with `OrgNameCell` and the new `ProjectSummaryCell` as thin wrappers supplying their own server action. A shared `LookupCell` renders the idle/loading/ok/error states and the hidden form input for either.
- *Alternative considered*: copy `OrgNameCell` wholesale into a `ProjectSummaryCell`. Rejected - the two cells would immediately drift, and the request-id staleness guard is easy to get subtly wrong a second time.

**3. Fix a pre-existing whitelist bug in `src/lib/settings.ts` hit while wiring this up.**
`validateSettings` reshapes each parsed `capellaOrgs` entry with an explicit object literal (`{ orgId, orgName, apiKey }`) rather than passing the validated entry through, and `isOrgConfigList` only checks the fields it knows about. Adding `projectSummary` to `OrgConfig` and to `saveOrgsAction`'s payload was silently dropped on save - the new field never reached `data/settings.json`, verified by saving and inspecting the file directly. Both the validator (to type-check the new optional field) and the reshape (to actually keep it) needed the same treatment `orgName` already gets. This is a latent trap for any future optional field added to `OrgConfig` the same way; not fixed generically here since it wasn't part of the requested scope, but worth flagging.

## Risks / Trade-offs

- **[Risk]** The "one project = project-scoped, many = org-scoped" heuristic can be wrong for an org-scoped key that happens to only have one project created yet - it would show that project's name instead of "All projects", and the label would silently become stale if a second project is later created. → **Mitigation**: the lookup re-runs (debounced) whenever the row's orgId/apiKey change, and on every settings-page load, so it self-corrects as soon as a second project exists; accepted as consistent with the org-name lookup's own freshness model (react to what the API says now, not what was true when saved).
- **[Risk]** Verified against this environment's real Capella org (which has multiple project-scoped keys) but not against an actual org-level key returning more than one project, since none was available. → **Mitigation**: the "more than one" branch is a one-line, directly-read conditional (`projects.length === 1` vs. else), not exercised end-to-end but low-risk to leave unverified against live data.

## Migration Plan

Single-commit UI + data-model addition. `projectSummary` is optional on `OrgConfig`, so existing `data/settings.json` files without it continue to load unchanged (rendered as "idle" until the first live lookup fills it in). Rollback is a plain revert of the four touched files.
