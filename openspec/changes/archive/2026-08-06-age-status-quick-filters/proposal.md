## Why

The age-status filter today is a plain `<select>` dropdown with no indication of how many clusters fall into each tier - an operator has to select a tier just to find out if it's worth looking at. Quick-filter buttons showing each tier's count (a pattern already common in similar dashboards) let an operator see the New/Established/Stale/Forgotten breakdown at a glance and jump straight to the tier that matters, e.g. "Forgotten (3)".

## What Changes

- Replace the age-status `<select>` dropdown with a row of quick-filter buttons: "All" plus one per age-status tier (New, Established, Stale, Forgotten).
- Each button shows the count of clusters that would match if it were selected - computed against whatever the free-text search already narrows down to, so switching tiers stays meaningful (not a raw, unfiltered total).
- The currently-selected button is visually distinguished from the others (matches the existing single-select semantics of the dropdown it replaces - exactly one tier, or "All", is active at a time).

## Capabilities

### Modified Capabilities
- `cluster-dashboard-ui`: The "Age-status filter" requirement changes from a dropdown to quick-filter buttons, and gains a new counted-per-tier behavior that didn't exist before.

## Impact

- **UI**: `app/components/ClusterTable.tsx` - the `<select>` for age-status filtering is replaced with a button group, using TanStack Table's faceted-value APIs (`getFacetedRowModel`/`getFacetedUniqueValues`) to compute each tier's count against the current search/filter context without hand-rolled counting logic.
- **No changes** to age-status computation, settings, or any other capability - this is purely how the existing filter is presented and how much information it surfaces.
