## Why

The dashboard currently switches between the Clusters table and the History (lifecycle audit log) view via a horizontal segmented tab control above the table. A Stitch-generated design exploration (recorded in `DESIGN.md`, "Sidebar exploration" section) mocked an alternative: a persistent left sidebar nav. It reads better at this information density and gives the two views more visual permanence than a tab bar competing with the table's own toolbar. Neither the set of views nor their content changes - only how a user switches between them.

## What Changes

- Replace the top segmented tab control in `DashboardTabs` with a left sidebar nav (Clusters / History), styled per the Stitch mock: `w-64` fixed-width sidebar, `canvas` background, `line`-colored right border, active item on `brand-soft` background with `brand` text, inactive items in `ink-muted` hovering to `ink` + `panel-hover`.
- Item labels keep their existing row-count badges (e.g. "Clusters 12"), carried over unchanged from the current tab control.
- Icons are hand-drawn inline SVGs matching the codebase's existing icon style (no new font or icon-library dependency - the Stitch mock's Material Symbols web font is not used).
- No new nav items: the mock's "Templates" and "Analytics" entries are not real features and are intentionally omitted.
- Page layout goes full-bleed: `app/page.tsx`'s outer wrapper is a full-height flex column instead of a `mx-auto ... sm:w-[90%]` centered box, so the header spans the full viewport width and the sidebar is genuinely full-height and flush to the left edge (not boxed inside a centered container) - the outer header's own content (wordmark, Slack indicator, theme toggle, Settings link, Refresh, Log out) is unchanged.
- The table now fills the full width of its content-pane container instead of 90% of it, and the sidebar is narrower (`w-52` instead of `w-64`) - both per direct user feedback after reviewing the first implementation pass against the mock (it read as a boxed "side panel" with unused margin rather than a real sidebar).
- The sidebar is user-collapsible: a toggle button shrinks it to an icon-only `w-16` rail (labels available via native tooltip), with the choice persisted in `localStorage` across reloads - also direct user feedback, added after the width revision above.
- A second Stitch mock ("Dashboard: High-Density Ops View") is applied selectively, per explicit user scoping (see design.md Decision 8): header/toolbar/table visual density (rounded-xl cards, shadow-sm, tighter spacing) is adopted; a "Total Clusters" stat tile is added (real data); a weekly bar chart is added but grounded in real audit-log event counts and relabeled "Weekly Activity" instead of the mock's fabricated "Cluster Performance" percentages. Explicitly NOT adopted: the mock's hover-to-expand sidebar with placeholder Organizations/Owners/Reports nav items, its Active Nodes/CPU/Memory stat tiles (no such data exists), and its per-row-contextual Action column / missing Consent column (would conflict with the existing `cluster-dashboard-ui` "Unified action column" requirement).
- The header's subtitle ("N clusters across all configured organizations") is removed, and its remaining secondary controls (Settings, Theme, Slack status) move into the sidebar footer with a collapsed-icon variant each (design.md Decision 9); the header now holds only the title and logout. `RefreshButton` moves from the header into `ClusterTable`'s toolbar, next to the Columns button - it's now only reachable from the Clusters view, a known trade-off from this explicit instruction.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `cluster-dashboard-ui`: "Table width matches its container proportionally" changes from "90% of container width on ≥640px, full width below that" to "full container width at every viewport width" - the table's content-pane container now provides edge breathing room via its own padding, not a proportional inset. This is a direct consequence of the full-bleed sidebar layout above, not an independent behavior change: see design.md Decision 6.

The switch mechanism between Clusters and History itself is still not spec'd behavior (neither `cluster-dashboard-ui` nor `cluster-history-ui` mentions tabs/sidebar) and remains out of scope for a capability delta.

## Impact

- `app/components/DashboardTabs.tsx`: nav rendering changes from a horizontal tab bar to a sidebar (narrower, `w-52`, full-height); the table's container wrapper drops its 90%-width inset in favor of full width; view-switching state/logic (`useState<Tab>`) is unchanged.
- `app/page.tsx`: wrapping layout changes from a centered `mx-auto sm:w-[90%]` box to a full-height, full-width flex layout so the sidebar can be genuinely full-bleed.
- `openspec/specs/cluster-dashboard-ui/spec.md`: "Table width matches its container proportionally" requirement text changes on archive (see delta in this change's `specs/cluster-dashboard-ui/spec.md`).
- No API, data model, dependency, or route changes. No new packages.
