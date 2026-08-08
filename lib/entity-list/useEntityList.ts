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
import { toast } from "sonner";
import type { ListViewPrefs } from "@/lib/redux/preferences/userPreferencesSlice";
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
}

export function useEntityList<TRow>({
  service,
  getRowId,
  entityLabelPlural,
  view,
}: UseEntityListArgs<TRow>): EntityListController<TRow> {
  const [query, setQuery] = useState<EntityListQuery>(DEFAULT_ENTITY_LIST_QUERY);
  const [debouncedSearch, setDebouncedSearch] = useState("");
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

  // The service is config — static per surface. A ref keeps a (mistakenly)
  // unstable service object from re-firing every effect.
  const serviceRef = useRef(service);
  serviceRef.current = service;

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
        const page = await serviceRef.current.fetchPage(effectiveQuery, {
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
  // re-fetch when the user just switches tabs or pages.
  const countsKey = JSON.stringify({
    search: debouncedSearch,
    deep: query.deep,
    archived: query.archived,
    filters: query.filters,
    refreshToken,
  });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const next = await serviceRef.current.fetchCounts(effectiveQuery);
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
  // the category/tag selection: a facet list that drops the option you just
  // deselected traps the user inside their own filter.
  const facetsKey = JSON.stringify({
    scope: query.scope,
    search: debouncedSearch,
    deep: query.deep,
    archived: query.archived,
    refreshToken,
  });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const next = await serviceRef.current.fetchFacets(effectiveQuery);
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

  const patchQuery = useCallback((patch: Partial<EntityListQuery>) => {
    setQuery((prev) => ({
      ...prev,
      ...patch,
      // Any change to what is being asked for resets pagination — otherwise
      // you land on page 7 of a 2-page result and see nothing.
      page: patch.page ?? 1,
    }));
  }, []);

  const setScope = useCallback(
    (scope: ListScope) => patchQuery({ scope }),
    [patchQuery],
  );
  const setFilters = useCallback(
    (filters: EntityFilters) => patchQuery({ filters }),
    [patchQuery],
  );
  const setSearch = useCallback(
    (search: string) => patchQuery({ search }),
    [patchQuery],
  );
  const setDeep = useCallback(
    (deep: boolean) => patchQuery({ deep }),
    [patchQuery],
  );
  const setPage = useCallback(
    (page: number) => setQuery((prev) => ({ ...prev, page })),
    [],
  );
  const resetFilters = useCallback(
    () =>
      setQuery((prev) => ({
        ...prev,
        archived: DEFAULT_ENTITY_LIST_QUERY.archived,
        filters: {},
        page: 1,
      })),
    [],
  );
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
