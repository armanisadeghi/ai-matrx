"use client";

// features/crm/deals/useDealList.ts
//
// Query state + fetch for the /crm/deals list — the deals twin of
// usePartyList: QUERY lives here and starts clean, STYLE arrives from
// useListViewPrefs via the caller, generation-guarded so a slow response for
// an abandoned query can never overwrite a newer one.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchDealPage, fetchDealWholeResult } from "./service";
import type { CrmQueryContext } from "../types";
import type { DealListQuery, DealListRow, DealSortOpts } from "./types";
import { DEFAULT_DEAL_QUERY } from "./types";
import { useCrmContext } from "../hooks/useCrmContext";
import { useRecordChanges } from "@/lib/records/recordChanges";
import type { StandardFieldColumn } from "@/features/unified-data/standard-field-columns/standardFieldColumns";

const NO_CUSTOM_FIELDS: readonly StandardFieldColumn[] = [];

export interface UseDealListResult {
  query: DealListQuery;
  setQuery: (patch: Partial<DealListQuery>) => void;
  rows: DealListRow[];
  total: number;
  isLoading: boolean;
  isFetching: boolean;
  error: string | null;
  ctx: CrmQueryContext | null;
  refresh: () => void;
  patchRow: (id: string, patch: Partial<DealListRow>) => void;
  removeRow: (id: string) => void;
  /** Set when the whole-result read (`wholeResult`) stopped at the store's export ceiling. */
  ceiling: number | null;
  /** The rows held are the WHOLE result (read with `wholeResult`), not one page. */
  isWhole: boolean;
}

export function useDealList(
  opts: DealSortOpts,
  /** The `crm_deal` token's custom fields (the generic column source). */
  customFields: readonly StandardFieldColumn[] = NO_CUSTOM_FIELDS,
  /** Read every row the query selects instead of one page (the grouped view). */
  wholeResult = false,
): UseDealListResult {
  const [query, setQueryState] = useState<DealListQuery>(DEFAULT_DEAL_QUERY);
  const [rows, setRows] = useState<DealListRow[]>([]);
  const [total, setTotal] = useState(0);
  const [ceiling, setCeiling] = useState<number | null>(null);
  // Whether the rows held are a whole-result read (the grouped view never groups a page).
  const [isWhole, setIsWhole] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generation, setGeneration] = useState(0);

  const ctx = useCrmContext();
  const generationRef = useRef(0);

  useEffect(() => {
    if (!ctx) return;
    const resolvedCtx = ctx;
    const gen = ++generationRef.current;
    const timer = setTimeout(() => {
      setIsFetching(true);
      setError(null);
      void run();
    }, 200);
    async function run() {
      try {
        const page = wholeResult
          ? await fetchDealWholeResult(query, opts, resolvedCtx, customFields, "group")
          : { ...(await fetchDealPage(query, opts, resolvedCtx, customFields)), ceiling: null };
        if (generationRef.current !== gen) return;
        setRows(page.rows);
        setTotal(page.total);
        setCeiling(page.ceiling);
        setIsWhole(wholeResult);
        setIsLoading(false);
      } catch (e) {
        if (generationRef.current !== gen) return;
        const message = e instanceof Error ? e.message : String(e);
        console.error("[crm] deal list fetch failed:", message);
        setError(message);
        setIsLoading(false);
      } finally {
        if (generationRef.current === gen) setIsFetching(false);
      }
    }
    return () => clearTimeout(timer);
  }, [ctx, query, opts.sort, opts.direction, opts.pageSize, generation, customFields, wholeResult]);

  const setQuery = useCallback((patch: Partial<DealListQuery>) => {
    setQueryState((prev) => ({
      ...prev,
      ...patch,
      page: patch.page ?? 1,
    }));
  }, []);

  const refresh = useCallback(() => setGeneration((g) => g + 1), []);
  // A deal created anywhere on this page re-asks the list.
  useRecordChanges("crm_deal", refresh);

  const patchRow = useCallback((id: string, patch: Partial<DealListRow>) => {
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
      isLoading,
      isFetching,
      error,
      ctx,
      refresh,
      patchRow,
      removeRow,
      ceiling,
      isWhole,
    }),
    [query, setQuery, rows, total, isLoading, isFetching, error, ctx, refresh, patchRow, removeRow, ceiling, isWhole],
  );
}
