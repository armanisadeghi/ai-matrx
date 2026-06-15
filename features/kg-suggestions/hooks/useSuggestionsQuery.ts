// features/kg-suggestions/hooks/useSuggestionsQuery.ts
//
// Data layer for the dedicated suggestions MANAGER (the full-route table). This
// is a DIFFERENT read path from `useKgSuggestions`: the manager is a free-form,
// multi-dimension table with SERVER-SIDE filter / sort / pagination, so it reads
// the enriched `v_scope_suggestions` view directly (not the slice cache) and
// owns its own query state.
//
// It still reuses the shared decision plumbing: accept branches on `stage`
// exactly like the hook, and busy state is mirrored through the kgSuggestions
// slice's mutation map so the shared `KgSuggestionRowItem` spinner works here
// too. After any mutation we refresh the page + stats and keep the prior rows
// on screen (no skeleton flash).

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import {
  removeFromLists,
  setRowMutation,
} from "@/lib/redux/slices/kgSuggestionsSlice";
import {
  acceptAssociationSuggestion,
  acceptValueSuggestion,
  deferKgSuggestion,
  fetchScopeSuggestionStats,
  markKgSuggestionsViewed,
  queryScopeSuggestions,
  rejectKgSuggestion,
  restoreKgSuggestion,
  setKgSuggestionStarred,
  type KgSuggestionStat,
} from "@/features/kg-suggestions/service/kgSuggestionsService";
import {
  resolveSourceTitles,
  sourceRefKey,
} from "@/features/kg-suggestions/service/sourcePreviewService";
import { LOW_CONFIDENCE_THRESHOLD } from "@/features/kg-suggestions/constants";
import {
  isHeavyHitter,
  type KgEnrichedSuggestionRow,
  type KgSuggestionsQuery,
} from "@/features/kg-suggestions/types";

export const DEFAULT_SUGGESTIONS_QUERY: KgSuggestionsQuery = {
  statuses: ["pending"],
  stage: "all",
  // Rank by confidence by default — the strongest proposals float to the top of
  // each section (the user re-sorts via the column headers).
  sortBy: "confidence",
  sortDir: "desc",
  page: 0,
  pageSize: 50,
};

export interface UseSuggestionsQueryResult {
  query: KgSuggestionsQuery;
  /** Replace the whole query (e.g. a saved-view reset). */
  setQuery: (q: KgSuggestionsQuery) => void;
  /** Merge a patch; resets to page 0 unless the patch itself sets `page`. */
  patchQuery: (patch: Partial<KgSuggestionsQuery>) => void;
  /** Main-table rows (heavy hitters excluded — they live in `heavyHitters`). */
  rows: KgEnrichedSuggestionRow[];
  /** Heavy-hitter rows (recurring entity → new scope), confidence-ranked. */
  heavyHitters: KgEnrichedSuggestionRow[];
  /**
   * Low-quality rows (confidence < 50%). Pulled OUT of the main table into a
   * de-emphasized section so the user can review/dismiss them without them
   * crowding the strong suggestions. Empty when the user filters by confidence.
   */
  lowQuality: KgEnrichedSuggestionRow[];
  /** Total low-quality matches (the list itself is capped). */
  lowQualityTotal: number;
  /**
   * Resolved human SOURCE titles (filenames, note labels, …) keyed by
   * `sourceRefKey(source_kind, source_id)`. Batch-resolved per loaded page so
   * the table can show the file a suggestion came from without per-row reads.
   */
  sourceTitles: Map<string, string>;
  total: number;
  stats: KgSuggestionStat[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
  accept: (id: string) => Promise<void>;
  reject: (id: string, note?: string | null) => Promise<void>;
  defer: (id: string, note?: string | null) => Promise<void>;
  star: (id: string, starred: boolean) => Promise<void>;
  restore: (id: string) => Promise<void>;
}

/** Heavy hitters get their own section unless the user filters down to values. */
function shouldShowHeavyHitters(q: KgSuggestionsQuery): boolean {
  return (q.stage ?? "all") !== "value" && !q.matchKind;
}

function errMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function useSuggestionsQuery(
  initial: KgSuggestionsQuery = DEFAULT_SUGGESTIONS_QUERY,
): UseSuggestionsQueryResult {
  const dispatch = useAppDispatch();

  const [query, setQuery] = useState<KgSuggestionsQuery>(initial);
  const [rows, setRows] = useState<KgEnrichedSuggestionRow[]>([]);
  const [heavyHitters, setHeavyHitters] = useState<KgEnrichedSuggestionRow[]>(
    [],
  );
  const [lowQuality, setLowQuality] = useState<KgEnrichedSuggestionRow[]>([]);
  const [lowQualityTotal, setLowQualityTotal] = useState(0);
  const [total, setTotal] = useState(0);
  const [sourceTitles, setSourceTitles] = useState<Map<string, string>>(
    new Map(),
  );
  const [stats, setStats] = useState<KgSuggestionStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const heavyAbortRef = useRef<AbortController | null>(null);
  const lowAbortRef = useRef<AbortController | null>(null);
  const rowsRef = useRef<KgEnrichedSuggestionRow[]>([]);
  rowsRef.current = rows;
  const heavyRef = useRef<KgEnrichedSuggestionRow[]>([]);
  heavyRef.current = heavyHitters;
  const lowRef = useRef<KgEnrichedSuggestionRow[]>([]);
  lowRef.current = lowQuality;

  const showHeavy = shouldShowHeavyHitters(query);
  // Split off low-quality (<50%) rows into their own bucket UNLESS the user is
  // explicitly filtering by confidence (then we respect their threshold as-is).
  const splitLow = query.minConfidence == null;
  // Effective floor applied to the "strong" lists (main table + heavy hitters).
  const strongFloor = splitLow ? LOW_CONFIDENCE_THRESHOLD : null;

  const patchQuery = useCallback((patch: Partial<KgSuggestionsQuery>) => {
    setQuery((prev) => ({
      ...prev,
      ...patch,
      // Any filter/sort change returns to the first page unless caller paginates.
      page: patch.page != null ? patch.page : 0,
    }));
  }, []);

  // Stamp "seen" for freshly-loaded, still-unseen rows (best-effort).
  const stampViewed = useCallback((loaded: KgEnrichedSuggestionRow[]) => {
    const unseen = loaded.filter((r) => !r.viewed_at);
    if (!unseen.length) return;
    void markKgSuggestionsViewed(
      unseen.map((r) => ({ id: r.id, stage: r.stage, viewed_at: r.viewed_at })),
    );
  }, []);

  // ── Main table fetch (heavy hitters excluded) ────────────────────────────
  useEffect(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    void queryScopeSuggestions(
      strongFloor != null ? { ...query, minConfidence: strongFloor } : query,
      {
        signal: controller.signal,
        excludeHeavyHitter: showHeavy,
      },
    )
      .then((res) => {
        if (controller.signal.aborted) return;
        setRows(res.rows);
        setTotal(res.total);
        setLoading(false);
        stampViewed(res.rows);
      })
      .catch((e: unknown) => {
        if (controller.signal.aborted) return;
        setError(errMessage(e));
        setLoading(false);
      });
    return () => controller.abort();
  }, [query, showHeavy, strongFloor]);

  // ── Heavy-hitter fetch (own section, confidence-ranked, no pagination) ────
  useEffect(() => {
    heavyAbortRef.current?.abort();
    if (!showHeavy) {
      setHeavyHitters([]);
      return;
    }
    const controller = new AbortController();
    heavyAbortRef.current = controller;
    const heavyQuery: KgSuggestionsQuery = {
      ...query,
      stage: "association",
      matchKind: "heavy_hitter",
      // Only STRONG heavy hitters lead the page; weak ones drop to low-quality.
      minConfidence: strongFloor ?? query.minConfidence ?? null,
      sortBy: "confidence",
      sortDir: "desc",
      page: 0,
      pageSize: 100,
    };
    void queryScopeSuggestions(heavyQuery, { signal: controller.signal })
      .then((res) => {
        if (controller.signal.aborted) return;
        setHeavyHitters(res.rows);
        stampViewed(res.rows);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setHeavyHitters([]);
      });
    return () => controller.abort();
  }, [query, showHeavy, strongFloor]);

  // ── Low-quality fetch (<50%, de-emphasized section, capped, no pagination) ─
  // Includes weak heavy hitters too, so nothing is silently lost. Skipped when
  // the user is explicitly filtering by confidence (then there's no "low" tier).
  useEffect(() => {
    lowAbortRef.current?.abort();
    if (!splitLow) {
      setLowQuality([]);
      setLowQualityTotal(0);
      return;
    }
    const controller = new AbortController();
    lowAbortRef.current = controller;
    const lowQuery: KgSuggestionsQuery = {
      ...query,
      minConfidence: null,
      maxConfidence: LOW_CONFIDENCE_THRESHOLD,
      sortBy: "confidence",
      sortDir: "desc",
      page: 0,
      pageSize: 100,
    };
    void queryScopeSuggestions(lowQuery, { signal: controller.signal })
      .then((res) => {
        if (controller.signal.aborted) return;
        setLowQuality(res.rows);
        setLowQualityTotal(res.total);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setLowQuality([]);
        setLowQualityTotal(0);
      });
    return () => controller.abort();
  }, [query, splitLow]);

  // ── Batch-resolve SOURCE titles for the visible rows ─────────────────────
  // One query per kind across both lists; merge results so previously-resolved
  // titles persist across pages (the map only ever grows).
  useEffect(() => {
    const all = [...rows, ...heavyHitters, ...lowQuality];
    if (!all.length) return;
    const missing = all.filter(
      (r) =>
        r.source_id &&
        !sourceTitles.has(sourceRefKey(r.source_kind, r.source_id)),
    );
    if (!missing.length) return;
    let active = true;
    void resolveSourceTitles(
      missing.map((r) => ({ kind: r.source_kind, id: r.source_id })),
    ).then((resolved) => {
      if (!active || resolved.size === 0) return;
      setSourceTitles((prev) => {
        const next = new Map(prev);
        for (const [k, v] of resolved) next.set(k, v);
        return next;
      });
    });
    return () => {
      active = false;
    };
  }, [rows, heavyHitters, lowQuality, sourceTitles]);

  const loadStats = useCallback(() => {
    void fetchScopeSuggestionStats()
      .then(setStats)
      .catch(() => {
        /* stats are a nicety — never surface an error for them */
      });
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const refresh = useCallback(() => {
    // Re-trigger the fetch effect by cloning the query object identity.
    setQuery((q) => ({ ...q }));
    loadStats();
  }, [loadStats]);

  const getRow = useCallback(
    (id: string): KgEnrichedSuggestionRow | undefined =>
      rowsRef.current.find((r) => r.id === id) ??
      heavyRef.current.find((r) => r.id === id) ??
      lowRef.current.find((r) => r.id === id),
    [],
  );

  // Drop a decided row from whichever list holds it; only the main table tracks
  // a paginated `total`, so decrement that only when the row was a main row.
  const dropRow = useCallback((id: string) => {
    const wasMain = rowsRef.current.some((r) => r.id === id);
    const wasLow = lowRef.current.some((r) => r.id === id);
    setRows((prev) => prev.filter((r) => r.id !== id));
    setHeavyHitters((prev) => prev.filter((r) => r.id !== id));
    setLowQuality((prev) => prev.filter((r) => r.id !== id));
    if (wasMain) setTotal((t) => Math.max(0, t - 1));
    if (wasLow) setLowQualityTotal((t) => Math.max(0, t - 1));
  }, []);

  // ── Decisions ────────────────────────────────────────────────────────────
  // Optimistically drop the row, mirror busy state through the slice, then
  // reconcile counts via refresh().

  const runDecision = useCallback(
    async (
      id: string,
      mutation: "accepting" | "rejecting" | "deferring",
      fn: (row: KgEnrichedSuggestionRow) => Promise<void>,
    ) => {
      const row = getRow(id);
      if (!row) throw new Error("Suggestion is no longer available.");
      dispatch(setRowMutation({ id, mutation }));
      try {
        await fn(row);
        dropRow(id);
        dispatch(removeFromLists({ id }));
        loadStats();
      } catch (e) {
        dispatch(setRowMutation({ id, mutation: "idle" }));
        throw e;
      }
    },
    [dispatch, dropRow, getRow, loadStats],
  );

  const accept = useCallback(
    (id: string) =>
      runDecision(id, "accepting", async (row) => {
        if (isHeavyHitter(row)) {
          throw new Error(
            "Heavy-hitter suggestions are accepted by creating a scope.",
          );
        }
        if (row.stage === "value") await acceptValueSuggestion(row);
        else await acceptAssociationSuggestion(row);
      }),
    [runDecision],
  );

  const reject = useCallback(
    (id: string, note?: string | null) =>
      runDecision(id, "rejecting", (row) => rejectKgSuggestion(row, note)),
    [runDecision],
  );

  const defer = useCallback(
    (id: string, note?: string | null) =>
      runDecision(id, "deferring", (row) => deferKgSuggestion(row, note)),
    [runDecision],
  );

  const star = useCallback(
    async (id: string, starred: boolean) => {
      const row = getRow(id);
      if (!row) return;
      // Optimistic flip across whichever list holds the row; revert on failure.
      const flip = (val: boolean) => {
        const apply = (r: KgEnrichedSuggestionRow) =>
          r.id === id ? { ...r, is_starred: val } : r;
        setRows((prev) => prev.map(apply));
        setHeavyHitters((prev) => prev.map(apply));
        setLowQuality((prev) => prev.map(apply));
      };
      flip(starred);
      try {
        await setKgSuggestionStarred(row, starred);
        loadStats();
      } catch (e) {
        flip(!starred);
        throw e;
      }
    },
    [getRow, loadStats],
  );

  const restore = useCallback(
    async (id: string) => {
      const row = getRow(id);
      if (!row) return;
      await restoreKgSuggestion(row);
      // Restored rows leave any non-pending filter; drop + reconcile.
      dropRow(id);
      dispatch(removeFromLists({ id }));
      loadStats();
    },
    [dispatch, dropRow, getRow, loadStats],
  );

  return {
    query,
    setQuery,
    patchQuery,
    rows,
    heavyHitters,
    lowQuality,
    lowQualityTotal,
    sourceTitles,
    total,
    stats,
    loading,
    error,
    refresh,
    accept,
    reject,
    defer,
    star,
    restore,
  };
}
