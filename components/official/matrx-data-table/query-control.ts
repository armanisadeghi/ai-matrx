import {
  collectSelectOptions,
  resolveFilterKind,
  type ResolvedFilterKind,
} from "./infer-filter";
import type { MatrxColumnDef, MatrxDataTableQueryState } from "./types";

export interface QueryFilterMeta {
  kind: ResolvedFilterKind | null;
  options: Array<{ value: string; label: string }>;
}

/**
 * Resolve header-filter metadata without inferring remote cardinality from the
 * current page. Controlled callers must declare select options explicitly;
 * local tables preserve the original inference behavior.
 */
export function resolveQueryFilterMeta<T>(
  column: MatrxColumnDef<T>,
  rows: T[],
  controlled: boolean,
): QueryFilterMeta {
  if (!controlled) {
    const kind = resolveFilterKind(column, rows);
    return {
      kind,
      options: kind === "select" ? collectSelectOptions(column, rows) : [],
    };
  }
  if (column.filter === false) return { kind: null, options: [] };
  const declared = column.filter;
  const kind: ResolvedFilterKind =
    declared && declared !== "auto"
      ? declared
      : column.filterOptions?.length
        ? "select"
        : "text";
  return {
    kind,
    options: kind === "select" ? (column.filterOptions ?? []) : [],
  };
}

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
