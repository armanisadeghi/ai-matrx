"use client";

// lib/entity-list/urlQuery.ts
//
// THE URL IS THE LIST'S QUERY. Opt-in per surface (`config.urlState`), because
// a list whose scope, search, filters and page live only in React state cannot
// be linked, cannot survive a refresh, and turns the browser Back button into
// "leave the page" — which is the system rule /work/conversations was violating.
//
// This is the entity-list adapter over the canonical primitive in
// lib/url-state (`useUrlSearchParams` / `commitUrlParams`). It owns ONLY the
// encoding: which param name carries which part of `EntityListQuery`, and how a
// value round-trips. It deliberately does not own the fetch, the debounce, or
// the defaults — those stay in useEntityList.
//
// Encoding rules, all in service of a readable, shareable URL:
//   * A value equal to the surface's default is ABSENT from the URL. A clean
//     page has a clean address bar.
//   * `filters` is one JSON param, not one param per column — the filter bag is
//     already the one vocabulary the table headers and the panel share
//     (lib/entity-list/types.ts), and splitting it here would be a second
//     encoding to keep in sync.
//   * An unparseable or unknown value falls back to the default rather than
//     throwing. A hand-edited or stale URL must never break the page.

import type { UrlHistoryMode } from "@/lib/url-state/useUrlState";
import {
  makeScope,
  scopeKey,
  type ListScope,
  type ListScopeKind,
} from "@/lib/list-scope/types";
import type { ArchivedFilter, EntityFilters, EntityListQuery } from "./types";

/** Every param this adapter owns. Namespaced-free on purpose: one list per page. */
export const ENTITY_LIST_URL_PARAMS = {
  scope: "scope",
  search: "q",
  page: "page",
  filters: "filters",
  archived: "archived",
  deep: "deep",
  sort: "sort",
  direction: "dir",
} as const;

const ARCHIVED_VALUES: ArchivedFilter[] = ["active", "archived", "all"];
const SCOPE_KINDS: ListScopeKind[] = [
  "mine",
  "orgs",
  "shared",
  "industry",
  "public",
  "system",
];

/** `mine` | `shared` | `orgs` | `orgs:<uuid>` | `industry:<uuid>` | `system`. */
function parseScope(raw: string | null, fallback: ListScope): ListScope {
  if (!raw) return fallback;
  const [kind, narrowId] = raw.split(":", 2);
  if (!SCOPE_KINDS.includes(kind as ListScopeKind)) return fallback;
  return makeScope(kind as ListScopeKind, narrowId || null);
}

function parseFilters(raw: string | null): EntityFilters | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    return parsed as EntityFilters;
  } catch {
    return null;
  }
}

export interface EntityListUrlSort {
  sort: string;
  direction: "asc" | "desc";
}

/**
 * Read the whole query off a query string. `defaults` is the surface's own
 * starting point (which for a surface with `defaultFilters` is NOT the generic
 * empty query), so "absent means default" stays true per surface.
 */
export function readQueryFromParams(
  params: URLSearchParams,
  defaults: EntityListQuery,
): EntityListQuery {
  const page = Number.parseInt(
    params.get(ENTITY_LIST_URL_PARAMS.page) ?? "",
    10,
  );
  const archivedRaw = params.get(ENTITY_LIST_URL_PARAMS.archived);
  const filters = parseFilters(params.get(ENTITY_LIST_URL_PARAMS.filters));

  return {
    scope: parseScope(
      params.get(ENTITY_LIST_URL_PARAMS.scope),
      defaults.scope,
    ),
    search: params.get(ENTITY_LIST_URL_PARAMS.search) ?? defaults.search,
    deep: params.has(ENTITY_LIST_URL_PARAMS.deep)
      ? params.get(ENTITY_LIST_URL_PARAMS.deep) === "1"
      : defaults.deep,
    archived: ARCHIVED_VALUES.includes(archivedRaw as ArchivedFilter)
      ? (archivedRaw as ArchivedFilter)
      : defaults.archived,
    // A filters param that is present but empty (`{}`) is a real, deliberate
    // state — "show me everything, including what this surface hides by
    // default" — and must NOT collapse back to the surface default.
    filters: filters ?? defaults.filters,
    page: Number.isFinite(page) && page > 0 ? page : 1,
  };
}

/** Read the sort half (STYLE, but linkable) off a query string. */
export function readSortFromParams(
  params: URLSearchParams,
  defaults: EntityListUrlSort,
): EntityListUrlSort {
  const direction = params.get(ENTITY_LIST_URL_PARAMS.direction);
  return {
    sort: params.get(ENTITY_LIST_URL_PARAMS.sort) ?? defaults.sort,
    direction: direction === "asc" || direction === "desc"
      ? direction
      : defaults.direction,
  };
}

/** The param patch for one query, with defaults encoded as absence. */
export function queryToParamPatch(
  query: EntityListQuery,
  defaults: EntityListQuery,
): Record<string, string | null> {
  const sameFilters =
    JSON.stringify(query.filters) === JSON.stringify(defaults.filters);
  return {
    [ENTITY_LIST_URL_PARAMS.scope]:
      scopeKey(query.scope) === scopeKey(defaults.scope)
        ? null
        : scopeKey(query.scope),
    [ENTITY_LIST_URL_PARAMS.search]: query.search.trim() ? query.search : null,
    [ENTITY_LIST_URL_PARAMS.deep]:
      query.deep === defaults.deep ? null : query.deep ? "1" : "0",
    [ENTITY_LIST_URL_PARAMS.archived]:
      query.archived === defaults.archived ? null : query.archived,
    [ENTITY_LIST_URL_PARAMS.filters]: sameFilters
      ? null
      : JSON.stringify(query.filters),
    [ENTITY_LIST_URL_PARAMS.page]: query.page > 1 ? String(query.page) : null,
  };
}

export function sortToParamPatch(
  sort: EntityListUrlSort,
  defaults: EntityListUrlSort,
): Record<string, string | null> {
  return {
    [ENTITY_LIST_URL_PARAMS.sort]:
      sort.sort === defaults.sort ? null : sort.sort,
    [ENTITY_LIST_URL_PARAMS.direction]:
      sort.direction === defaults.direction ? null : sort.direction,
  };
}

/**
 * Typing in a search box must not push one history entry per keystroke — that
 * is the difference between Back meaning "undo my filter" and Back meaning
 * "press it 40 times".
 */
export function historyModeFor(
  previous: EntityListQuery,
  next: EntityListQuery,
): UrlHistoryMode {
  const onlySearchChanged =
    previous.search !== next.search &&
    scopeKey(previous.scope) === scopeKey(next.scope) &&
    previous.archived === next.archived &&
    previous.deep === next.deep &&
    JSON.stringify(previous.filters) === JSON.stringify(next.filters);
  return onlySearchChanged ? "replace" : "push";
}
