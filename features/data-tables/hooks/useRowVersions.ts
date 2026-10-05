/**
 * useRowVersions — read-only history for a single table row.
 *
 * Reads the store's own history (`custom.record_history`, through the data seam's
 * `readRowHistory`), rebuilt into the grid's version shape. Returns versions newest-first. Each
 * version has the full `data` and `prior_data` snapshots, so the caller can diff without further
 * fetches. `changed_by` is NULL for system writes — render that case explicitly rather than
 * falsely attributing it.
 */
"use client";

import { useEffect, useRef, useState } from "react";

import { readRowHistory } from "../service";
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
    /** The row's table; its history is asked of the table's store. */
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
    if (!rowId || !tableId) {
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

    readRowHistory({ tableId, rowId, limit }).then(
      (read) => {
        if (cancelled) return;
        setState(
          read.success
            ? { versions: read.data, loading: false, error: null }
            : { versions: [], loading: false, error: read.error },
        );
      },
      (err: unknown) => {
        if (cancelled) return;
        setState({ versions: [], loading: false, error: err instanceof Error ? err.message : String(err) });
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
