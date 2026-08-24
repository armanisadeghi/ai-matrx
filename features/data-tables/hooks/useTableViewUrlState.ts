/**
 * The grid's view state, owned by the URL.
 *
 * Drop-in replacement for the six `useState`s the viewer used to keep for
 * search, sort field, sort direction, column filters, page and page size. The
 * setters keep their names so call sites are unchanged; what changes is that
 * the values now survive a refresh, travel in a copied link, and move with
 * Back/Forward.
 *
 * COMPOSED, NOT INVENTED. The mechanics — reactive params, history-mode
 * classification, the commit that dispatches so every subscriber re-reads —
 * all come from `lib/url-state/useUrlState`, the app's canonical primitive.
 * The encoding lives in `../table-view-url` and is unit-tested. This file is
 * only the wiring between them.
 *
 * TWO DIRECTIONS, AND THEY MUST NOT FIGHT:
 *   state → URL   mirrored on change, so the address bar always shows the view;
 *   URL → state   applied when the URL moves underneath us (Back/Forward, or a
 *                 link pasted into the same route).
 * They are kept from fighting BY VALUE: the URL→state direction compares the
 * decoded view to the current one and returns the same object when they match,
 * so our own write lands, compares equal, and stops. (Remembering "the last URL
 * I wrote" instead looks equivalent and is not — see the note on that effect.)
 *
 * PUSH vs REPLACE follows `historyModeForParamChange`: discrete decisions
 * (sort, filter, page, page size) push, so Back undoes exactly one of them;
 * only the search box replaces, because one history entry per keystroke would
 * make Back useless.
 */
"use client";

import { useCallback, useMemo } from "react";

import { useMirroredUrlState } from "@/lib/url-state/useUrlState";

import type { ColumnFilterMap } from "../column-filters";
import {
  parseTableViewParams,
  sameTableView,
  tableViewParamPatch,
  TABLE_VIEW_TEXT_KEYS,
  type SortDirection,
  type TableViewState,
} from "../table-view-url";

export type TableViewUrlState = {
  searchTerm: string;
  setSearchTerm: (value: string) => void;
  sortField: string | null;
  setSortField: (value: string | null) => void;
  sortDirection: SortDirection;
  setSortDirection: (value: SortDirection) => void;
  columnFilters: ColumnFilterMap;
  setColumnFilters: (value: ColumnFilterMap) => void;
  currentPage: number;
  setCurrentPage: (value: number) => void;
  limit: number;
  setLimit: (value: number) => void;
  /** Clear every view control at once (and the URL with it). */
  resetView: () => void;
  /** True when anything is narrowing or reordering — drives a "Reset view" affordance. */
  isViewCustomized: boolean;
};

export function useTableViewUrlState(options: {
  /** Page size when the URL carries none. */
  defaultPageSize?: number;
  /**
   * Switching tables must not carry the previous table's view across — a
   * filter naming a column this table does not have would silently hide every
   * row. The URL is cleared when this changes.
   */
  resetKey?: string;
}): TableViewUrlState {
  const defaults = useMemo(
    () => ({ pageSize: options.defaultPageSize ?? 20 }),
    [options.defaultPageSize],
  );

  // The whole two-way mirror is `useMirroredUrlState` — the canonical
  // primitive. This hook only supplies the codec and names the fields.
  const [state, patchWhole] = useMirroredUrlState<TableViewState>({
    parse: useCallback(
      (p: URLSearchParams) => parseTableViewParams(p, defaults),
      [defaults],
    ),
    toParams: useCallback(
      (v: TableViewState) => tableViewParamPatch(v, defaults),
      [defaults],
    ),
    isSame: sameTableView,
    textKeys: TABLE_VIEW_TEXT_KEYS,
    resetKey: options.resetKey,
  });

  const patchState = useCallback(
    (patch: Partial<TableViewState>) =>
      patchWhole((prev) => ({ ...prev, ...patch })),
    [patchWhole],
  );

  return {
    searchTerm: state.search,
    setSearchTerm: useCallback(
      (search: string) => patchState({ search }),
      [patchState],
    ),
    sortField: state.sortField,
    setSortField: useCallback(
      (sortField: string | null) => patchState({ sortField }),
      [patchState],
    ),
    sortDirection: state.sortDirection,
    setSortDirection: useCallback(
      (sortDirection: SortDirection) => patchState({ sortDirection }),
      [patchState],
    ),
    columnFilters: state.filters,
    setColumnFilters: useCallback(
      (filters: ColumnFilterMap) => patchState({ filters }),
      [patchState],
    ),
    currentPage: state.page,
    setCurrentPage: useCallback(
      (page: number) => patchState({ page }),
      [patchState],
    ),
    limit: state.pageSize,
    setLimit: useCallback(
      (pageSize: number) => patchState({ pageSize }),
      [patchState],
    ),
    resetView: useCallback(() => {
      patchWhole(parseTableViewParams(new URLSearchParams(), defaults));
    }, [defaults, patchWhole]),
    isViewCustomized:
      state.search.trim() !== "" ||
      state.sortField !== null ||
      state.page > 1 ||
      state.pageSize !== defaults.pageSize ||
      Object.keys(state.filters).length > 0,
  };
}
