"use client";

// features/agents/browse/useAgentBrowse.ts
//
// The query half of the list surface. Owns the server round trip; owns nothing
// about presentation (that's useListViewPrefs).
//
// Every fetch is generation-guarded: a slow response for an abandoned query can
// never overwrite a newer one. That class of bug is invisible until a user types
// fast on a slow connection and the list settles on the wrong results.

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { ListViewPrefs } from "@/lib/redux/preferences/userPreferencesSlice";
import {
  fetchAgentBrowsePage,
  fetchBrowseFacets,
  fetchBrowseScopeCounts,
} from "./service";
import {
  DEFAULT_BROWSE_QUERY,
  EMPTY_FACETS,
  EMPTY_SCOPE_COUNTS,
  type AgentBrowseRow,
  type BrowseFacets,
  type BrowseQuery,
  type BrowseScope,
  type BrowseScopeCounts,
} from "./types";

const SEARCH_DEBOUNCE_MS = 250;

export interface UseAgentBrowseResult {
  query: BrowseQuery;
  rows: AgentBrowseRow[];
  total: number;
  counts: BrowseScopeCounts;
  facets: BrowseFacets;
  isLoading: boolean;
  isFetching: boolean;
  error: string | null;

  setScope: (scope: BrowseScope) => void;
  /** Replace the whole column-filter bag (the table emits it wholesale). */
  setFilters: (filters: BrowseQuery["filters"]) => void;
  setSearch: (search: string) => void;
  setDeep: (deep: boolean) => void;
  patchQuery: (patch: Partial<BrowseQuery>) => void;
  setPage: (page: number) => void;
  /** Clear the narrowing filters. Leaves scope + search alone — those are
   *  where the user is, not how they narrowed it. */
  resetFilters: () => void;
  refresh: () => void;
  /** Drop a row locally after a confirmed delete — no full refetch flash. */
  removeRow: (id: string) => void;
  /** Patch a row locally after an optimistic edit (favorite, rename, archive). */
  patchRow: (id: string, patch: Partial<AgentBrowseRow>) => void;
}

export function useAgentBrowse(
  view: Pick<
    ListViewPrefs,
    "sort" | "direction" | "pageSize" | "favoritesFirst"
  >,
): UseAgentBrowseResult {
  const [query, setQuery] = useState<BrowseQuery>(DEFAULT_BROWSE_QUERY);
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [rows, setRows] = useState<AgentBrowseRow[]>([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<BrowseScopeCounts>(EMPTY_SCOPE_COUNTS);
  const [facets, setFacets] = useState<BrowseFacets>(EMPTY_FACETS);
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

  const effectiveQuery: BrowseQuery = { ...query, search: debouncedSearch };
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
        const page = await fetchAgentBrowsePage(effectiveQuery, {
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
          err instanceof Error ? err.message : "Failed to load agents";
        setError(message);
        // Loud recovery: the list going empty must never look like "you have
        // no agents" when it was actually a failed read.
        toast.error("Could not load agents", { description: message });
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
        const next = await fetchBrowseScopeCounts(effectiveQuery);
        if (!cancelled) setCounts(next);
      } catch (err) {
        // Counts are an adornment; a failure must not blank the list. Still
        // reported, never swallowed.
        console.error("[agents/browse] scope counts failed", err);
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
        const next = await fetchBrowseFacets(effectiveQuery);
        if (!cancelled) setFacets(next);
      } catch (err) {
        console.error("[agents/browse] facets failed", err);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- facetsKey is the serialized dep set
  }, [facetsKey]);

  const patchQuery = useCallback((patch: Partial<BrowseQuery>) => {
    setQuery((prev) => ({
      ...prev,
      ...patch,
      // Any change to what is being asked for resets pagination — otherwise
      // you land on page 7 of a 2-page result and see nothing.
      page: patch.page ?? 1,
    }));
  }, []);

  const setScope = useCallback(
    (scope: BrowseScope) => patchQuery({ scope }),
    [patchQuery],
  );
  const setFilters = useCallback(
    (filters: BrowseQuery["filters"]) => patchQuery({ filters }),
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
        archived: DEFAULT_BROWSE_QUERY.archived,
        filters: {},
        page: 1,
      })),
    [],
  );
  const refresh = useCallback(() => setRefreshToken((n) => n + 1), []);

  const removeRow = useCallback((id: string) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
    setTotal((prev) => Math.max(prev - 1, 0));
  }, []);

  const patchRow = useCallback((id: string, patch: Partial<AgentBrowseRow>) => {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    );
  }, []);

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
