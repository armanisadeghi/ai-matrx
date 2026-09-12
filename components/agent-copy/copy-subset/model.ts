/**
 * copy-subset model — pure. Given a session (the row snapshot) and the
 * overlay's own state, produce the rows + columns that will be copied and the
 * text for the chosen format. The canonical `filterAndSortRows` engine does
 * the shaping so the overlay's table and its copy never disagree.
 */

import {
  countActiveColumnFilters,
  filterAndSortRows,
} from "@ai-matrx/design-system/data-table/filter-engine";
import { completeLayeredFilterRules } from "@ai-matrx/design-system/data-table/layered-filters";
import type { MatrxDataTableQueryState } from "@ai-matrx/design-system/data-table/types";
import type { CopySubsetSession } from "@/components/agent-copy/copy-subset/session";
import { serializeCopySubset } from "@/components/agent-copy/copy-subset/serialize";
import {
  toMatrxColumn,
  type CopySubsetColumn,
  type CopySubsetFormat,
  type CopySubsetMeta,
  type CopySubsetState,
} from "@/components/agent-copy/copy-subset/types";

export const COPY_SUBSET_DEFAULT_QUERY: MatrxDataTableQueryState = {
  page: 1,
  pageSize: 50,
  search: "",
  searchMatchMode: "contains",
  anyOf: "",
  layeredFilters: [],
  columnFilters: {},
  sort: null,
};

export function initialCopySubsetState<T>(
  session: Pick<CopySubsetSession<T>, "columns" | "source">,
): CopySubsetState {
  return {
    query: COPY_SUBSET_DEFAULT_QUERY,
    hiddenColumnIds: session.columns
      .filter((column) => column.hidden)
      .map((column) => column.id),
    selectedRowIds: session.source.initialSelectedIds ?? [],
    format: session.source.defaultFormat ?? "ai",
  };
}

export function visibleCopySubsetColumns<T>(
  columns: CopySubsetColumn<T>[],
  hiddenColumnIds: string[],
): CopySubsetColumn<T>[] {
  const hidden = new Set(hiddenColumnIds);
  return columns.filter((column) => !hidden.has(column.id));
}

/** Rows after search + filters + sort, over the visible columns only. */
export function matchedCopySubsetRows<T>(
  session: Pick<CopySubsetSession<T>, "rows">,
  columns: CopySubsetColumn<T>[],
  query: MatrxDataTableQueryState,
): T[] {
  return filterAndSortRows(
    session.rows,
    columns.map(toMatrxColumn),
    query.columnFilters,
    query.sort,
    query.search,
    undefined,
    query.layeredFilters,
    query.searchMatchMode ?? "contains",
  );
}

export interface CopySubsetComputation<T> {
  columns: CopySubsetColumn<T>[];
  matched: T[];
  /** The rows that will be copied: the selection when one exists, else every match. */
  rows: T[];
  meta: CopySubsetMeta;
}

export function computeCopySubset<T>(
  session: CopySubsetSession<T>,
  state: CopySubsetState,
): CopySubsetComputation<T> {
  const columns = visibleCopySubsetColumns(
    session.columns,
    state.hiddenColumnIds,
  );
  const matched = matchedCopySubsetRows(session, columns, state.query);
  const selected = new Set(state.selectedRowIds);
  const rows =
    selected.size > 0
      ? matched.filter((row) => selected.has(session.getRowId(row)))
      : matched;
  const meta: CopySubsetMeta = {
    format: state.format,
    total_rows: session.rows.length,
    matched_rows: matched.length,
    copied_rows: rows.length,
    total_columns: session.columns.length,
    copied_columns: columns.length,
    search: state.query.search.trim() || undefined,
    active_filters:
      countActiveColumnFilters(state.query.columnFilters) +
      completeLayeredFilterRules(state.query.layeredFilters).length,
    sort: state.query.sort
      ? `${state.query.sort.id}:${state.query.sort.direction}`
      : undefined,
    selection: selected.size > 0,
  };
  return { columns, matched, rows, meta };
}

/** The exact text the Copy button writes for the current state. */
export function copySubsetText<T>(
  session: CopySubsetSession<T>,
  state: CopySubsetState,
  format: CopySubsetFormat = state.format,
): { text: string; computation: CopySubsetComputation<T> } {
  const computation = computeCopySubset(session, { ...state, format });
  const text = serializeCopySubset(
    session.source,
    computation.rows,
    computation.columns,
    format,
    computation.meta,
  );
  return { text, computation };
}
