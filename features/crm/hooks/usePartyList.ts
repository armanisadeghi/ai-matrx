"use client";

// features/crm/hooks/usePartyList.ts
//
// Query state + fetch for the /crm list. Follows the canonical entity-list
// split (lib/entity-list): QUERY (scope, search, kind, filters, page) lives
// here and always starts clean; STYLE (sort, direction, page size, density)
// arrives from useListViewPrefs via the caller.
//
// Generation-guarded: a slow response for an abandoned query can never
// overwrite a newer one.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { EntityScopeCounts } from "@/lib/entity-list/types";
import { EMPTY_SCOPE_COUNTS } from "@/lib/entity-list/types";
import { fetchPartyPage, fetchPartyScopeCounts } from "../service";
import type {
  CrmQueryContext,
  PartyListQuery,
  PartyListRow,
  PartySortOpts,
} from "../types";
import { DEFAULT_PARTY_QUERY } from "../types";
import { useCrmContext } from "./useCrmContext";

export interface UsePartyListResult {
  query: PartyListQuery;
  setQuery: (patch: Partial<PartyListQuery>) => void;
  rows: PartyListRow[];
  total: number;
  counts: EntityScopeCounts;
  isLoading: boolean;
  isFetching: boolean;
  error: string | null;
  /** The resolved caller context (null until orgs have loaded). */
  ctx: CrmQueryContext | null;
  refresh: () => void;
  /** Patch one loaded row in place (post-edit, no refetch flash). */
  patchRow: (id: string, patch: Partial<PartyListRow>) => void;
  removeRow: (id: string) => void;
}

export function usePartyList(opts: PartySortOpts): UsePartyListResult {
  const [query, setQueryState] = useState<PartyListQuery>(DEFAULT_PARTY_QUERY);
  const [rows, setRows] = useState<PartyListRow[]>([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<EntityScopeCounts>(EMPTY_SCOPE_COUNTS);
  const [isLoading, setIsLoading] = useState(true);
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generation, setGeneration] = useState(0);

  // Resolve the caller's org memberships ONCE — the "orgs" scope predicate
  // and the My Orgs narrowing dropdown both come from this, never from a
  // Redux slice that may not be hydrated on this surface.
  const ctx = useCrmContext();

  const generationRef = useRef(0);

  useEffect(() => {
    if (!ctx) return;
    const resolvedCtx = ctx;
    const gen = ++generationRef.current;
    // Small debounce so type-ahead search / rapid filter clicks coalesce into
    // one query instead of a request per keystroke. Generation still guards
    // ordering for anything that slips through. State flips live inside the
    // timer so the effect body itself never calls setState synchronously.
    const timer = setTimeout(() => {
      setIsFetching(true);
      setError(null);
      void run();
    }, 200);
    async function run() {
      try {
        const [page, scopeCounts] = await Promise.all([
          fetchPartyPage(query, opts, resolvedCtx),
          fetchPartyScopeCounts(query, resolvedCtx),
        ]);
        if (generationRef.current !== gen) return;
        setRows(page.rows);
        setTotal(page.total);
        setCounts(scopeCounts);
        setIsLoading(false);
      } catch (e) {
        if (generationRef.current !== gen) return;
        const message = e instanceof Error ? e.message : String(e);
        console.error("[crm] party list fetch failed:", message);
        setError(message);
        setIsLoading(false);
      } finally {
        if (generationRef.current === gen) setIsFetching(false);
      }
    }
    return () => clearTimeout(timer);
  }, [ctx, query, opts.sort, opts.direction, opts.pageSize, generation]);  

  const setQuery = useCallback((patch: Partial<PartyListQuery>) => {
    setQueryState((prev) => ({
      ...prev,
      ...patch,
      // Any narrowing change resets paging; an explicit page wins.
      page: patch.page ?? 1,
    }));
  }, []);

  const refresh = useCallback(() => setGeneration((g) => g + 1), []);

  const patchRow = useCallback((id: string, patch: Partial<PartyListRow>) => {
    setRows((prev) =>
      prev.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    );
  }, []);

  const removeRow = useCallback((id: string) => {
    setRows((prev) => prev.filter((row) => row.id !== id));
    setTotal((t) => Math.max(0, t - 1));
  }, []);

  return useMemo(
    () => ({
      query,
      setQuery,
      rows,
      total,
      counts,
      isLoading,
      isFetching,
      error,
      ctx,
      refresh,
      patchRow,
      removeRow,
    }),
    [
      query,
      setQuery,
      rows,
      total,
      counts,
      isLoading,
      isFetching,
      error,
      ctx,
      refresh,
      patchRow,
      removeRow,
    ],
  );
}
