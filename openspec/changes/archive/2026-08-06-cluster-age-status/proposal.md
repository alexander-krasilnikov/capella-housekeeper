## Why

Clusters created ad hoc and left running are a cost/hygiene risk, but today the dashboard has no way to surface which clusters are old and unused versus long-lived and legitimately in use — the original cluster-monitoring-dashboard proposal explicitly deferred "a rule engine for flagging stale/orphaned clusters" to a later change. This is that change: an age-derived status, tiered by configurable day thresholds and moderated by known activity, so forgotten clusters stand out without flagging genuinely active long-running ones.

## What Changes

- Add a new, independent age-status dimension per cluster with four tiers — `New` → `Established` → `Stale` → `Forgotten` — computed from `createdAt` age and moderated by `lastActivityAt`/`lastActivitySource`:
  - Tier boundaries are driven by three day thresholds: `newDays` (New→Established), `staleDays` (Established→Stale), `forgottenDays` (Stale→Forgotten).
  - A cluster with known activity (`lastActivitySource` is `"activity-log"` or `"sync-observed"`) within a configurable `inactivityGraceDays` window is held at `Established` regardless of age — it's in use, not forgotten.
  - A cluster with `lastActivitySource: "unknown"` ignores activity entirely and tiers purely on age (no assume-active/assume-inactive fallback).
- Introduce a settings concept for this app (none exists today — only boot-time env vars): a new `settings.json` file alongside the existing `data/clusters.json`/`data/history.json`, holding the four thresholds with sensible defaults, plus a small settings page in the dashboard to view and edit them without a redeploy.
- Add a second status badge/column to the cluster table for the age-status tier, shown independently alongside the existing operational status badge (a cluster can be, e.g., `Active` + `Forgotten` at once — the two are never merged).
- Add a dropdown filter for the age-status tier (today status is only reachable via free-text fuzzy search; this new tier is meant for triage, so it needs a real filter).

## Capabilities

### New Capabilities
- `cluster-age-status`: Computes the four-tier age-derived status per cluster from creation age and activity recency, per the configured thresholds.
- `dashboard-settings`: Persists and exposes user-configurable app settings (initially: the four age-status thresholds) via a JSON file store and a settings page, editable without a redeploy.

### Modified Capabilities
- `cluster-dashboard-ui`: Table gains a second, independent status column/badge for age-status, plus a dropdown filter for it, alongside the existing operational status column.

## Impact

- **Data model**: no changes to `ClusterRecord` — age-status is derived at read time from existing `createdAt`/`lastActivityAt`/`lastActivitySource` fields, not persisted per cluster.
- **New storage**: `data/settings.json`, following the existing JSON-file-store pattern in `src/lib/store.ts`.
- **New route**: a settings page/route in the dashboard for editing thresholds.
- **UI**: `app/components/ClusterTable.tsx` gains a new badge component/column and a filter control; `app/page.tsx` gains the age-status computation in its row-mapping step.
- **No changes** to `cluster-sync` or `dashboard-auth` — sync already captures the fields this depends on, and auth is unaffected.
