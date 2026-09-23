/**
 * useRowVersions — read-only history for a single dataset row.
 *
 * Queries the `udt_dataset_row_versions` append-only log via Supabase. RLS
 * scopes results to versions of rows in datasets the current user can view.
 *
 * Returns versions newest-first. Each version has the full `data` and
 * `prior_data` snapshots, so the caller can diff or replay without further
 * fetches. `changed_by` is NULL for system writes (service_role / cron / admin
 * tools) — render that case explicitly rather than falsely attributing it.
 */
"use client";

import { useEffect, useRef, useState } from "react";

import { supabase } from "@/utils/supabase/client";

import { isRecordStoreTable, readRowHistory } from "../service";
import type { RowVersion } from "../types";

type UseRowVersionsState = {
  versions: RowVersion[];
  loading: boolean;
  error: string | null;
};

export function useRowVersions(
  rowId: string | null | undefined,
  options?: {
    limit?: number;
    /**
     * The row's table. A table the RECORD STORE holds reads the store's own
     * history (`custom.record_history`, via the data seam) instead of
     * `udt_dataset_row_versions`, in the same shape.
     */
    tableId?: string | null;
  },
): UseRowVersionsState & { refresh: () => void } {
  const limit = options?.limit ?? 50;
  const tableId = options?.tableId ?? null;
  const [state, setState] = useState<UseRowVersionsState>({
    versions: [],
    loading: false,
    error: null,
  });
  const [reloadToken, setReloadToken] = useState(0);
  const lastRowIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!rowId) {
      lastRowIdRef.current = null;
      setState({ versions: [], loading: false, error: null });
      return undefined;
    }

    let cancelled = false;
    // A DIFFERENT row must never show the previous row's entries while its
    // fetch is in flight (a caller could restore the wrong row's snapshot).
    // Same-row reloads (load-more, refresh) keep the list to avoid flicker.
    const rowChanged = lastRowIdRef.current !== rowId;
    lastRowIdRef.current = rowId;
    setState((s) => ({
      versions: rowChanged ? [] : s.versions,
      loading: true,
      error: null,
    }));

    if (tableId && isRecordStoreTable(tableId)) {
      void readRowHistory({ tableId, rowId, limit }).then((read) => {
        if (cancelled) return;
        setState(
          read.success
            ? { versions: read.data, loading: false, error: null }
            : { versions: [], loading: false, error: read.error },
        );
      });
      return () => {
        cancelled = true;
      };
    }

    supabase
      .schema("workbench")
      .from("udt_dataset_row_versions")
      .select("*")
      .eq("row_id", rowId)
      .order("changed_at", { ascending: false })
      .limit(limit)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setState({ versions: [], loading: false, error: error.message });
          return;
        }
        setState({
          versions: (data ?? []) as RowVersion[],
          loading: false,
          error: null,
        });
      })
      // Supabase's PostgrestBuilder resolves with {data, error}, but a
      // pre-response network throw bypasses .then entirely. Guard so the
      // hook can never get stuck in `loading: true`.
      .then(
        () => {},
        (err: unknown) => {
          if (cancelled) return;
          setState({
            versions: [],
            loading: false,
            error: err instanceof Error ? err.message : String(err),
          });
        },
      );

    return () => {
      cancelled = true;
    };
  }, [rowId, limit, reloadToken, tableId]);

  return {
    ...state,
    refresh: () => setReloadToken((t) => t + 1),
  };
}
