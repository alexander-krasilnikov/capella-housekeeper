## Why

Nobody currently has a single view of every Couchbase Capella cluster running across the organization's Capella orgs and projects. Clusters are created ad hoc (including many short-lived, temporary ones), and there is no consolidated way to see what exists, who created it, how old it is, and what it costs. This change builds that visibility layer first, as the foundation for a future governance/cleanup tool — but this change is scoped to monitoring only; no cleanup, notification, or automated action capability is introduced here.

## What Changes

- Add a background sync process that authenticates to the Capella Management API (v4) using one API key per organization, and polls clusters across all projects in all configured organizations on an interval.
- Add a local JSON-file store (no external database) holding one flat collection of cluster records tagged with `orgId`/`projectId`, plus historical snapshots per cluster for trend fields.
- Derive fields the Capella API does not provide directly: cluster **owner** (from the creation event's initiating user, user-overridable), **age** (from `createdAt`), and an **estimated real-time cost** (node spec × published Capella credit rates × uptime), shown alongside the **actual billed cost** pulled from the Billing API (which lags up to ~5 days).
- Add retention handling: when a cluster disappears from the Capella API, keep a tombstone record of its last known state instead of deleting it immediately; purge tombstoned records and their snapshot history after 7 days (configurable).
- Add a Next.js dashboard with a single flat table unifying clusters from all orgs and projects, filterable and sortable on every column (org, project, name, created date, last activity, owner, config summary, age, estimated cost, actual cost).
- Add simple login/password session protection for the dashboard (not HTTP Basic Auth) — single shared credential is acceptable for this phase.
- Flag an open risk to resolve early: it is unconfirmed whether Capella's Activity Log (the source for "last activity" and a corroborating signal for "owner") is reachable via the public Management API versus console-only. If unavailable via API, "last activity" falls back to the sync process's own observation of state/config changes, or is surfaced as unavailable.

Explicitly **not** in this change: cleanup/governance actions (pause, delete, notify), a rule engine for flagging stale/orphaned/cost-outlier clusters, exemption/snooze mechanics, and multi-user action attribution/audit trails. These are intended for a later change built on top of this monitoring foundation.

## Capabilities

### New Capabilities
- `cluster-sync`: Background process that authenticates to the Capella Management API per organization, polls clusters/projects/billing on an interval within API rate limits, derives owner/age/estimated-cost, persists snapshots to the local JSON store, and manages tombstone/retention lifecycle for deleted clusters.
- `cluster-dashboard-ui`: Next.js frontend presenting a single unified, filterable, sortable table of all clusters across all organizations and projects, with a compact configuration summary and side-by-side estimated/actual cost columns.
- `dashboard-auth`: Login/password session protection guarding access to the dashboard.

### Modified Capabilities
(none — this is a new project with no existing specs)

## Impact

- New Node.js/Next.js application (new codebase, currently empty repo).
- New local JSON data store on disk (single always-on process; not compatible with serverless deployment).
- External dependency: Couchbase Capella Management API v4 (Bearer-token org API keys), subject to 100 req/min per key and 90s/120s timeouts.
- Requires one Capella organization API key per org to be configured/stored securely.
- Open risk: Activity Log reachability via the Management API is unconfirmed and affects the "last activity" and "owner" derivation design (see design.md for the spike/fallback plan).
