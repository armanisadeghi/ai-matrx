"use client";

// lib/entity-list/useEntityList.ts
//
// The query half of a canonical entity-list surface. Owns the server round
// trip; owns nothing about presentation (that's useListViewPrefs). Lifted from
// features/agents/browse/useAgentBrowse with behaviour unchanged.
//
// Every fetch is generation-guarded: a slow response for an abandoned query can
// never overwrite a newer one. That class of bug is invisible until a user
// types fast on a slow connection and the list settles on the wrong results.

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "@/lib/toast";
import type { ListViewPrefs } from "@/lib/redux/preferences/userPreferencesSlice";
import { useUrlSearchParams } from "@/lib/url-state/useUrlState";
import type { EntityListController, EntityListService } from "./config";
import {
  DEFAULT_ENTITY_LIST_QUERY,
  EMPTY_FACETS,
  EMPTY_SCOPE_COUNTS,
  type EntityFacets,
  type EntityFilters,
  type EntityListQuery,
  type EntityScopeCounts,
} from "./types";
import {
  commitUrlParams,
  historyModeFor,
  queryToParamPatch,
  readQueryFromParams,
} from "./urlQuery";
import type { ListScope } from "@/lib/list-scope/types";

const SEARCH_DEBOUNCE_MS = 250;

export interface UseEntityListArgs<TRow> {
  service: EntityListService<TRow>;
  getRowId: (row: TRow) => string;
  /** Plural, lowercase — error toasts ("Could not load agents"). */
  entityLabelPlural: string;
  view: Pick<
    ListViewPrefs,
    "sort" | "direction" | "pageSize" | "favoritesFirst"
  >;
  /**
   * The surface's own starting query — where "no filters applied" lands and
   * where `resetFilters` returns to. A surface whose honest default is a SUBSET
   * of its corpus (conversations hide ~4.6k internal machine runs) declares it
   * here so the default is one visible, clearable filter instead of a predicate
   * buried in SQL that the user can never see or undo.
   */
  defaultFilters?: EntityFilters;
  /**
   * Put the query in the URL (scope / search / filters / archived / deep /
   * page). Off by default so existing surfaces are untouched; on, the URL is
   * the source of truth and Back/Forward/refresh/deep-link all work.
   */
  urlState?: boolean;
}

/**
 * The query, held either in React state or in the URL. Same interface either
 * way, so nothing downstream of here knows which surface opted in.
 */
function useQueryState(
  urlState: boolean,
  defaults: EntityListQuery,
): [
  EntityListQuery,
  (updater: (prev: EntityListQuery) => EntityListQuery) => void,
] {
  const [localQuery, setLocalQuery] = useState<EntityListQuery>(defaults);
  const searchParams = useUrlSearchParams();

  // useSyncExternalStore already re-renders on popstate, so a URL-backed query
  // needs no effect and no mirror state: Back/Forward simply re-parses.
  const urlQuery = readQueryFromParams(searchParams, defaults);
  const query = urlState ? urlQuery : localQuery;

  const setQuery = (updater: (prev: EntityListQuery) => EntityListQuery) => {
    if (!urlState) {
      setLocalQuery(updater);
      return;
    }
    // Re-read at commit time rather than trusting the render-time snapshot —
    // two updates in one tick would otherwise clobber each other.
    const current = readQueryFromParams(
      new URLSearchParams(window.location.search),
      defaults,
    );
    const next = updater(current);
    commitUrlParams(
      queryToParamPatch(next, defaults),
      historyModeFor(current, next),
    );
  };

  return [query, setQuery];
}

export function useEntityList<TRow>({
  service,
  getRowId,
  entityLabelPlural,
  view,
  defaultFilters,
  urlState = false,
}: UseEntityListArgs<TRow>): EntityListController<TRow> {
  const defaultQuery: EntityListQuery = defaultFilters
    ? { ...DEFAULT_ENTITY_LIST_QUERY, filters: defaultFilters }
    : DEFAULT_ENTITY_LIST_QUERY;
  const [query, setQuery] = useQueryState(urlState, defaultQuery);
  // Seeded from the query, not from "" — a URL-backed surface opened at
  // `?q=seo` must not fire one throwaway unfiltered fetch before the debounce
  // catches up.
  const [debouncedSearch, setDebouncedSearch] = useState(() => query.search);
  const [rows, setRows] = useState<TRow[]>([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<EntityScopeCounts>(EMPTY_SCOPE_COUNTS);
  const [facets, setFacets] = useState<EntityFacets>(EMPTY_FACETS);
  const [isLoading, setIsLoading] = useState(true);
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  const generation = useRef(0);
  const hasLoadedOnce = useRef(false);

  // Debounce only the text; every other query field applies immediately.
  useEffect(() => {
    const id = setTimeout(
      () => setDebouncedSearch(query.search),
      SEARCH_DEBOUNCE_MS,
    );
    return () => clearTimeout(id);
  }, [query.search]);

  const effectiveQuery: EntityListQuery = { ...query, search: debouncedSearch };
  const queryKey = JSON.stringify({
    q: effectiveQuery,
    sort: view.sort,
    dir: view.direction,
    favFirst: view.favoritesFirst,
    size: view.pageSize,
    refreshToken,
  });

  useEffect(() => {
    const gen = ++generation.current;
    if (hasLoadedOnce.current) setIsFetching(true);
    else setIsLoading(true);

    void (async () => {
      try {
        const page = await service.fetchPage(effectiveQuery, {
          sort: view.sort,
          direction: view.direction,
          favoritesFirst: view.favoritesFirst,
          pageSize: view.pageSize,
        });
        if (gen !== generation.current) return; // a newer query won
        setRows(page.rows);
        setTotal(page.total);
        setError(null);
      } catch (err) {
        if (gen !== generation.current) return;
        const message =
          err instanceof Error
            ? err.message
            : `Failed to load ${entityLabelPlural}`;
        setError(message);
        // Loud recovery: the list going empty must never look like "you have
        // nothing here" when it was actually a failed read.
        toast.error(`Could not load ${entityLabelPlural}`, {
          description: message,
        });
      } finally {
        if (gen === generation.current) {
          hasLoadedOnce.current = true;
          setIsLoading(false);
          setIsFetching(false);
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- queryKey is the serialized dep set
  }, [queryKey]);

  // Counts depend on every filter EXCEPT the scope and the page, so they don't
  // re-fetch when the user just switches tabs or pages. The query handed to
  // the service carries ONLY those fields (scope pinned to the default, page
  // 1): counts are scope-independent by contract, and passing the live scope
  // here would hand the service a stale value from the last key change.
  const countsQuery: EntityListQuery = {
    ...DEFAULT_ENTITY_LIST_QUERY,
    search: debouncedSearch,
    deep: query.deep,
    archived: query.archived,
    filters: query.filters,
  };
  const countsKey = JSON.stringify({ q: countsQuery, refreshToken });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const next = await service.fetchCounts(countsQuery);
        if (!cancelled) setCounts(next);
      } catch (err) {
        // Counts are an adornment; a failure must not blank the list. Still
        // reported, never swallowed.
        console.error(`[entity-list] scope counts failed`, err);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- countsKey is the serialized dep set
  }, [countsKey]);

  // Facets depend on scope + search + archived only. They deliberately ignore
  // the category/tag selection (a facet list that drops the option you just
  // deselected traps the user inside their own filter) — so the query handed
  // to the service carries an EMPTY filter bag, never a stale one.
  const facetsQuery: EntityListQuery = {
    ...DEFAULT_ENTITY_LIST_QUERY,
    scope: query.scope,
    search: debouncedSearch,
    deep: query.deep,
    archived: query.archived,
  };
  const facetsKey = JSON.stringify({ q: facetsQuery, refreshToken });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const next = await service.fetchFacets(facetsQuery);
        if (!cancelled) setFacets(next);
      } catch (err) {
        console.error(`[entity-list] facets failed`, err);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- facetsKey is the serialized dep set
  }, [facetsKey]);

  // Plain functions, NOT useCallback: `setQuery` is re-created per render for a
  // URL-backed surface, so an empty dep array here would freeze the very first
  // commit function and every later change would write against a stale URL.
  // The React Compiler owns memoization (CLAUDE.md core invariant).
  const patchQuery = (patch: Partial<EntityListQuery>) => {
    setQuery((prev) => ({
      ...prev,
      ...patch,
      // Any change to what is being asked for resets pagination — otherwise
      // you land on page 7 of a 2-page result and see nothing.
      page: patch.page ?? 1,
    }));
  };

  const setScope = (scope: ListScope) => patchQuery({ scope });
  const setFilters = (filters: EntityFilters) => patchQuery({ filters });
  const setSearch = (search: string) => patchQuery({ search });
  const setDeep = (deep: boolean) => patchQuery({ deep });
  const setPage = (page: number) => setQuery((prev) => ({ ...prev, page }));
  // Back to the SURFACE's default, not to the empty query. On a surface with
  // `defaultFilters`, "Clear filters" meaning "now show me the 4,613 internal
  // machine runs too" would be a trap; the explicit door to those is its own
  // control.
  const resetFilters = () =>
    setQuery((prev) => ({
      ...prev,
      archived: defaultQuery.archived,
      filters: defaultQuery.filters,
      page: 1,
    }));
  const refresh = useCallback(() => setRefreshToken((n) => n + 1), []);

  const removeRow = useCallback(
    (id: string) => {
      setRows((prev) => prev.filter((r) => getRowId(r) !== id));
      setTotal((prev) => Math.max(prev - 1, 0));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- getRowId is config, static per surface
    [],
  );

  const patchRow = useCallback(
    (id: string, patch: Partial<TRow>) => {
      setRows((prev) =>
        prev.map((r) => (getRowId(r) === id ? { ...r, ...patch } : r)),
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- getRowId is config, static per surface
    [],
  );

  return {
    query,
    rows,
    total,
    counts,
    facets,
    isLoading,
    isFetching,
    error,
    setScope,
    setFilters,
    setSearch,
    setDeep,
    patchQuery,
    setPage,
    resetFilters,
    refresh,
    removeRow,
    patchRow,
  };
}
