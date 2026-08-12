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
 * URL): `p` page, `ps` pageSize, `q` search, `sort` "<id>.<asc|desc>",
 * `f` JSON-encoded columnFilters. Written with `history.replaceState` — no
 * server round-trip, no scroll jump, no history spam per keystroke.
 *
 * This is deliberately VIEW-QUERY state (search, filters, page) — ephemeral,
 * shareable via link, never persisted. View STYLE (density, columns, view)
 * belongs to `useListViewPrefs` (lib/list-views), a different axis.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type {
  ColumnFiltersState,
  MatrxDataTableQueryState,
  SortState,
} from "@/components/official/matrx-data-table/types";

export interface UseTableUrlStateOptions {
  /** Initial sort when the URL carries none. Default: none. */
  defaultSort?: SortState | null;
  /** Default page size (also the "omit from URL" value). Default 25. */
  defaultPageSize?: number;
  /** Debounce for `queryState.search`, ms. Default 300. */
  searchDebounceMs?: number;
  /**
   * Namespace prefix for the URL params (e.g. "a" → "a.p", "a.q") so two
   * tables can share one page without clobbering each other. Default: none.
   */
  paramPrefix?: string;
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

function parseFilters(raw: string | null): ColumnFiltersState {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as ColumnFiltersState;
    }
  } catch {
    // A hand-mangled URL is not an error state — fall through to empty.
  }
  return {};
}

function positiveInt(raw: string | null, fallback: number): number {
  const n = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function useTableUrlState(
  options: UseTableUrlStateOptions = {},
): TableUrlState {
  const {
    defaultSort = null,
    defaultPageSize = 25,
    searchDebounceMs = 300,
    paramPrefix,
  } = options;
  const key = useCallback(
    (name: string) => (paramPrefix ? `${paramPrefix}.${name}` : name),
    [paramPrefix],
  );

  const searchParams = useSearchParams();
  // Hydrate ONCE from the URL the page loaded with; after that, state is the
  // source of truth and the URL is a mirror (back/forward still works because
  // replaceState keeps the entry current).
  const [state, setState] = useState<MatrxDataTableQueryState>(() => ({
    page: positiveInt(searchParams.get(key("p")), 1),
    pageSize: positiveInt(searchParams.get(key("ps")), defaultPageSize),
    search: searchParams.get(key("q")) ?? "",
    anyOf: "",
    columnFilters: parseFilters(searchParams.get(key("f"))),
    sort: parseSort(searchParams.get(key("sort"))) ?? defaultSort,
  }));

  const [debouncedSearch, setDebouncedSearch] = useState(state.search);
  useEffect(() => {
    if (state.search === debouncedSearch) return;
    const timer = window.setTimeout(
      () => setDebouncedSearch(state.search),
      searchDebounceMs,
    );
    return () => window.clearTimeout(timer);
  }, [state.search, debouncedSearch, searchDebounceMs]);

  // Mirror to the URL without a server round-trip or history spam.
  const defaults = useRef({ defaultSort, defaultPageSize });
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const setOrDelete = (name: string, value: string | null) => {
      if (value === null || value === "") params.delete(name);
      else params.set(name, value);
    };
    const { defaultSort: dSort, defaultPageSize: dSize } = defaults.current;
    setOrDelete(key("p"), state.page > 1 ? String(state.page) : null);
    setOrDelete(key("ps"), state.pageSize !== dSize ? String(state.pageSize) : null);
    setOrDelete(key("q"), state.search || null);
    const sortToken = state.sort ? `${state.sort.id}.${state.sort.direction}` : null;
    const defaultToken = dSort ? `${dSort.id}.${dSort.direction}` : null;
    setOrDelete(key("sort"), sortToken !== defaultToken ? sortToken : null);
    const activeFilters = Object.fromEntries(
      Object.entries(state.columnFilters).filter(([, v]) => v !== undefined),
    );
    setOrDelete(
      key("f"),
      Object.keys(activeFilters).length > 0 ? JSON.stringify(activeFilters) : null,
    );
    const query = params.toString();
    const next = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
    if (next !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
      window.history.replaceState(window.history.state, "", next);
    }
  }, [state, key]);

  const onStateChange = useCallback((next: MatrxDataTableQueryState) => {
    setState(next);
  }, []);

  const reset = useCallback(() => {
    const { defaultSort: dSort, defaultPageSize: dSize } = defaults.current;
    setState({
      page: 1,
      pageSize: dSize,
      search: "",
      anyOf: "",
      columnFilters: {},
      sort: dSort,
    });
    setDebouncedSearch("");
  }, []);

  const queryState = useMemo<MatrxDataTableQueryState>(
    () =>
      state.search === debouncedSearch
        ? state
        : { ...state, search: debouncedSearch, page: 1 },
    [state, debouncedSearch],
  );

  return { state, queryState, onStateChange, reset };
}
