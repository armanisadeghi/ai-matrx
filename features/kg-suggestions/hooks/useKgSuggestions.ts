// features/kg-suggestions/hooks/useKgSuggestions.ts
//
// The single hook every KG-suggestion surface consumes. Addresses one of
// three views via the filter union and returns the rows + count + a
// non-blocking accept/reject/defer API with optimistic removal.
//
//   useKgSuggestions({ sourceKind: "note", sourceId })  // chip / popover
//   useKgSuggestions({ scopeItemId })                    // per-slot panel
//   useKgSuggestions({ global: true })                   // global drawer
//
// Reads come from the kgSuggestions slice (shared normalized cache keyed by
// kgFilterKey); writes route through kgSuggestionsService → Supabase DIRECTLY
// (no Next.js / Python hop — the API was removed 2026-06-07). Accept / reject /
// defer branch on the row's `stage`:
//   - value      → set_context_value RPC + mark accepted
//   - link       → tag the source to the scope + mark accepted
//   - heavy_hitter → NOT handled here (needs UI input — HeavyHitterAcceptDialog
//                    drives create-scope via useHeavyHitterAccept).
// All three optimistically drop the row from EVERY list that held it, so a chip
// count and the drawer both update in one tick; on error we refresh to re-sync.

"use client";

import { useCallback, useEffect, useRef } from "react";
import { useAppDispatch, useAppSelector, useAppStore } from "@/lib/redux/hooks";
import {
  listError,
  listPending,
  listSuccess,
  makeSelectKgRowsForKey,
  removeFromLists,
  selectKgCountForKey,
  selectKgListErrorForKey,
  selectKgListStatusForKey,
  setRowMutation,
  type KgListStatus,
} from "@/lib/redux/slices/kgSuggestionsSlice";
import {
  acceptAssociationSuggestion,
  acceptValueSuggestion,
  deferKgSuggestion,
  listKgSuggestions,
  rejectKgSuggestion,
} from "@/features/kg-suggestions/service/kgSuggestionsService";
import {
  isHeavyHitter,
  kgFilterKey,
  type KgSuggestionRow,
  type KgSuggestionsFilter,
} from "@/features/kg-suggestions/types";

export interface UseKgSuggestionsResult {
  items: KgSuggestionRow[];
  count: number;
  status: KgListStatus;
  error: string | null;
  /**
   * Accept the suggestion. Branches on the row's `stage`: a value suggestion
   * writes the cell, a link suggestion tags the source. Heavy-hitter rows
   * throw (they require the create-scope dialog and are never accepted through
   * this path). On success the row is dropped from every list optimistically.
   */
  accept: (id: string) => Promise<void>;
  /** Reject; optionally attach a note the user can read later in the manager. */
  reject: (id: string, note?: string | null) => Promise<void>;
  /** Defer (snooze); optionally attach a note the user can read later. */
  defer: (id: string, note?: string | null) => Promise<void>;
  refresh: () => void;
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * @param options.autoFetch — when false, the hook does NOT fetch on mount.
 *   Used by chips that only want the count once the popover opens, or by
 *   surfaces that drive fetching themselves. Defaults to true.
 */
export function useKgSuggestions(
  filter: KgSuggestionsFilter,
  options: { autoFetch?: boolean } = {},
): UseKgSuggestionsResult {
  const { autoFetch = true } = options;
  const dispatch = useAppDispatch();
  const store = useAppStore();

  // React Compiler is on — no manual memoization. `key` is a primitive derived
  // from the filter; `refresh` recomputes from the filter ref when called.
  const key = kgFilterKey(filter);

  const selectRows = makeSelectKgRowsForKey();
  const items = useAppSelector((s) => selectRows(s, key));
  const count = useAppSelector((s) => selectKgCountForKey(s, key));
  const status = useAppSelector((s) => selectKgListStatusForKey(s, key));
  const error = useAppSelector((s) => selectKgListErrorForKey(s, key));

  const abortRef = useRef<AbortController | null>(null);

  // Hold the latest filter in a ref so `refresh` can read it without taking the
  // (always-fresh, object-literal) `filter` as a dependency — depending on it
  // would recreate `refresh` every render and spin into a refetch loop. The
  // stable `key` is the real identity of a filter.
  const filterRef = useRef(filter);
  filterRef.current = filter;

  const refresh = useCallback(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    dispatch(listPending({ key }));
    void listKgSuggestions(filterRef.current, { signal: controller.signal })
      .then((page) => {
        dispatch(listSuccess({ key, rows: page.rows, total: page.total }));
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        dispatch(listError({ key, error: errMessage(err) }));
      });
  }, [dispatch, key]);

  useEffect(() => {
    if (!autoFetch) return;
    // Cross-instance dedupe: many surfaces mount the SAME filter key at once.
    // Read FRESH status from the store so the second mounting instance sees the
    // first's `loading`/`success` and skips. `refresh()` still force-refetches.
    const entry = store.getState().kgSuggestions.lists[key];
    const liveStatus: KgListStatus = entry?.status ?? "idle";
    if (liveStatus === "loading" || liveStatus === "success") return;
    refresh();
    return () => abortRef.current?.abort();
  }, [autoFetch, refresh, key, store]);

  /** Resolve the live row from the normalized store by id. */
  const getRow = useCallback(
    (id: string): KgSuggestionRow | undefined =>
      store.getState().kgSuggestions.byId[id],
    [store],
  );

  const accept = useCallback(
    async (id: string): Promise<void> => {
      const row = getRow(id);
      if (!row) throw new Error("Suggestion is no longer available.");
      if (isHeavyHitter(row)) {
        throw new Error(
          "Heavy-hitter suggestions are accepted by creating a scope.",
        );
      }
      dispatch(setRowMutation({ id, mutation: "accepting" }));
      try {
        if (row.stage === "value") {
          await acceptValueSuggestion(row);
        } else {
          await acceptAssociationSuggestion(row);
        }
        dispatch(removeFromLists({ id }));
      } catch (err) {
        dispatch(setRowMutation({ id, mutation: "idle" }));
        throw err;
      }
    },
    [dispatch, getRow],
  );

  const reject = useCallback(
    async (id: string, note?: string | null): Promise<void> => {
      const row = getRow(id);
      if (!row) throw new Error("Suggestion is no longer available.");
      dispatch(setRowMutation({ id, mutation: "rejecting" }));
      try {
        await rejectKgSuggestion(row, note);
        dispatch(removeFromLists({ id }));
      } catch (err) {
        dispatch(setRowMutation({ id, mutation: "idle" }));
        throw err;
      }
    },
    [dispatch, getRow],
  );

  const defer = useCallback(
    async (id: string, note?: string | null): Promise<void> => {
      const row = getRow(id);
      if (!row) throw new Error("Suggestion is no longer available.");
      dispatch(setRowMutation({ id, mutation: "deferring" }));
      try {
        await deferKgSuggestion(row, note);
        dispatch(removeFromLists({ id }));
      } catch (err) {
        dispatch(setRowMutation({ id, mutation: "idle" }));
        throw err;
      }
    },
    [dispatch, getRow],
  );

  return { items, count, status, error, accept, reject, defer, refresh };
}
