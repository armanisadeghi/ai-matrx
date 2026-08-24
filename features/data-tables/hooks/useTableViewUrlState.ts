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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  commitUrlParams,
  historyModeForParamChange,
  useUrlSearchParams,
} from "@/lib/url-state/useUrlState";

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

  const params = useUrlSearchParams();

  // Seeded from the URL so the FIRST render already shows the requested view.
  // Reading it in an effect instead would render the default view for a frame
  // and fetch the wrong page before correcting itself.
  const [state, setState] = useState<TableViewState>(() =>
    parseTableViewParams(
      typeof window === "undefined"
        ? new URLSearchParams()
        : new URLSearchParams(window.location.search),
      defaults,
    ),
  );

  // ── state → URL ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (typeof window === "undefined") return;

    const current = new URLSearchParams(window.location.search);
    const patch = tableViewParamPatch(state, defaults);

    const next = new URLSearchParams(current);
    for (const [key, value] of Object.entries(patch)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    if (next.toString() === current.toString()) return;

    commitUrlParams(
      patch,
      historyModeForParamChange(current, next, TABLE_VIEW_TEXT_KEYS),
    );
  }, [state, defaults]);

  // ── URL → state (Back/Forward, pasted link) ──────────────────────────────
  //
  // THE LOOP IS BROKEN BY VALUE, NOT BY BOOKKEEPING. `sameTableView` returns
  // the previous object unchanged when the URL already describes the current
  // view, so our own write lands here, compares equal, and stops — no state
  // change, no re-render, no second write.
  //
  // An earlier version instead remembered the last URL string it wrote and
  // skipped anything matching it. That looked equivalent and was not: pressing
  // Forward to a view the user had ALREADY visited produced a URL we had indeed
  // written before, so the guard swallowed it — the address bar moved and the
  // grid did not. Identity of a past write says nothing about whether the
  // current URL still matches the current state.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const fromUrl = parseTableViewParams(params, defaults);
    setState((prev) => (sameTableView(prev, fromUrl) ? prev : fromUrl));
  }, [params, defaults]);

  // ── switching tables clears the view ─────────────────────────────────────
  const previousResetKey = useRef(options.resetKey);
  useEffect(() => {
    if (previousResetKey.current === options.resetKey) return;
    previousResetKey.current = options.resetKey;
    const cleared = parseTableViewParams(new URLSearchParams(), defaults);
    setState(cleared);
    commitUrlParams(tableViewParamPatch(cleared, defaults), "replace");
  }, [options.resetKey, defaults]);

  const patchState = useCallback(
    (patch: Partial<TableViewState>) =>
      setState((prev) => ({ ...prev, ...patch })),
    [],
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
      setState(parseTableViewParams(new URLSearchParams(), defaults));
    }, [defaults]),
    isViewCustomized:
      state.search.trim() !== "" ||
      state.sortField !== null ||
      state.page > 1 ||
      state.pageSize !== defaults.pageSize ||
      Object.keys(state.filters).length > 0,
  };
}
