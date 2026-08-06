## Context

See proposal.md for motivation. Relevant current state:

- `ClusterRecord` (src/types.ts) already carries everything age-status needs: `createdAt`, `lastActivityAt`, `lastActivitySource`. Nothing new needs to be synced or persisted per cluster.
- `app/page.tsx` is a server component that reads the store and maps each `ClusterRecord` into a `ClusterRow` for the client-side `ClusterTable` (app/components/ClusterTable.tsx), which is built on TanStack Table (`getFilteredRowModel`, `getSortedRowModel`, etc. are already wired up).
- There is no settings concept anywhere in the app - `src/config.ts` reads env vars once at process boot. `src/lib/store.ts` is the only existing persistence pattern: a local JSON file, read/written directly, no database.

## Goals / Non-Goals

**Goals:**
- Compute age status at read time, purely from existing fields - no new fields added to `ClusterRecord` or the sync process.
- Make thresholds editable at runtime without a redeploy.
- Keep age status visually and logically independent from operational status.

**Non-Goals:**
- No notification, auto-remediation, or governance action (pause/delete) on Forgotten clusters - display only, per the original dashboard proposal's deferred scope.
- No per-org or per-project threshold overrides - one global set of thresholds for now.
- No settings beyond the four age-status thresholds - not building a general-purpose settings framework, just enough structure that it could grow later.

## Decisions

**Age-status computed server-side, alongside the existing row mapping.**
`app/page.tsx` already converts `createdAt` into `ageDays` per row. Age status is computed the same way, in the same mapping step, as a pure function of `(ageDays, lastActivityAt, lastActivitySource, settings)`. Alternative considered: compute client-side in `ClusterTable`. Rejected because settings (thresholds) are a server-side concern (read from the settings store) and the row-mapping step already does equivalent age math - splitting the two would mean fetching settings on both sides.

**Settings stored in a new `data/settings.json`, following the exact pattern of `src/lib/store.ts`.**
Alternative considered: env vars (rejected - proposal explicitly wants no-redeploy editing) and a database (rejected - no DB exists in this app and one file is consistent with the existing `clusters.json`/`history.json` approach). The settings module mirrors `store.ts`'s read/write-with-defaults shape rather than introducing a new persistence abstraction.

**Age status is a derived value, never persisted per cluster.**
Storing a computed tier on `ClusterRecord` would risk it going stale relative to the live thresholds (e.g. after an operator edits `staleDays`, stored tiers would lie until the next sync). Computing at read time guarantees the displayed tier always reflects current settings, at negligible cost (it's arithmetic over already-loaded data, not a new I/O path).

**Age-status filter implemented as a TanStack Table column filter, not a new filtering mechanism.**
`ClusterTable` already uses `getFilteredRowModel` for the existing free-text global filter. The age-status filter is a second, independent column-level filter (`columnFilters` state) on a new `ageStatus` column, using the same table instance - no parallel filtering system needed.

**Badge component: a second instance of the existing badge pattern, not a shared/merged component.**
The existing `StatusBadge` (ClusterTable.tsx) encodes operational-status color rules that don't apply to age tiers (New/Established/Stale/Forgotten need their own color scale, e.g. neutral -> amber -> red-ish, distinct from running/off/deleted). A new `AgeStatusBadge` sits in its own column; both badges render independently per the "shown independently" requirement.

## Risks / Trade-offs

- **Settings file corruption or manual edits producing invalid thresholds** -> Mitigation: settings module validates on read the same way it validates on write (positive integers, `newDays < staleDays < forgottenDays`); on invalid content it falls back to defaults rather than crashing the dashboard.
- **Concurrent edits to settings.json** (e.g. two admins saving at once) -> Mitigation: single shared-credential dashboard (per existing `dashboard-auth` capability) makes this a low-probability, low-stakes race; last-write-wins is acceptable, consistent with how `store.ts` already handles concurrent writes to `clusters.json`.
- **Ambiguity in the "unknown activity" fallback surprising operators** (a long-lived cluster with no observable activity log reads as "Forgotten" even if it's actually in constant use) -> Mitigation: this is a deliberate, already-discussed trade-off (see proposal), and the age-status badge should be scannable/hoverable enough to show *why* (age vs. activity) it landed in its tier - left to implementation, not spec, since it's a display affordance rather than new behavior.
