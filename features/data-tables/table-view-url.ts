/**
 * The grid's view state, encoded for the URL.
 *
 * THE URL IS THE VIEW. Search, sort, column filters, page and page size all
 * live in the query string, so a refresh reproduces exactly what was on screen,
 * a copied link shows a colleague the same thing, and Back/Forward walk the
 * user's own decisions instead of only the route. A view that exists solely in
 * component state is a view that cannot be shared, bookmarked, or returned to.
 *
 * Parameter names match `lib/data-table/useTableUrlState` on purpose — `q`,
 * `sort`, `f`, `p`, `ps` mean the same thing on every table surface in the app.
 * A second vocabulary for the same five concepts would be a small betrayal of
 * every user who learned the first one.
 *
 * DEFAULTS ARE OMITTED, never written. A pristine grid has a clean URL, and
 * "no `sort` parameter" and "sorted the default way" stay the same thing —
 * otherwise every link acquires noise that means nothing.
 *
 * Pure module: no React, no DOM, so the encoding round-trip is testable without
 * a browser.
 */

import {
  isActiveFilter,
  type ColumnFilter,
  type ColumnFilterMap,
} from "./column-filters";

export type SortDirection = "asc" | "desc";

export type TableViewState = {
  search: string;
  sortField: string | null;
  sortDirection: SortDirection;
  filters: ColumnFilterMap;
  page: number;
  pageSize: number;
};

export type TableViewDefaults = {
  pageSize: number;
};

/** Query-string keys this module owns. Nothing else may write them. */
export const TABLE_VIEW_PARAM_KEYS = ["q", "sort", "f", "p", "ps"] as const;

/**
 * Keys whose changes REPLACE rather than push a history entry.
 *
 * Only the search box: it fires per keystroke, and one history entry per
 * character would make Back useless — you would press it eleven times to undo
 * typing "Washington". Every other control is a discrete decision and pushes,
 * so Back undoes exactly that one choice.
 */
export const TABLE_VIEW_TEXT_KEYS = ["q"] as const;

function isColumnFilter(value: unknown): value is ColumnFilter {
  if (typeof value !== "object" || value === null) return false;
  const mode = (value as { mode?: unknown }).mode;
  if (mode === "text") {
    return typeof (value as { text?: unknown }).text === "string";
  }
  if (mode === "values") {
    const v = value as { values?: unknown; includeBlank?: unknown; negate?: unknown };
    return (
      Array.isArray(v.values) &&
      v.values.every((x) => typeof x === "string") &&
      typeof v.includeBlank === "boolean" &&
      typeof v.negate === "boolean"
    );
  }
  if (mode === "range") {
    const v = value as { min?: unknown; max?: unknown };
    return typeof v.min === "string" && typeof v.max === "string";
  }
  return false;
}

/**
 * Validate a decoded filter map.
 *
 * A URL is user-editable and arrives from strangers, so a malformed `f` must
 * degrade to "no filters" rather than throwing the grid into an error state or,
 * worse, filtering by a shape nothing understands.
 */
export function isColumnFilterMap(value: unknown): value is ColumnFilterMap {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  return Object.values(value as Record<string, unknown>).every(isColumnFilter);
}

export function parseSortParam(
  raw: string | null,
): { field: string | null; direction: SortDirection } {
  if (!raw) return { field: null, direction: "asc" };
  // Split on the LAST dot: a field name may legitimately contain dots.
  const at = raw.lastIndexOf(".");
  if (at <= 0) return { field: raw, direction: "asc" };
  const direction = raw.slice(at + 1);
  if (direction !== "asc" && direction !== "desc") {
    return { field: raw, direction: "asc" };
  }
  return { field: raw.slice(0, at), direction };
}

/** Drop filters that are not narrowing anything, so the URL carries only signal. */
export function activeFiltersOnly(filters: ColumnFilterMap): ColumnFilterMap {
  const out: ColumnFilterMap = {};
  for (const [field, filter] of Object.entries(filters)) {
    if (isActiveFilter(filter)) out[field] = filter;
  }
  return out;
}

export function parseTableViewParams(
  params: URLSearchParams,
  defaults: TableViewDefaults,
): TableViewState {
  const { field, direction } = parseSortParam(params.get("sort"));

  let filters: ColumnFilterMap = {};
  const rawFilters = params.get("f");
  if (rawFilters) {
    try {
      const parsed: unknown = JSON.parse(rawFilters);
      if (isColumnFilterMap(parsed)) filters = parsed;
    } catch {
      // A hand-mangled URL must not break the grid.
    }
  }

  const readPositiveInt = (key: string, fallback: number): number => {
    const raw = params.get(key);
    const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  };

  return {
    search: params.get("q") ?? "",
    sortField: field,
    sortDirection: direction,
    filters,
    page: readPositiveInt("p", 1),
    pageSize: readPositiveInt("ps", defaults.pageSize),
  };
}

/**
 * The patch to apply to the query string for a given view.
 *
 * `null` means "remove this key" — that is how a value returning to its default
 * disappears from the URL instead of lingering as `?p=1`.
 */
export function tableViewParamPatch(
  state: TableViewState,
  defaults: TableViewDefaults,
): Record<string, string | null> {
  const active = activeFiltersOnly(state.filters);
  const hasFilters = Object.keys(active).length > 0;

  return {
    q: state.search.trim() === "" ? null : state.search,
    sort: state.sortField
      ? `${state.sortField}.${state.sortDirection}`
      : null,
    f: hasFilters ? JSON.stringify(active) : null,
    p: state.page > 1 ? String(state.page) : null,
    ps: state.pageSize === defaults.pageSize ? null : String(state.pageSize),
  };
}

/** Do two views describe the same thing? Used to avoid pointless history churn. */
export function sameTableView(a: TableViewState, b: TableViewState): boolean {
  return (
    a.search === b.search &&
    a.sortField === b.sortField &&
    a.sortDirection === b.sortDirection &&
    a.page === b.page &&
    a.pageSize === b.pageSize &&
    JSON.stringify(activeFiltersOnly(a.filters)) ===
      JSON.stringify(activeFiltersOnly(b.filters))
  );
}
