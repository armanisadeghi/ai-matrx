"use client";

/**
 * useAssistsQuery — the MANAGER's data layer (every status, server-side).
 *
 * Deliberately NOT the assists slice: the slice is the shared live-pending
 * cache the chips and dock read, and flooding it with decided history would
 * put dismissed rows back in the dock. Two read paths, ONE decision UX — the
 * shape kg-suggestions arrived at (`useSuggestionsQuery` beside
 * `useKgSuggestions`) and the reason its manager could exist at all.
 *
 * A decision made here still reconciles into the slice, so dismissing from the
 * manager clears the chip on the page behind it.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { captureError } from "@/lib/diagnostics/errorCaptureStore";
import type { MatrxDataTableQueryState } from "@/components/official/matrx-data-table/types";
import {
  bulkDismissAssists,
  bulkSnoozeAssists,
  fetchAssistStats,
  markAssistsViewed,
  queryAssists,
  restoreAssist,
  setAssistStarred,
} from "../service";
import { assistDecided } from "../redux/assistsSlice";
import { snoozeUntilIso, type SnoozeWindowKey } from "../constants";
import type {
  Assist,
  AssistSortField,
  AssistStats,
  AssistStatus,
} from "../types";

const SORT_FIELDS: readonly AssistSortField[] = [
  "created_at",
  "decided_at",
  "priority",
  "confidence",
  "status",
  "source_key",
  "first_seen_at",
  "occurrences",
];

const EMPTY_STATS: AssistStats = {
  pending: 0,
  accepted: 0,
  dismissed: 0,
  expired: 0,
  superseded: 0,
  resolved: 0,
};

function selectFilter(
  state: MatrxDataTableQueryState,
  column: string,
): string | null {
  const filter = state.columnFilters[column];
  if (!filter) return null;
  if (filter.kind === "select" || filter.kind === "text") {
    return filter.value.trim() || null;
  }
  return null;
}

export interface AssistsManagerApi {
  rows: Assist[];
  total: number;
  stats: AssistStats;
  loading: boolean;
  error: string | null;
  refresh: () => void;
  restore: (id: string) => Promise<void>;
  dismissAll: (ids: string[]) => Promise<number>;
  snoozeAll: (ids: string[], window: SnoozeWindowKey) => Promise<number>;
  setStarred: (id: string, starred: boolean) => Promise<void>;
}

export function useAssistsQuery(
  tableState: MatrxDataTableQueryState,
  options: {
    statuses: AssistStatus[];
    includeSnoozed: boolean;
    starredOnly: boolean;
    unseenOnly: boolean;
  },
): AssistsManagerApi {
  const dispatch = useAppDispatch();
  const userId = useAppSelector(selectUserId);
  const [rows, setRows] = useState<Assist[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<AssistStats>(EMPTY_STATS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const requestId = useRef(0);

  const { statuses, includeSnoozed, starredOnly, unseenOnly } = options;
  const statusKey = statuses.join(",");

  const query = useMemo(() => {
    const requestedSort = tableState.sort?.id ?? "created_at";
    const sortField =
      SORT_FIELDS.find((f) => f === requestedSort) ?? "created_at";
    return {
      statuses,
      sourceKey: selectFilter(tableState, "sourceKey"),
      sourceKind: (selectFilter(tableState, "sourceKind") ??
        null) as Assist["sourceKind"] | null,
      surfaceName: selectFilter(tableState, "surfaceName"),
      search: tableState.search,
      maxConfidence: null,
      minConfidence: null,
      includeSnoozed,
      starredOnly,
      unseenOnly,
      sortField,
      sortAscending: tableState.sort?.direction === "asc",
      page: tableState.page,
      pageSize: tableState.pageSize,
    };
    // `statusKey` stands in for the array identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableState, statusKey, includeSnoozed, starredOnly, unseenOnly]);

  useEffect(() => {
    if (!userId) return;
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const [page, nextStats] = await Promise.all([
          queryAssists(userId, query),
          fetchAssistStats(userId),
        ]);
        if (requestId.current !== id) return;
        setRows(page.rows);
        setTotal(page.total);
        setStats(nextStats);
        // Reading the row IS seeing it — stamp the ones that were unseen so
        // the dot means "new since you last looked", not "never clicked".
        void markAssistsViewed(
          page.rows.filter((r) => !r.viewedAt).map((r) => r.id),
        );
      } catch (err) {
        if (requestId.current !== id) return;
        const message =
          err instanceof Error ? err.message : "Could not load assists";
        setError(message);
        captureError({ source: "assists", message });
      } finally {
        if (requestId.current === id) setLoading(false);
      }
    })();
  }, [userId, query, nonce]);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  const restore = useCallback(
    async (id: string) => {
      await restoreAssist(id);
      refresh();
    },
    [refresh],
  );

  const dismissAll = useCallback(
    async (ids: string[]) => {
      const count = await bulkDismissAssists(ids);
      // Keep the live chips honest — a row dismissed here must leave the dock.
      for (const id of ids) dispatch(assistDecided(id));
      refresh();
      return count;
    },
    [dispatch, refresh],
  );

  const snoozeAll = useCallback(
    async (ids: string[], window: SnoozeWindowKey) => {
      const count = await bulkSnoozeAssists(ids, snoozeUntilIso(window));
      for (const id of ids) dispatch(assistDecided(id));
      refresh();
      return count;
    },
    [dispatch, refresh],
  );

  const setStarred = useCallback(async (id: string, starred: boolean) => {
    // Optimistic: a triage flag must feel instant, and a failure is loud.
    setRows((current) =>
      current.map((row) => (row.id === id ? { ...row, isStarred: starred } : row)),
    );
    try {
      await setAssistStarred(id, starred);
    } catch (err) {
      setRows((current) =>
        current.map((row) =>
          row.id === id ? { ...row, isStarred: !starred } : row,
        ),
      );
      captureError({
        source: "assists",
        message: `Assist ${id} star failed`,
        details: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }, []);

  return {
    rows,
    total,
    stats,
    loading,
    error,
    refresh,
    restore,
    dismissAll,
    snoozeAll,
    setStarred,
  };
}
