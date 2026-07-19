import type {
  MatrxDataTableQueryState,
} from "./types";

export interface QueryStateChangeOptions {
  /** Reset to the first page after a query-shape change. */
  resetPage?: boolean;
}

/**
 * Build the next controlled query state without mutating the caller's object.
 * Search, filters, sort, facets, and page-size changes pass `resetPage: true`;
 * direct pagination passes a page patch without resetting it.
 */
export function nextQueryState(
  current: MatrxDataTableQueryState,
  patch: Partial<MatrxDataTableQueryState>,
  options: QueryStateChangeOptions = {},
): MatrxDataTableQueryState {
  return {
    ...current,
    ...patch,
    page: options.resetPage ? 1 : (patch.page ?? current.page),
  };
}

/** Resolve a safe one-based page for the latest remote total. */
export function safeQueryPage(
  requestedPage: number,
  totalItems: number,
  pageSize: number,
): number {
  const safeTotal = Math.max(0, totalItems);
  const safeSize = Math.max(1, pageSize);
  const pageCount = Math.max(1, Math.ceil(safeTotal / safeSize));
  return Math.min(Math.max(1, requestedPage), pageCount);
}
