## Context

`ClusterTable.tsx`'s Action column (Ask/Turn off/Delete) and its Consent column (status badge plus the Ask result message) were introduced by the earlier archived `add-action-column` change; the row-detail panel's "Cluster" group carried a separate "History" field and a "Storage" field; the row-expander was a borderless icon-only button; and column visibility/order had no explicit default (all columns started visible). See proposal.md for the user-facing motivation behind changing all of these.

## Goals / Non-Goals

**Goals:**
- Consolidate every per-cluster control (Ask, Turn off, Delete, History) into the single Action column, and its own result messaging into that same cell.
- Remove the storage field completely rather than just hiding it, since it's genuinely unused.
- Make the table's first-run appearance match a specific, lean reference set rather than "everything visible."

**Non-Goals:**
- Changing the cross-cluster lifecycle audit log's order (`getLifecycleAuditLog`) - it already returns most-recent-first and wasn't touched.
- Adding a UI control to reset column visibility back to the default - the existing "saved config overrides default" behavior (localStorage) is unchanged; a user who wants the default back today would need to clear it manually.

## Decisions

**1. History button moves into the Action column's cell; its own dt/dd row in the "Cluster" detail group is deleted rather than kept as a duplicate.**
The generic hidden-column-to-detail-panel mechanism already maps `action` to the "Workflow" group (from a prior change), so once `ClusterHistoryButton` lives inside the Action cell, hiding that column surfaces History there automatically alongside Ask/Turn off/Delete - no separate accommodation needed for the hidden case.

**2. History modal becomes a data grid (`<table>`), sorted most-recent-first.**
`getClusterHistory` continues computing each entry's diff in chronological (oldest-first) order internally - each entry must be compared against its true predecessor - and only reverses the final array before returning. This means the entry with an always-empty diff (the earliest observation) is now the *last* table row, not the first; both `ClusterHistoryButton.tsx`'s "First recorded state." index check and `historyView.test.ts`'s assertions were updated to match (`i === entries.length - 1` instead of `i === 0`).
- *Alternative considered*: reverse in the component instead of the data layer. Rejected - `getClusterHistory` is the documented, tested contract (`historyView.test.ts`) for this data; reversing at the display layer would leave the function's own doc comment and tests describing the wrong order.

**3. Storage removed end-to-end, not just hidden from the UI.**
"Don't ask it via API" doesn't map to a real request-shape change - Capella's cluster-list endpoint returns the full resource (disk info included) regardless; there's no field-selection parameter to omit it with. So the change is: stop parsing `disk` off the API response (`capellaClient.ts`'s `CapellaClusterConfig`), stop mapping it into `nodeSpec.storage` (`sync.ts`), remove the field from the type (`types.ts`), and remove `formatStorage`/`storageSummary` (`page.tsx`, `ClusterTable.tsx`). Verified via a repo-wide case-sensitive grep for `storage` (excluding `localStorage`) returning zero hits after the change.

**4. Expander button gets a permanent `border border-line`, hover becomes `border-brand` instead of only adding a background.**
The button was already `rounded-full`; without a border it only reads as a circle on hover (background fill), which is what prompted the request. A permanent border makes the circle visible at rest in both themes without needing a filled background (which would compete visually with the row's own hover highlight).

**5. Ask result message relocates from the Consent cell to the Action cell's own footer.**
The `askResults` state/setter were already lifted to the table's `meta` for exactly this kind of cross-cell sharing (see the `TableMeta` comment, updated to reflect the new destination); moving the render target was a matter of reading `askResults` in the Action cell instead of the Consent cell and wrapping the button row plus the conditional message in a `flex-col` container so the message sits below the buttons as a footer, not beside them.

**6. Default column visibility and order are separate constants (`DEFAULT_COLUMN_VISIBILITY`, `DEFAULT_COLUMN_ORDER`), both feeding the corresponding `useState` initializers.**
Visibility alone would have left the default *set* correct but ordered by column-definition order (Cluster, Last Activity, Owner, ...) rather than the requested (Cluster, Owner, Last Activity, ...) - matching the reference screenshot exactly required pinning order too. Both are overridden by a saved `localStorage` config on mount, same as before - this only changes what a user sees before ever customizing anything (or after clearing storage).

## Risks / Trade-offs

- **[Risk]** A user who already has a saved table configuration from before this change won't see the new lean default - their existing (all-columns-visible, original order) preference persists. → **Mitigation**: this is the correct behavior per the existing "saved config overrides default" contract (now made an explicit spec scenario); a user wanting the new default can clear column config via the Columns panel or their browser's localStorage.
- **[Risk]** Hiding the Action column by default means Ask/Turn off/Delete/History aren't reachable without expanding a row - a discoverability cost for new users. → **Mitigation**: this is the explicit, confirmed trade-off from the request (verified with the user directly) in exchange for a lower-noise default table; the Columns panel and the row-expander are both one click away.

## Migration Plan

Single-commit UI + data-model change, no persisted-data migration needed - `NodeSpec.storage` was only ever a display concern, never referenced in stored `ClusterRecord`s in a way that other code depends on (confirmed via repo-wide grep). Existing `data/clusters.json`/`history.json` records that still have old `nodeSpec.storage` values on disk are simply never read again; they aren't cleaned up, but are harmless left-over fields. Rollback is a plain revert of the touched files listed in proposal.md's Impact section.
