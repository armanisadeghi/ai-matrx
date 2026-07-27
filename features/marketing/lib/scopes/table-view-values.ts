"use client";

/**
 * Shared surface-value builders for Marketing's table-driven workspaces.
 *
 * Every Marketing register (analysis queue, findings, link edges) is a
 * `MatrxDataTable` in controlled mode over URL-owned state
 * (`useMarketingTableState`). Their surfaces must declare — and therefore
 * emit — the same four view facts: what is filtered, how it is sorted, which
 * slice is on screen, and the composite of all three. These pure helpers build
 * exactly those values from a `MatrxDataTableQueryState`, so no workspace
 * hand-rolls a fourth copy.
 *
 * All builders return `undefined` for the empty case, matching the
 * `alwaysAvailable: false` contract every consuming manifest declares.
 */

import type { MatrxDataTableQueryState } from "@/components/official/matrx-data-table/types";

/** Search + per-column filters, or undefined on the unfiltered default view. */
export function tableFilterValues(
  state: MatrxDataTableQueryState,
): Record<string, unknown> | undefined {
  const filters: Record<string, unknown> = {};
  if (state.search) filters.search = state.search;
  if (state.anyOf) filters.any_of = state.anyOf;
  for (const [column, filter] of Object.entries(state.columnFilters)) {
    if (!filter) continue;
    filters[column] =
      filter.kind === "number"
        ? { min: filter.min ?? null, max: filter.max ?? null }
        : filter.value;
  }
  return Object.keys(filters).length > 0 ? filters : undefined;
}

/** `"<column> <asc|desc>"`, or undefined when the table has no sort. */
export function tableSortLabel(
  state: MatrxDataTableQueryState,
): string | undefined {
  return state.sort ? `${state.sort.id} ${state.sort.direction}` : undefined;
}

/** `{ page, page_size }` — which slice of the result set is on screen. */
export function tablePagination(
  state: MatrxDataTableQueryState,
): Record<string, unknown> {
  return { page: state.page, page_size: state.pageSize };
}

/** Composite of every view fact: search, filters, sort, and pagination. */
export function tableViewState(
  state: MatrxDataTableQueryState,
): Record<string, unknown> {
  return {
    search: state.search || null,
    any_of: state.anyOf || null,
    filters: tableFilterValues(state) ?? {},
    sort: tableSortLabel(state) ?? null,
    page: state.page,
    page_size: state.pageSize,
  };
}

/**
 * Count rows by a derived key (severity, category, …). Returns undefined when
 * there is nothing loaded, so the value stays absent rather than lying `{}`.
 */
export function countRowsBy<T>(
  rows: readonly T[],
  key: (row: T) => string | null | undefined,
): Record<string, number> | undefined {
  if (rows.length === 0) return undefined;
  const counts: Record<string, number> = {};
  for (const row of rows) {
    const bucket = key(row) || "unknown";
    counts[bucket] = (counts[bucket] ?? 0) + 1;
  }
  return counts;
}
