## 1. Compute per-tier counts

- [x] 1.1 Add `getFacetedRowModel`/`getFacetedUniqueValues` to the table config so counts can be read via `table.getColumn("ageStatus")?.getFacetedUniqueValues()` - these exclude the `ageStatus` column's own filter while respecting the free-text search, giving exactly "how many would match if this tier were selected."

## 2. Replace the dropdown with quick-filter buttons

- [x] 2.1 Replace the `<select>` age-status filter with a button group: "All" plus one button per tier (New, Established, Stale, Forgotten), each showing its count from 1.1 (summing all tier counts for "All").
- [x] 2.2 Style the currently-active button (selected tier, or "All" when no filter is set) distinctly from the rest.
- [x] 2.3 Wire each button's click to `table.getColumn("ageStatus")?.setFilterValue(...)`, `undefined` for "All", matching the existing single-select filter semantics.

## 3. Verification

- [x] 3.1 Verify selecting a tier button filters the table and highlights that button; verify "All" clears the filter.
- [x] 3.2 Verify entering a search term changes the counts shown on each button to reflect only the searched-down subset.
- [x] 3.3 Verify exactly one button is visually active at a time.
