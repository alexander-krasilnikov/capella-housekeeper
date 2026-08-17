import type { Table } from "@tanstack/react-table";

/** Shared across every paginated table in the app - the rows-per-page choices offered in each footer's select. */
export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

/**
 * Builds a TanStack `globalFilterFn`: case-insensitive substring match
 * against a haystack of display fields, joined with spaces. `getHaystack`
 * picks which fields go into that haystack for a given row shape - the
 * matching algorithm itself (join, lowercase, includes) is shared so a
 * future behavior change (whitespace trimming, multi-term queries) is made
 * once here rather than in every table that uses it.
 */
export function createGlobalFuzzyFilter<T>(getHaystack: (row: T) => (string | number)[]) {
  return (row: { original: T }, _columnId: string, filterValue: unknown): boolean => {
    const term = String(filterValue).toLowerCase();
    if (!term) return true;
    const haystack = getHaystack(row.original).join(" ").toLowerCase();
    return haystack.includes(term);
  };
}

/**
 * "Showing X-Y of Z" + rows-per-page select + Prev/Next - the footer shared
 * by every paginated table in the app. Callers are responsible for not
 * rendering this when there are zero (possibly filtered) rows to page
 * through (it does not hide itself) and for supplying a text-size class
 * (e.g. `text-sm`) via `className` - none is set here, so a caller's own
 * size and a default can never both land on the element at once.
 */
export function PaginationFooter<T>({
  table,
  totalRowCount,
  className = "",
}: {
  table: Table<T>;
  totalRowCount: number;
  /** Extra classes merged onto the footer's own layout classes - text size, padding, `shrink-0`, etc. */
  className?: string;
}) {
  const { pageIndex, pageSize } = table.getState().pagination;
  const pageCount = table.getPageCount();

  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 border-t border-line text-ink-muted ${className}`}>
      <div>
        Showing {pageIndex * pageSize + 1}–{Math.min((pageIndex + 1) * pageSize, totalRowCount)} of {totalRowCount}
      </div>
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-1.5">
          Rows per page
          <select
            value={pageSize}
            onChange={(e) => table.setPageSize(Number(e.target.value))}
            className="rounded-md border border-line bg-panel px-1.5 py-1"
          >
            {PAGE_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => table.previousPage()}
          disabled={!table.getCanPreviousPage()}
          className="rounded-md border border-line px-2 py-1 disabled:opacity-40"
        >
          ← Prev
        </button>
        <span>
          Page {pageIndex + 1} of {Math.max(pageCount, 1)}
        </span>
        <button
          type="button"
          onClick={() => table.nextPage()}
          disabled={!table.getCanNextPage()}
          className="rounded-md border border-line px-2 py-1 disabled:opacity-40"
        >
          Next →
        </button>
      </div>
    </div>
  );
}
