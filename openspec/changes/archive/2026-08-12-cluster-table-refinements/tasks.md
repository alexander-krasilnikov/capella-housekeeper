## 1. Consolidate History and the Ask result message into the Action column

- [x] 1.1 Remove the "Storage" and "History" dt/dd rows from the row-detail panel's "Cluster" group in `ClusterTable.tsx`.
- [x] 1.2 Move `ConsentBadge` back to a plain Consent cell (no Ask-result message); move the Ask/Turn off/Delete buttons plus a new `ClusterHistoryButton` and the Ask-result message (as a footer, `flex-col` below the button row) into the Action cell.
- [x] 1.3 Update the stale `TableMeta` comment describing where the Ask result renders.
- [x] 1.4 Verify (Playwright): with the Action column hidden (new default), expanding a row's "Workflow" section shows Ask/Turn off/Delete/History together; clicking Ask shows its result message inside that same Workflow/Action block, not next to the Consent badge (confirmed the first row's cell text is a bare status word, no appended message).

## 2. History as a most-recent-first data grid

- [x] 2.1 `historyView.ts`: keep `getClusterHistory`'s diff computation in chronological order, reverse only the returned array; update its doc comment.
- [x] 2.2 `historyView.test.ts`: update the ordering test to assert most-recent-first with the empty-diff entry last.
- [x] 2.3 `ClusterHistoryButton.tsx`: replace the bordered `<ol>` list with a `<table>` (Date / Event / Changes columns); fix the "First recorded state." index check for the new order (`entries.length - 1`, not `0`); widen the modal (`max-w-lg` to `max-w-2xl`) for the grid.
- [x] 2.4 Verify (Playwright): grid headers read Date/Event/Changes; dates render in strictly descending order.

## 3. Remove the storage field entirely

- [x] 3.1 `src/types.ts`: drop `NodeSpec.storage`.
- [x] 3.2 `src/lib/capellaClient.ts`: drop `disk` from `CapellaClusterConfig`'s node shape.
- [x] 3.3 `src/lib/sync.ts`: drop the `disk` → `nodeSpec.storage` mapping in `toClusterConfig`.
- [x] 3.4 `app/page.tsx`: remove `formatStorage` and the `storageSummary` field.
- [x] 3.5 `app/components/ClusterTable.tsx`: remove `storageSummary` from `ClusterRow`.
- [x] 3.6 Verify: repo-wide case-sensitive grep for `storage` (excluding `localStorage`) returns zero hits; `npm run typecheck` clean.

## 4. Circular row-expander button

- [x] 4.1 Add a permanent `border border-line` to the expander button, with hover switching to `border-brand` alongside the existing background/text hover styles.

## 5. Default column visibility and order

- [x] 5.1 Add `DEFAULT_COLUMN_VISIBILITY` (hides org/project/createdAt/age/config/actualCost/action) and `DEFAULT_COLUMN_ORDER` (Cluster, Owner, Last Activity, Status, Age Status, Consent, then the hidden columns) constants; use them as the `columnVisibility`/`columnOrder` `useState` initializers.
- [x] 5.2 Verify (Playwright, fresh browser context / no localStorage): default headers read exactly `Cluster, Owner, Last Activity, Status, Age Status, Consent`, matching the reference screenshot's set and order.

## 6. Final verification

- [x] 6.1 `npm run typecheck` clean; `npm test` 53/53 passing (one test updated in place for the new history order, none added/removed).
- [x] 6.2 Playwright pass across all of the above in one session: default table screenshot matches the reference screenshot; expanded-row screenshot shows no Storage/History fields in "Cluster", shows Ask/Turn off/Delete/History together under "Workflow"; history-modal screenshot shows the new grid. No console errors throughout.
