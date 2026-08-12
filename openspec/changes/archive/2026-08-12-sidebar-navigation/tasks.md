## 1. Sidebar nav in `DashboardTabs.tsx`

- [x] 1.1 Add two small inline SVG icons (stacked-database glyph for Clusters, clock/history glyph for History) as local components or inline JSX within `DashboardTabs.tsx` - no new icon package.
- [x] 1.2 Replace the horizontal `role="tablist"` segmented control with a vertical `<aside>` nav list, keeping `role="tablist"` / `role="tab"` / `aria-selected` semantics on the new markup.
- [x] 1.3 Style nav items per design.md Decision 1-3 and `DESIGN.md`'s "Sidebar exploration" tokens: `w-64` aside, `canvas` background, `line` right border; active item `brand-soft` background + `brand` text + bold; inactive `ink-muted` hover `ink` + `panel-hover`; `rounded-lg` items.
- [x] 1.4 Move the existing row-count badge (`clusterRows.length` / `historyRows.length`) into each nav item, next to its label.
- [x] 1.5 Restructure the component's root JSX to a flex row: sidebar `<aside>` + a flex-1 container rendering the active table (`ClusterTable` or `HistoryTable`), replacing the current vertical stack (tab bar above, table below).

## 2. Page layout integration

- [x] 2.1 In `app/page.tsx`, confirm the existing header block (wordmark, Slack indicator, `ThemeToggle`, Settings link, `RefreshButton`, logout) stays full-width above the sidebar+content row, unchanged.
- [x] 2.2 Adjust spacing/padding around `<DashboardTabs />`'s mount point in `app/page.tsx` as needed so the sidebar sits flush against the content without doubled padding. Revised (see design.md Decision 1, second pass): visual review of the first pass showed the boxed/inset sidebar reading as a "side panel" and wasting the page's outer 10% margin. `app/page.tsx`'s outer wrapper is now a full-height `flex flex-col`, `mx-auto ... sm:w-[90%]` removed from the page level; the header gets its own `px-6 py-4` + `border-b`; the sidebar+content row is `flex flex-1` so the sidebar (`border-r`, no rounded box) is genuinely full-bleed and full-height. The table's existing 90%-of-container sizing moves into `DashboardTabs`' content pane (`mx-auto w-full sm:w-[90%]` wrapping just the active table), preserving the `cluster-dashboard-ui` requirement at its original (now content-pane-scoped) meaning.

## 3. Verification

- [x] 3.1 Run the app locally and manually verify: clicking each sidebar item switches between Clusters and History, active-item styling matches the design tokens, in both Light and Dark theme. Verified via Playwright against `npm run dev` with real login (`admin`/`change-me` from `data/settings.json`): Clusters↔History switch works, active item shows `brand-soft`/`brand` bold in light and the dark-token equivalents in dark, no console errors.
- [x] 3.2 Verify the `cluster-dashboard-ui` requirements still hold with the sidebar present: no horizontal scrolling and the table still visually occupies ~90% of its (now-narrower) container at 640px+ widths. Confirmed at 1440px viewport: table wraps cell content within the narrower flex remainder next to the sidebar, no horizontal scrollbar.
- [x] 3.3 Verify keyboard operability of the sidebar nav (tab to focus, Enter/Space to activate) and that `aria-selected` updates correctly. Nav items are plain `<button>`s (native focus/activate semantics); focus ring confirmed visually, `aria-selected` toggles with the active `tab` variable.

## 4. Narrower sidebar, full-width table (direct user feedback, design.md Decision 6)

- [x] 4.1 Narrow the sidebar in `DashboardTabs.tsx` from `w-64` to `w-52`.
- [x] 4.2 Drop the `mx-auto sm:w-[90%]` inset wrapper around the table in `DashboardTabs.tsx`'s content pane so the table fills the pane's full width.
- [x] 4.3 Re-verify visually (Playwright, both themes) that the sidebar reads as narrower and the table now spans the full content-pane width with no console errors, and re-run `npm run typecheck` / `npm test`. All confirmed: no console errors, typecheck clean, 36/36 tests pass.

## 5. Collapsible sidebar (direct user feedback, design.md Decision 7)

- [x] 5.1 Add a collapse/expand toggle button (chevron icon, rotates 180deg) at the top of the sidebar in `DashboardTabs.tsx` (moved here from an initial bottom placement after it collided with Next.js's dev-mode floating indicator badge - see design.md Decision 7).
- [x] 5.2 In collapsed state, sidebar narrows to `w-16` and nav items show only their icon (centered, no label/count), with the label available via a native `title` tooltip.
- [x] 5.3 Persist collapsed/expanded state in `localStorage` (`capella-housekeeper:sidebar-collapsed:v1`), following the same mounted-gate load/save pattern `ClusterTable.tsx` uses for its own persisted config (including the `configLoaded`-equivalent guard on the save effect), so the choice survives reloads. First pass omitted the guard and clobbered the persisted value on every mount - caught by the reload step of 5.4's Playwright verification and fixed (see design.md Decision 7).
- [x] 5.4 Re-verify visually (Playwright, both themes): toggle collapses/expands the sidebar, icons remain clickable and switch views while collapsed, reloading preserves the collapsed state, no console errors; re-run `npm run typecheck` / `npm test`. All confirmed: `ASIDE_WIDTH_AFTER_RELOAD: 64` (i.e. `w-16`, correctly still collapsed post-reload), no console errors, typecheck clean, 36/36 tests pass.

## 6. Selective adoption of "Dashboard: High-Density Ops View" mock (design.md Decisions 8-9)

- [x] 6.1 Remove the header subtitle ("N clusters across all configured organizations") in `app/page.tsx`.
- [x] 6.2 Compute the rolling last-7-days activity count from `historyRows` **client-side, inside `DashboardTabs.tsx`**, gated behind a mounted `useEffect` (not computed directly during render, and not computed server-side in `page.tsx`) - day boundaries and weekday labels depend on the visitor's own local timezone/locale, which a server component can't know, matching this codebase's existing pattern for all other locale/timezone-sensitive formatting (`FormattedDateTime`, `ThemeToggle`'s system-preference resolution). Initial render shows no chart (or a loading placeholder); the effect fills it in post-mount.
- [x] 6.3 In `DashboardTabs.tsx`, render a "Total Clusters" stat tile (from `clusterRows.length`, no mount-gate needed - not locale/timezone-sensitive) and the "Weekly Activity" bar chart (7 bars, day labels, count shown per bar, scaled to the week's own max - no fake percentage axis) above `ClusterTable`, visible only on the Clusters view.
- [x] 6.4 Move `SlackConnectionIndicator`, `ThemeToggle`, and the `/settings` link out of `app/page.tsx`'s header into a footer block (`mt-auto`) within `DashboardTabs.tsx`'s sidebar `<aside>`; `DashboardTabs` now accepts `initialSlackStatus` to forward to `SlackConnectionIndicator`. Header keeps only the title and logout.
- [x] 6.5 Add a `collapsed` prop to `ThemeToggle.tsx`: expanded keeps the existing 3-button control; collapsed shows one icon (new `SunIcon`/`MoonIcon`/`MonitorIcon`) for the current mode, cycling Light → Dark → System on click.
- [x] 6.6 Add a `collapsed` prop to `SlackConnectionIndicator.tsx`: expanded keeps the existing badge (restyled slightly - `text-xs`, no border - to fit the sidebar); collapsed shows only the status dot in an icon-sized slot with the existing `title` tooltip, omitting the Reconnect button.
- [x] 6.7 Add a `SlidersIcon` (settings glyph) and a sidebar-footer link to `/settings`, styled like `NavItem` but without tab semantics.
- [x] 6.8 Move `RefreshButton` from `app/page.tsx`'s header into `ClusterTable.tsx`'s toolbar, immediately after the Columns button.
- [x] 6.9 Apply visual density restyle: table panel and toolbar controls (search input, age-status filter group, Columns button, pagination footer) gain `rounded-xl`/`shadow-sm` to match the mock's card language; table panel gains `overflow-hidden` so its corners clip cleanly at the larger radius.
- [x] 6.10 Re-verify visually (Playwright, both themes, collapsed and expanded sidebar): stat tile and chart show real numbers (Total Clusters: 2; Weekly Activity bars matching the 12 real audit-log entries), Settings/Theme/Slack work correctly collapsed and expanded (theme cycles Dark → System → Light correctly when collapsed, Settings link navigates to `/settings`), Refresh works from its new location, no console errors throughout; re-ran `npm run typecheck` (clean) / `npm test` (36/36 passing). Noted but not fixed: in `next dev` only, the sidebar footer's last item (Slack dot) visually overlaps Next.js's own floating dev-mode indicator badge in the bottom-left corner - cosmetic only (that badge doesn't exist in production), not a functional blocker like the earlier collapse-toggle collision.

## 7. Sidebar brand block + page-title header (design.md Decision 10)

- [x] 7.1 Add a `BroomIcon` and a brand block at the top of the sidebar (`h-16`, `border-b`): `bg-brand` rounded square with the icon in `brand-ink`, plus a `text-brand` "Housekeeper" wordmark when expanded (short form - the full name doesn't fit beside the icon at `w-52`).
- [x] 7.2 Move the header inside `DashboardTabs` so the sidebar is full-height from the viewport's top-left corner, and give it a view-dependent page title ("Cluster Management" / "Lifecycle History") plus the logout form; import `logoutAction` directly into the client component (same pattern as `RefreshButton`/`refreshAction`).
- [x] 7.3 Reduce `app/page.tsx` to data loading plus a single `<DashboardTabs />` - no chrome of its own.
- [x] 7.4 Switch the shell from `min-h-screen` to `h-screen` + `overflow-hidden`, moving scroll into the content pane so brand/nav/title stay pinned; give the sidebar's nav section `overflow-y-auto` so short viewports can't clip the footer controls.
- [x] 7.5 Verify (Playwright): title switches per view (`"Cluster Management"` / `"Lifecycle History"` confirmed), logout from its new location still redirects to `/login`, brand block renders correctly collapsed (icon only) and expanded (icon + wordmark) in both themes, and the sidebar footer stays reachable at a 500px-tall viewport (confirmed visible). No console errors; `npm run typecheck` clean, 36/36 tests pass.

## 8. Full wordmark, owners tile, created-clusters chart, daily-spend chart (design.md Decision 11)

- [x] 8.1 Restore the full two-tone wordmark: "Capella" in `text-ink` + "Housekeeper" in `text-brand`, fitted at `w-52` by dropping to `text-sm`/`tracking-tight` with `px-3`/`ml-2.5` (rather than widening the sidebar back).
- [x] 8.2 Add a "Cluster Owners" stat tile (new `OwnersIcon`) counting distinct `owner` values, excluding the `"Unknown"` placeholder; generalise the tile into a reusable `StatTile`.
- [x] 8.3 Re-point the weekly chart at clusters created per local day (renamed "Clusters Created"), replacing the audit-log event counts from Decision 8.
- [x] 8.4 Add `src/lib/costSeries.ts` with a pure `dailySpendFromSnapshots()` deriving per-day spend from month-to-date readings (increase across the day; a decrease = new billing month; `null` not `0` when not derivable), plus `costSeries.test.ts` covering deltas, month reset, multi-cluster summing, carry-forward, unavailable readings, and the all-null case. 8/8 passing (one initially-wrong test expectation corrected to match the documented intent, not the code).
- [x] 8.5 Pass cost readings from `page.tsx`: history snapshots (which carry the full record incl. cost) plus each current cluster record appended at its own `asOf`, since history is only written on change and can lag.
- [x] 8.6 Generalise the chart into `DailyBarChart` (shared by both charts) with per-day `null` rendered as `–`, and an explicit empty state when no day in the window has a figure; add the "Daily Spend" chart using it.
- [x] 8.7 Verify (Playwright, both themes): wordmark reads "Capella Housekeeper" and fits on one line; tiles show Total Clusters 2 / Cluster Owners 1 (both demo clusters share one owner); chart titles are "Clusters Created" and "Daily Spend"; the created chart shows the one in-window cluster on Tue; Daily Spend shows its no-billing-access empty state (correct - all 262 stored readings are null here). No console errors; `npm run typecheck` clean, 44/44 tests pass.

## 9. Single row, peak cluster-count chart, logo expands sidebar (design.md Decision 12)

- [x] 9.1 Move the two stat tiles and two charts into one `flex flex-wrap items-stretch` row - tiles size to content, charts take the remaining width and wrap only when there's no room.
- [x] 9.2 Add `src/lib/clusterCounts.ts` with a pure `maxClustersPerDay()` returning the peak concurrent cluster count per day (running *and* turned off - only deletion ends a lifetime), seeding each day from the count alive at its start and sweeping intra-day create/delete events; creations applied before deletions on ties so the peak isn't understated.
- [x] 9.3 Add `clusterCounts.test.ts` - 9 cases covering span-the-window, turned-off clusters still counting, create/delete mid-window, peak-vs-existed-at-some-point, same-day create+delete, out-of-window lifetimes, exact-boundary creation, and degenerate boundary input. All passing.
- [x] 9.4 Reconstruct `ClusterLifetime[]` in `page.tsx` from the latest history snapshot per cluster (the only record of deleted clusters, and it carries `deletedAt`), overlaid with the live records; pass to `DashboardTabs`.
- [x] 9.5 Replace the "Clusters Created" chart with "Cluster Count" driven by that series.
- [x] 9.6 Make the brand mark a button that expands the sidebar when collapsed (inert `div` when expanded).
- [x] 9.7 Verify (Playwright at 1600px): all four cards share one row (identical `top` of 64px); chart titles are "Cluster Count"/"Daily Spend"; cluster-count bars read `[1,2,1,1,2,2,2]`, hand-checked against the real store - Aug 7's peak of 2 captures both short-lived clusters (`happymadhusudan`, `inventivebonnienardi`, each alive ~5 min) and Aug 10-11 captures the since-deleted `loyalalaincolmerauer`, none of which exist in the live table; clicking the logo while collapsed widens the sidebar 64px → 208px. No console errors; `npm run typecheck` clean, 53/53 tests pass.

## 10. Two-way logo toggle, Action column joins "Workflow" when hidden (design.md Decision 13)

- [x] 10.1 Make the brand-mark button collapse the sidebar when already expanded, not just expand it when collapsed - single `setCollapsed((c) => !c)` handler, same as the dedicated chevron toggle; removed the inert-`div` branch for the expanded state.
- [x] 10.2 Remap the "action" column id from `"Cluster"` to `"Workflow"` in `DETAIL_GROUP_BY_COLUMN_ID` (`ClusterTable.tsx`) so hiding the Action column surfaces its buttons under "Workflow" in the row-detail panel, consistent with the neighboring Consent column - reusing the existing generic hidden-column renderer rather than adding a bespoke one.
- [x] 10.3 Verify (Playwright): logo click toggles sidebar width both directions (208 → 64 → 208); with the Action column hidden via the Columns panel, expanding a row's detail shows Ask/Turn off/Delete under "Workflow" alongside Snooze, buttons fully functional (`meta`/`onResult` wiring intact via `flexRender`). No console errors; `npm run typecheck` clean, 53/53 tests pass.
