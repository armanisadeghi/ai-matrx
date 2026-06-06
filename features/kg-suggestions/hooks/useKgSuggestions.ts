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
// kgFilterKey); writes route through kgSuggestionsService → aidream. Accept /
// reject / defer optimistically drop the row from EVERY list that held it, so
// a chip count and the drawer both update in one tick; on error we refresh to
// re-sync. Nothing here blocks — accept is the only write that surfaces a
// value, and even that is a toast, never a modal.

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
  upsertRow,
  type KgListStatus,
} from "@/lib/redux/slices/kgSuggestionsSlice";
import {
  acceptKgSuggestion,
  deferKgSuggestion,
  listKgSuggestions,
  rejectKgSuggestion,
} from "@/features/kg-suggestions/service/kgSuggestionsService";
import {
  kgFilterKey,
  kgFilterToParams,
  type KgAcceptResult,
  type KgDecisionResponse,
  type KgSuggestionRow,
  type KgSuggestionsFilter,
} from "@/features/kg-suggestions/types";

export interface UseKgSuggestionsResult {
  items: KgSuggestionRow[];
  count: number;
  status: KgListStatus;
  error: string | null;
  /**
   * Accept the suggestion. Returns the discriminated `KgAcceptResult` so the
   * caller can branch: a slot-fill accept is fully done here (the row is
   * dropped optimistically); a heavy-hitter accept returns the scope-creation
   * plan the caller must still consume (create scope + tag sources). In BOTH
   * cases the suggestion is already `accepted` server-side, so the row is
   * removed from every list regardless.
   */
  accept: (id: string) => Promise<KgAcceptResult>;
  reject: (id: string) => Promise<KgDecisionResponse>;
  defer: (id: string) => Promise<KgDecisionResponse>;
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
  // from the filter; `refresh` recomputes params from the filter when called.
  const key = kgFilterKey(filter);

  const selectRows = makeSelectKgRowsForKey();
  const items = useAppSelector((s) => selectRows(s, key));
  const count = useAppSelector((s) => selectKgCountForKey(s, key));
  const status = useAppSelector((s) => selectKgListStatusForKey(s, key));
  const error = useAppSelector((s) => selectKgListErrorForKey(s, key));

  const abortRef = useRef<AbortController | null>(null);

  // Hold the latest filter in a ref so `refresh` can read it without taking the
  // (always-fresh, object-literal) `filter` as a dependency. Consumers pass an
  // inline object every render; depending on it would recreate `refresh` every
  // render, re-run the fetch effect every render, and — because listSuccess
  // mutates the slice this component subscribes to — spin into an infinite
  // refetch loop. The stable `key` is the real identity of a filter.
  const filterRef = useRef(filter);
  filterRef.current = filter;

  const refresh = useCallback(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    dispatch(listPending({ key }));
    void listKgSuggestions(kgFilterToParams(filterRef.current), {
      signal: controller.signal,
    })
      .then((page) => {
        dispatch(
          listSuccess({ key, rows: page.suggestions, total: page.total }),
        );
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        dispatch(listError({ key, error: errMessage(err) }));
      });
  }, [dispatch, key]);

  useEffect(() => {
    if (!autoFetch) return;
    // Cross-instance dedupe: many surfaces mount the SAME filter key at once
    // (e.g. the global notifier + a nav button + a page hook all want
    // `global:pending`). Each would otherwise fire its own identical request.
    // Read FRESH status from the store at effect time (not the render-time
    // `status` value) so the second mounting instance sees the first's
    // `loading` and skips. Only the first idle/errored instance fetches; the
    // rest read the shared cache. `refresh()` still force-refetches on demand.
    const entry = store.getState().kgSuggestions.lists[key];
    const liveStatus: KgListStatus = entry?.status ?? "idle";
    if (liveStatus === "loading" || liveStatus === "success") return;
    refresh();
    return () => abortRef.current?.abort();
  }, [autoFetch, refresh, key, store]);

  const accept = useCallback(
    async (id: string): Promise<KgAcceptResult> => {
      dispatch(setRowMutation({ id, mutation: "accepting" }));
      try {
        const res = await acceptKgSuggestion(id);
        // Both branches carry `.suggestion` (now status=accepted). Drop the
        // row from every cached list — the server already flipped it, so a
        // heavy-hitter row that later fails scope creation is still correctly
        // gone (the suggestion IS accepted; the recoverable error tells the
        // user to finish creating the scope manually).
        dispatch(upsertRow(res.suggestion));
        dispatch(removeFromLists({ id }));
        return res;
      } catch (err) {
        dispatch(setRowMutation({ id, mutation: "idle" }));
        throw err;
      }
    },
    [dispatch],
  );

  const reject = useCallback(
    async (id: string): Promise<KgDecisionResponse> => {
      dispatch(setRowMutation({ id, mutation: "rejecting" }));
      try {
        const res = await rejectKgSuggestion(id);
        dispatch(upsertRow(res.suggestion));
        dispatch(removeFromLists({ id }));
        return res;
      } catch (err) {
        dispatch(setRowMutation({ id, mutation: "idle" }));
        throw err;
      }
    },
    [dispatch],
  );

  const defer = useCallback(
    async (id: string): Promise<KgDecisionResponse> => {
      dispatch(setRowMutation({ id, mutation: "deferring" }));
      try {
        const res = await deferKgSuggestion(id);
        dispatch(upsertRow(res.suggestion));
        dispatch(removeFromLists({ id }));
        return res;
      } catch (err) {
        dispatch(setRowMutation({ id, mutation: "idle" }));
        throw err;
      }
    },
    [dispatch],
  );

  return { items, count, status, error, accept, reject, defer, refresh };
}
