## Context

Today `app/components/DashboardTabs.tsx` owns the entire authenticated UI for `/`: the sidebar (`<aside>` - brand mark, Clusters/History tab switcher, Settings link, theme toggle, Slack indicator, collapse state persisted to `localStorage`), the top header bar (page title + Log out), and the tab content itself. `app/settings/page.tsx` is a separate, unrelated route - a bare `<main>` with only a "← Back to dashboard" link, rendering its own `SettingsShell` (an unrelated *secondary* nav for settings sub-sections, e.g. "Thresholds" / "Sync & retention" / "Orgs"). Settings relies on being a real Next.js route: its server actions (`saveSettingsAction`, etc.) redirect back to `/settings?saved=1` or `?error=...`, and `SettingsPage` reads those via `searchParams` to render flash banners. See proposal.md - Why.

`ClusterTable.tsx`'s Action-column controls (Ask/Turn off/Delete/History) are a module-level `columns` array; per-row, per-render data that isn't a plain column value already flows through a `TableMeta` augmentation (`askResults`/`setAskResult`) rather than through the columns array itself.

`capellaClient.ts`'s `turnOffCluster` comment already documents the reactivation mechanism: `POST` to the same `activationState` sub-resource that `DELETE` turns off.

## Goals / Non-Goals

**Goals:**
- One shared sidebar+header shell, mounted around both `/` and `/settings`, so navigating between them never drops the chrome.
- A "Developer options" settings section with a single toggle, default off, that gates a new manual "Turn on" control end-to-end.

**Non-Goals:**
- Restructuring `SettingsShell`'s own sub-section navigation (Thresholds/Sync/Orgs/etc.) - untouched.
- Changing the owner-consent/notification workflow, or any auth/permission model - turn-on reuses the exact no-extra-auth, bypasses-consent posture already accepted for manual turn-off/delete.
- Folding Settings into `DashboardTabs` as client-state tab (considered and rejected - see Decisions).

## Decisions

**Shared shell as a real, separately-mounted component, not a third client tab.** Extract the sidebar+header into a new `AppShell` client component, mounted independently in both `DashboardTabs` (for `/`) and a small wrapper around the settings content (for `/settings`) - not folded into `DashboardTabs`'s `tab` state as a third value. Settings' flash-banner mechanism depends on being a real route with server-action redirects and `searchParams`; turning it into a client tab would require rebuilding that as client state for no benefit. `AppShell` takes `activeNav: "clusters" | "history" | "settings"` and `title: string`, and renders `children` into the scrollable content area below its header.

**AppShell owns collapse state.** The sidebar's collapsed/expanded boolean and its `localStorage` read/write move from `DashboardTabs` into `AppShell` itself. Because both routes mount the same `AppShell` reading the same `localStorage` key, cross-page persistence (dashboard-shell's requirement) falls out for free - no state-syncing between routes is needed.

**Clusters/History nav items are context-dependent; Settings is always a link.** `AppShell` accepts an optional `onSelectTab?: (tab: "clusters" | "history") => void`. `DashboardTabs` passes its own `setTab` so Clusters/History remain in-place client switches with no navigation or refetch (unchanged behavior). The settings wrapper omits it, so `AppShell` falls back to rendering those two items as plain `<Link href="/">` - clicking either from Settings navigates to the dashboard (defaulting to the Clusters tab; reselecting History from there is one click, not worth threading a query param for). The Settings item is always a real link to `/settings`; its active state is a plain boolean prop (`activeNav === "settings"`), not `usePathname` - the page already knows which route it is.

**Settings page's own header is trimmed.** Its `h1`/description move to be page content only (description stays; the redundant "Settings" `h1` and "← Back to dashboard" link are dropped) since `AppShell`'s shared header now shows the page title and Settings is reachable from the sidebar at all times.

**Feature-flag threading follows the existing `askResults` pattern.** `developerTurnOnEnabled` is passed into `ClusterTable` and added to its `TableMeta` augmentation (alongside `askResults`/`setAskResult`), read inside the Action column's cell renderer - not by turning the module-level `columns` array into a `useMemo` factory. Smaller diff, and matches how the codebase already threads per-render, non-column data into cells.

**Turn-on mirrors turn-off exactly, at every layer.** `capellaClient.ts` gains `turnOnCluster` (`POST` instead of `DELETE`, same path as `turnOffCluster`). `manualActions.ts` gains `manualTurnOn`, reusing `resolveClusterAndOrg`/`resolveOrgConfig`, the same supersede-live-message call, the same re-read-fresh-before-write discipline, and a new `"manual-turn-on"` history trigger. `ManualTurnOnButton` mirrors `ManualTurnOffButton`'s confirm-modal component exactly, disabled when the cluster is not currently off (inverse of turn-off's disabled-when-off).

**History trigger addition is additive only.** `"manual-turn-on"` is added to `HistoryTrigger` (types.ts) and to `TRIGGER_LABEL`/the lowercase description map (historyFields.ts), following `"manual-turn-off"`/`"manual-delete"`'s exact pattern. No `cluster-history-ui` spec change - its "consent or lifecycle action" wording already covers it generically.

## Risks / Trade-offs

- **[Risk]** Loosening manual-cluster-actions' previously-unconditional "no reactivation control" guarantee could look like reopening a settled safety decision. → **Mitigation:** the prohibition still holds whenever the toggle is off (the default); the toggle is explicit, labeled "Developer options," and its state is visible in settings - nothing changes silently.
- **[Risk]** Manual turn-on bypasses owner consent entirely, same as turn-off/delete already do - an operator could reactivate a cluster its owner had turned off on purpose. → **Mitigation:** identical risk profile to the already-accepted manual turn-off/delete behavior; not a new consent-bypass class, and explicitly scoped to the current test period behind a default-off toggle.
- **[Risk]** `AppShell` extraction touches `DashboardTabs` (large, live component) and `settings/page.tsx` together; a layout regression would hit every authenticated screen. → **Mitigation:** keep the extraction mechanical (move existing JSX/state, minimal new behavior beyond the two nav-item variants); click through both routes - collapse/expand, tab switching, Settings navigation and back, page reload - before calling it done.
- **[Risk]** A new top-level `developerTurnOnEnabled` boolean must survive `settings.ts`'s deliberately strict gap-fill/never-silently-reset logic (see its own comment about a prior incident that wiped live API keys). → **Mitigation:** add it to `DEFAULT_SETTINGS` and `validateSettings` exactly like an existing plain boolean (e.g. per-tier `autoTurnOffOnInaction`) - it's filled in only when entirely absent, never overwritten when present; no new migration function needed.

## Migration Plan

Not a data migration. An existing `settings.json` simply gains `developerTurnOnEnabled: false` the next time `readSettings()` runs its existing "fill in fields entirely absent" gap-fill path - no explicit migration function needed, no operator action required. Rollback is a plain code revert; the toggle already defaults off, so no persisted state needs cleanup.
