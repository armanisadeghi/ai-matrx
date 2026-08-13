"use client";

/**
 * useTableUrlState — the ONE owner of controlled MatrxDataTable query state
 * that mirrors to the URL.
 *
 * `MatrxDataTableQueryState`'s own doc-comment says controlled callers "may
 * mirror it to URL search params and use it as part of a direct
 * database-query cache key" — this hook is that sentence made a primitive, so
 * no surface hand-rolls its own searchParams plumbing (or worse, loses
 * back/forward + shareable-link behavior by keeping the state in a bare
 * useState).
 *
 * Contract:
 * - `state` — the live query state; pass to `query={{ mode: "controlled", state, … }}`.
 * - `queryState` — same shape with SEARCH debounced (300ms); use as the input
 *   to the data-fetching hook so keystrokes don't fan out into per-character
 *   server queries. Page/sort/filter changes pass through immediately.
 * - `onStateChange` — hand to the table verbatim.
 *
 * URL params (all omitted at their defaults, so a pristine table has a clean
 * URL): `p` page, `ps` pageSize, `q` search, `match` search match mode,
 * `any` any-of search, `sort` "<id>.<asc|desc>", `f` JSON-encoded column
 * filters, and `lf` JSON-encoded layered filters. User changes push native
 * history entries without a server round-trip, so Back/Forward restores the
 * exact table view instead of only restoring the route.
 *
 * This is deliberately VIEW-QUERY state (search, filters, page) — ephemeral,
 * shareable via link, never persisted. View STYLE (density, columns, view)
 * belongs to `useListViewPrefs` (lib/list-views), a different axis.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  ColumnFiltersState,
  MatrxDataTableQueryState,
  SortState,
} from "@/components/official/matrx-data-table/types";
import type { LayeredFilterRule } from "@/components/official/matrx-data-table/layered-filters";
import {
  commitUrlParams,
  type UrlHistoryMode,
  useUrlSearchParams,
} from "@/lib/url-state/useUrlState";

export interface UseTableUrlStateOptions {
  /** Stable table id used in `table.<id>.*` parameters. */
  tableId: string;
  /** Initial sort when the URL carries none. Default: none. */
  defaultSort?: SortState | null;
  /** Default page size (also the "omit from URL" value). Default 25. */
  defaultPageSize?: number;
  /** Debounce for `queryState.search`, ms. Default 300. */
  searchDebounceMs?: number;
  /** Browser history behavior for table transitions. Default: `push`. */
  history?: UrlHistoryMode;
  /** Rapid text edits push once, then replace by default. */
  textHistory?: "session" | UrlHistoryMode;
}

export interface TableUrlState {
  /** Live state — pass to the table's controlled `query.state`. */
  state: MatrxDataTableQueryState;
  /** Search-debounced state — feed the data-fetching layer. */
  queryState: MatrxDataTableQueryState;
  /** Pass to the table's controlled `query.onStateChange`. */
  onStateChange: (next: MatrxDataTableQueryState) => void;
  /** Reset to defaults (clears the mirrored URL params too). */
  reset: () => void;
}

function parseSort(raw: string | null): SortState | null {
  if (!raw) return null;
  const at = raw.lastIndexOf(".");
  if (at <= 0) return null;
  const direction = raw.slice(at + 1);
  if (direction !== "asc" && direction !== "desc") return null;
  return { id: raw.slice(0, at), direction };
}

function parseObject<T extends object>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as T;
    }
  } catch {
    // A hand-mangled URL is not an error state — fall through to empty.
  }
  return fallback;
}

function parseLayeredFilters(raw: string | null): LayeredFilterRule[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as LayeredFilterRule[]) : [];
  } catch {
    return [];
  }
}

function positiveInt(raw: string | null, fallback: number): number {
  const n = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function tableUrlParamPrefix(tableId: string): string {
  if (!/^[a-z][a-z0-9-]{0,63}$/.test(tableId)) {
    throw new Error(
      `MatrxDataTable urlState.id must match /^[a-z][a-z0-9-]{0,63}$/; received "${tableId}".`,
    );
  }
  return `table.${tableId}`;
}

export function useTableUrlState(
  options: UseTableUrlStateOptions,
): TableUrlState {
  const {
    tableId,
    defaultSort = null,
    defaultPageSize = 25,
    searchDebounceMs = 300,
    history = "push",
    textHistory = "session",
  } = options;
  const prefix = tableUrlParamPrefix(tableId);
  const key = useCallback((name: string) => `${prefix}.${name}`, [prefix]);
  const defaultSortId = defaultSort?.id;
  const defaultSortDirection = defaultSort?.direction;

  const searchParams = useUrlSearchParams();
  const readState = useCallback(
    (params: Pick<URLSearchParams, "get">): MatrxDataTableQueryState => {
      const initialSort =
        defaultSortId && defaultSortDirection
          ? { id: defaultSortId, direction: defaultSortDirection }
          : null;
      return {
        page: positiveInt(params.get(key("p")), 1),
        pageSize: positiveInt(params.get(key("ps")), defaultPageSize),
        search: params.get(key("q")) ?? "",
        searchMatchMode:
          params.get(key("match")) === "whole_words"
            ? "whole_words"
            : "contains",
        anyOf: params.get(key("any")) ?? "",
        layeredFilters: parseLayeredFilters(params.get(key("lf"))),
        columnFilters: parseObject<ColumnFiltersState>(
          params.get(key("f")),
          {},
        ),
        sort: parseSort(params.get(key("sort"))) ?? initialSort,
      };
    },
    [defaultPageSize, defaultSortDirection, defaultSortId, key],
  );

  const state = readState(searchParams);
  const lastTextWriteAt = useRef(0);

  const [debouncedSearch, setDebouncedSearch] = useState(state.search);
  useEffect(() => {
    if (state.search === debouncedSearch) return;
    const timer = window.setTimeout(
      () => setDebouncedSearch(state.search),
      searchDebounceMs,
    );
    return () => window.clearTimeout(timer);
  }, [state.search, debouncedSearch, searchDebounceMs]);

  const writeState = useCallback(
    (nextState: MatrxDataTableQueryState, mode: UrlHistoryMode = history) => {
      const params = new URLSearchParams(window.location.search);
      const setOrDelete = (name: string, value: string | null) => {
        if (value === null || value === "") params.delete(name);
        else params.set(name, value);
      };
      setOrDelete(key("p"), nextState.page > 1 ? String(nextState.page) : null);
      setOrDelete(
        key("ps"),
        nextState.pageSize !== defaultPageSize
          ? String(nextState.pageSize)
          : null,
      );
      setOrDelete(key("q"), nextState.search || null);
      setOrDelete(
        key("match"),
        nextState.searchMatchMode === "whole_words" ? "whole_words" : null,
      );
      setOrDelete(key("any"), nextState.anyOf || null);
      const sortToken = nextState.sort
        ? `${nextState.sort.id}.${nextState.sort.direction}`
        : null;
      const defaultToken =
        defaultSortId && defaultSortDirection
          ? `${defaultSortId}.${defaultSortDirection}`
          : null;
      setOrDelete(key("sort"), sortToken !== defaultToken ? sortToken : null);
      const activeFilters = Object.fromEntries(
        Object.entries(nextState.columnFilters).filter(
          ([, v]) => v !== undefined,
        ),
      );
      setOrDelete(
        key("lf"),
        nextState.layeredFilters && nextState.layeredFilters.length > 0
          ? JSON.stringify(nextState.layeredFilters)
          : null,
      );
      setOrDelete(
        key("f"),
        Object.keys(activeFilters).length > 0
          ? JSON.stringify(activeFilters)
          : null,
      );
      const nextParams = new URLSearchParams(params);
      const currentParams = new URLSearchParams(window.location.search);
      const patch: Record<string, string | null> = {};
      for (const name of ["p", "ps", "q", "match", "any", "sort", "lf", "f"]) {
        const parameter = key(name);
        const nextValue = nextParams.get(parameter);
        if (currentParams.get(parameter) !== nextValue)
          patch[parameter] = nextValue;
      }
      commitUrlParams(patch, mode);
    },
    [defaultPageSize, defaultSortDirection, defaultSortId, history, key],
  );

  const onStateChange = useCallback(
    (next: MatrxDataTableQueryState) => {
      const changed = Object.keys(next).filter(
        (name) =>
          JSON.stringify(next[name as keyof MatrxDataTableQueryState]) !==
          JSON.stringify(state[name as keyof MatrxDataTableQueryState]),
      );
      const textOnly =
        changed.length > 0 &&
        changed.every((name) => name === "search" || name === "anyOf");
      let mode = history;
      if (textOnly && textHistory === "replace") mode = "replace";
      if (textOnly && textHistory === "push") mode = "push";
      if (textOnly && textHistory === "session") {
        const now = Date.now();
        mode = now - lastTextWriteAt.current < 750 ? "replace" : history;
        lastTextWriteAt.current = now;
      }
      writeState(next, mode);
    },
    [history, state, textHistory, writeState],
  );

  const reset = useCallback(() => {
    const dSort =
      defaultSortId && defaultSortDirection
        ? { id: defaultSortId, direction: defaultSortDirection }
        : null;
    const next: MatrxDataTableQueryState = {
      page: 1,
      pageSize: defaultPageSize,
      search: "",
      searchMatchMode: "contains",
      anyOf: "",
      layeredFilters: [],
      columnFilters: {},
      sort: dSort,
    };
    writeState(next);
    setDebouncedSearch("");
  }, [defaultPageSize, defaultSortDirection, defaultSortId, writeState]);

  const queryState = useMemo<MatrxDataTableQueryState>(
    () =>
      state.search === debouncedSearch
        ? state
        : { ...state, search: debouncedSearch, page: 1 },
    [state, debouncedSearch],
  );

  return { state, queryState, onStateChange, reset };
}
