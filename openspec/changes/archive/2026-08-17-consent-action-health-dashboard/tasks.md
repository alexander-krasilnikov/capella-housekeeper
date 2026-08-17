## 1. Cycle reconstruction

- [x] 1.1 Add `src/lib/consentActionHealth.ts` with a function that walks a cluster's chronological audit-log entries and emits reconstructed consent cycles (start timestamp, resolution kind - approved/snoozed/expired/pending, resolution timestamp when present).
- [x] 1.2 Within the same walk, link each `actionOutcome: performed` entry back to the approval entry of its cycle (if any) to capture the deciding trigger (`slack-decision`, `auto-turnoff-decision`, or none for a direct manual bypass).
- [x] 1.3 Add a window-filtering function that selects cycles whose *start* timestamp falls within the trailing 168 hours from a given "now".
- [x] 1.4 (Post-review fix) Cycle-start detection originally required a persisted `consentStatus` diff literally `{from: "none", to: "pending"}`, which the real state machine (`notifications.ts`) almost never produces (age-tier transitions collapse the reset-to-none and set-to-pending into one synchronous mutation; snooze-resume skips `none` entirely). Broadened to recognize any transition *into* `pending` from a status other than `pending` itself.
- [x] 1.5 (Post-review fix) An open cycle whose `consentStatus` reset to `none` (cancelled by an age-tier change or manual override, not resolved) previously left the open-cycle marker set, letting it resurface later as a bogus "still pending" cycle with a stale start time. Fixed: a reset to `none` now discards the cycle and clears the marker.
- [x] 1.6 (Post-review fix) Extracted `APPROVAL_TRIGGERS`/`MANUAL_ACTION_TRIGGERS` as shared exports from `src/lib/historyFields.ts`, and had `consentActionHealth.ts` read them instead of re-deriving "which triggers approve/bypass a cycle" independently (a duplication-drift risk flagged in review).
- [x] 1.7 (Post-review fix) `reconstructConsentAndActionHistory` scanned the full unbounded audit log before windowing to 7 days. `summarizeConsentAndActionHealth` now pre-filters to a `LINEAGE_LOOKBACK_HOURS` (30-day) bound before reconstruction, keeping cost proportional to a fixed ceiling instead of total history.

## 2. Funnel aggregation

- [x] 2.1 Add a function that counts windowed cycles by resolution kind (approved, snoozed, expired, pending).
- [x] 2.2 Handle the zero-cycles case by returning explicit zero counts for every kind, not an empty/omitted result.
- [x] 2.3 (Built, then reverted per follow-up feedback) Median time-to-resolution per resolution kind - added in the first pass, removed because the user asked to delete "consumed time per consent type"; `summarizeFunnel` returns a plain count per outcome, not `{ count, medianResolutionMs }`.

## 3. Actions-taken aggregation

- [x] 3.1 Add a function that scans the audit log for stop/delete-resulting entries within the trailing 168 hours and classifies each into Manual (`manual-turn-off`/`manual-delete` trigger), Auto-decided (`actionOutcome: performed` with trigger `auto-turnoff-decision`), or Slack-approved (`actionOutcome: performed` with trigger `reconciliation` whose cycle's approval entry was `slack-decision`).
- [x] 3.2 Handle the zero-actions case by returning explicit zero counts for every category.

## 4. Dashboard UI

- [x] 4.1 Remove the "Total Clusters" and "Cluster Owners" stat tiles from `app/components/DashboardTabs.tsx` (and the now-unused `StatTile`/`OwnersIcon`/`distinctOwners` code), and render the funnel and actions-taken panels in the same row as the Cluster Count/Daily Spend charts (not a separate section).
- [x] 4.2 Render the funnel panel as a horizontal bar chart: one bar per outcome (approved/snoozed/expired/still pending), scaled to the panel's own max, each paired with its raw count. No per-outcome duration/median is shown.
- [x] 4.3 Render the actions-taken panel as a horizontal bar chart with exactly three rows, labeled "Auto", "Slack", "Manual".
- [x] 4.4 Wire both panels to the aggregation functions from sections 1-3, computed at render time from the existing audit-log source used by the history tab.
- [x] 4.5 (Post-review fix) Extracted a shared `BarPanel({title, rows})` component from the near-duplicate `ConsentFunnelPanel`/`ActionsTakenPanel` components.

## 5. Tests

- [x] 5.1 Unit tests for cycle reconstruction: a cycle that starts and fully resolves within the window, one that starts before the window, one that starts within the window but is still pending.
- [x] 5.2 Unit tests for the funnel aggregation: mixed outcomes, zero-cycles case. (Median even/odd-count tests were added, then removed along with the feature.)
- [x] 5.3 Unit tests for actions attribution: manual bypass, auto-decided (same-entry decide+act), Slack-approved-then-reconciled, zero-actions case.
- [x] 5.4 Component/UI test confirming the stat-tile row still renders alongside the new panels, and that Total Clusters/Cluster Owners are both absent. Added the repo's first React-rendering test infra: `jsdom` + `@testing-library/react` as dev dependencies, a per-file `// @vitest-environment jsdom` override (global config stays `"node"`), a `@` -> `./src` alias in `vitest.config.mts` (mirrors tsconfig, needed once a test imports an `app/` file), and an in-file `localStorage` stub (Node 22+'s built-in `localStorage` global shadows jsdom's own and is unusable without `--localstorage-file`).
- [x] 5.5 (Post-review) Unit tests for the corrected cycle-detection logic: snooze-resume recognized as a start, an age-tier-transition's collapsed reset recognized as a start, a cancelled (reset-to-none) cycle discarded rather than counted, a cancelled cycle's stale start not resurrected as a later "still pending" cycle, a Slack approval that resumed from a snooze correctly attributed (not "auto-decided"), and lineage tracing across the 7-day window boundary within the 30-day lookback bound.

## 6. Code-review follow-up (out of this feature's original scope, fixed alongside it)

- [x] 6.1 Extracted `app/components/TablePagination.tsx` (`PAGE_SIZE_OPTIONS`, `createGlobalFuzzyFilter`, `PaginationFooter`) shared by `ClusterTable.tsx`, `HistoryTable.tsx`, and `ClusterHistoryButton.tsx` - all three previously hand-rolled the same pager footer, page-size constant, and fuzzy-filter algorithm.
- [x] 6.2 Extracted `src/lib/groupBy.ts`, used by both `consentActionHealth.ts` and `costSeries.ts` in place of their separately hand-rolled per-cluster grouping loops.
- [x] 6.3 Fixed `ClusterHistoryButton.tsx`: the pager footer rendered even when a search matched zero rows (unlike `HistoryTable.tsx`'s correctly-nested pattern) - table and footer are now a single fragment inside the zero-rows conditional. Also memoized the `rows` array (`useMemo`) so it no longer busts `useReactTable`'s internal memoization on every render, and restored the comment explaining the pagination-reset effect (present in `ClusterTable.tsx`, dropped when this file copied it).
- [x] 6.4 Widened `proxy.ts`'s auth-matcher exclusion from just `icon` to all of Next's generated/static metadata routes (`apple-icon`, `opengraph-image`, `twitter-image`, `sitemap.xml`, `robots.txt`, `manifest.*`) per Next's own documented guidance to exclude "the metadata files" as a group, not one at a time - none of these exist in this repo yet, but adding one later without this exclusion would reproduce the same auth-redirect bug just fixed for `icon`.
