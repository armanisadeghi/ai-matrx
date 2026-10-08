"use client";

// features/admin/shared/server-table/useServerTable.ts
//
// The controlled-table wiring every admin table that reads from the database repeats: hold the
// query state, run the fetcher on every change, keep only the NEWEST answer (a slow broad query
// never overwrites a fast narrow one), and hand MatrxDataTable the props that make search, column
// filters, sort and paging SOURCE-owned. The footer total is the server's total.

import { useCallback, useEffect, useRef, useState } from "react";
import { useTableUrlState } from "@ai-matrx/design-system/data-table";
import type { MatrxDataTableQueryState } from "@ai-matrx/design-system/data-table/types";

export function serverTableInitialState(
  sort: MatrxDataTableQueryState["sort"],
  pageSize = 50,
): MatrxDataTableQueryState {
  return { page: 1, pageSize, search: "", anyOf: "", columnFilters: {}, sort };
}

export function useServerTable<T>(
  fetcher: (state: MatrxDataTableQueryState) => Promise<{ rows: T[]; total: number }>,
  initial: MatrxDataTableQueryState,
  what: string,
  /** Anything else the fetcher closes over (a toolbar picker): when it changes the table re-queries from page 1. */
  externalKey = "",
  /**
   * The table's address id (`/^[a-z][a-z0-9-]*$/`): search, filters, sort and page live in the URL, so a
   * reload or a shared link reopens the same view. MatrxDataTable's own `urlState` cannot be combined
   * with controlled mode, so a server table MUST pass this to keep that platform feature.
   */
  urlId?: string,
) {
  const [localQuery, setLocalQuery] = useState<MatrxDataTableQueryState>(initial);
  const url = useTableUrlState({
    tableId: urlId ?? "unsaved-view",
    defaultSort: initial.sort,
    defaultPageSize: initial.pageSize,
  });
  // The table shows the live state; the fetch reads the search-debounced one, keyed by what it SAYS
  // (the URL hook rebuilds its object every render).
  const query = urlId ? url.state : localQuery;
  const fetchKey = JSON.stringify(urlId ? url.queryState : localQuery);
  const urlStateRef = useRef(url);
  urlStateRef.current = url;
  const setQuery = useCallback(
    (next: MatrxDataTableQueryState | ((q: MatrxDataTableQueryState) => MatrxDataTableQueryState)) => {
      if (!urlId) {
        setLocalQuery(next);
        return;
      }
      const u = urlStateRef.current;
      u.onStateChange(typeof next === "function" ? next(u.state) : next);
    },
    [urlId],
  );
  const [rows, setRows] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  const latest = useRef(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    const ticket = ++latest.current;
    setLoading(true);
    fetcherRef
      .current(JSON.parse(fetchKey) as MatrxDataTableQueryState)
      .then((answer) => {
        if (ticket !== latest.current) return;
        setRows(answer.rows);
        setTotal(answer.total);
        setError(null);
      })
      .catch((e: unknown) => {
        if (ticket !== latest.current) return;
        setError(e instanceof Error ? e.message : `The ${what} could not be loaded.`);
      })
      .finally(() => {
        if (ticket === latest.current) setLoading(false);
      });
  }, [fetchKey, reloadTick, what, externalKey]);

  // An outside filter changed: the old page number may no longer exist.
  const lastExternalKey = useRef(externalKey);
  useEffect(() => {
    if (lastExternalKey.current === externalKey) return;
    lastExternalKey.current = externalKey;
    setQuery((q) => (q.page === 1 ? q : { ...q, page: 1 }));
  }, [externalKey, setQuery]);

  const reload = useCallback(() => setReloadTick((n) => n + 1), []);

  const tableProps = {
    data: rows,
    isLoading: loading && rows.length === 0,
    isFetching: loading && rows.length > 0,
    read: {
      status: error ? ("error" as const) : loading && rows.length === 0 ? ("loading" as const) : ("ready" as const),
      error: error ?? undefined,
      onRetry: reload,
      what,
    },
    query: {
      mode: "controlled" as const,
      state: query,
      totalItems: total,
      onStateChange: setQuery,
      sourceProcessing: {
        search: "source" as const,
        columnFilters: "source" as const,
        sort: "source" as const,
        sourceTotal: total,
      },
    },
  };

  return { rows, setRows, setQuery, total, loading, error, query, reload, tableProps };
}
