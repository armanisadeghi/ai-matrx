"use client";

// lib/entity-list/useEntityListSelection.ts
//
// BULK SELECTION — the state half.
//
// WHERE THIS STATE LIVES, AND WHY IT IS NOT IN REDUX. The primitive already
// splits its state two ways (see ./types.ts): STYLE persists per user in
// `userPreferences` and QUERY lives in `useEntityList`'s own local state,
// deliberately never persisted. A selection is the third kind: it belongs to
// this mount of this page, it is meaningless a day later, and restoring one
// would arm a bulk action against rows a person no longer has in mind. So it
// lives exactly where the query lives — local to the list shell, one hook
// called beside `useEntityList` — and adds no slice, no selector and no global
// store. Nothing outside the list can read it, which is the point.
//
// WHAT IT SURVIVES. Sort, search, filter, facet, scope and page changes: the
// ids stay ticked, because a selection is the user's and not the page's. It is
// cleared only deliberately — the bar's Clear, Escape, or an action finishing.
// The one thing that changes on its own is the MEANING of "all" (see
// `bulkSelectionMode` in ./selection.ts), never the membership.

import { useRef, useState } from "react";
import type { EntityListService } from "./config";
import {
  BULK_RESOLVE_PAGE_SIZE,
  bulkFilterFromQuery,
  bulkFilterKey,
  bulkSelectionMode,
  type EntityBulkMode,
  type EntityBulkSelection,
} from "./selection";
import type { EntityListQuery, EntityListSort } from "./types";

export interface UseEntityListSelectionArgs<TRow> {
  /** False for every surface that declares no `bulkActions` — the opt-out. */
  enabled: boolean;
  rows: TRow[];
  /** The server's true total for the current query. */
  total: number;
  query: EntityListQuery;
  sort: EntityListSort;
  service: EntityListService<TRow>;
  getRowId: (row: TRow) => string;
  isRowSelectable?: (row: TRow) => boolean;
  /** Whether "select all M matching this filter" may be offered at all. */
  selectAllMatching: boolean;
}

/** Progress of a running "select all matching" resolution. */
export interface EntityBulkResolveProgress {
  done: number;
  total: number;
}

export interface EntityListSelection<TRow> {
  enabled: boolean;
  /** Every ticked id, in tick order. */
  ids: string[];
  count: number;
  mode: EntityBulkMode;
  isSelected: (id: string) => boolean;
  /** The table's controlled contract — it hands back the whole next set. */
  setIds: (ids: string[]) => void;
  clear: () => void;
  toggleId: (id: string) => void;
  /** cmd/ctrl-A: every selectable row currently on screen. */
  selectLoaded: () => void;
  /**
   * The page checkbox's verb — tick every selectable row on screen, or untick
   * them when they are already all ticked. The SAME function behind the table's
   * header checkbox and the card list's select-all, so the two can never mean
   * different things at two widths.
   */
  toggleLoaded: () => void;
  /** Every selectable loaded row is ticked (the header checkbox's "all"). */
  allLoadedSelected: boolean;
  /** How many rows on screen may be ticked at all. */
  loadedSelectableCount: number;
  /** How many of THOSE are ticked — the indeterminate state's numerator. */
  selectedLoadedCount: number;
  /** How many rows the query matches in total, loaded or not. */
  matchingTotal: number;
  /** The banner may offer the escalation: declared, complete page, more rows. */
  canOfferSelectAllMatching: boolean;
  resolving: EntityBulkResolveProgress | null;
  /** The reason a resolution stopped early, for the banner to print. */
  resolveError: string | null;
  runSelectAllMatching: () => void;
  cancelSelectAllMatching: () => void;
  /** Build what a bulk handler receives. */
  build: () => EntityBulkSelection<TRow>;
}

export function useEntityListSelection<TRow>({
  enabled,
  rows,
  total,
  query,
  sort,
  service,
  getRowId,
  isRowSelectable,
  selectAllMatching,
}: UseEntityListSelectionArgs<TRow>): EntityListSelection<TRow> {
  const [ids, setIdsState] = useState<string[]>([]);
  // The rows a completed resolution fetched, plus the filter it was taken
  // against. Both halves are needed: the key decides whether "everything
  // matching" is still a true sentence, and the rows are what a per-row bulk
  // handler acts on without re-fetching them.
  const [matched, setMatched] = useState<{
    key: string;
    rows: TRow[];
  } | null>(null);
  const [resolving, setResolving] = useState<EntityBulkResolveProgress | null>(
    null,
  );
  const [resolveError, setResolveError] = useState<string | null>(null);
  // Bumped to abandon an in-flight resolution. A resolution is many sequential
  // requests, so Cancel has to be able to interrupt it between them.
  const resolveGeneration = useRef(0);

  const liveKey = bulkFilterKey(bulkFilterFromQuery(query));
  const mode = bulkSelectionMode(matched?.key ?? null, liveKey);
  const selectedSet = new Set(ids);

  const selectableLoaded = rows.filter(
    (row) => isRowSelectable?.(row) ?? true,
  );
  const allLoadedSelected =
    selectableLoaded.length > 0 &&
    selectableLoaded.every((row) => selectedSet.has(getRowId(row)));

  const setIds = (next: string[]) => {
    setIdsState(next);
    // Any hand edit of the set ends the "everything matching" claim: a person
    // who unticks one row out of 4,613 no longer has everything, and the
    // banner must stop saying so rather than be off by one.
    if (next.length !== ids.length) setMatched(null);
    if (next.length === 0) setResolveError(null);
  };

  const clear = () => {
    resolveGeneration.current += 1;
    setResolving(null);
    setResolveError(null);
    setMatched(null);
    setIdsState([]);
  };

  const toggleId = (id: string) => {
    setIds(
      selectedSet.has(id) ? ids.filter((v) => v !== id) : [...ids, id],
    );
  };

  const selectLoaded = () => {
    const loadedIds = selectableLoaded.map(getRowId);
    const merged = [...ids];
    for (const id of loadedIds) if (!selectedSet.has(id)) merged.push(id);
    setIdsState(merged);
    setMatched(null);
  };

  const toggleLoaded = () => {
    if (!allLoadedSelected) {
      selectLoaded();
      return;
    }
    // Untick THIS PAGE only — ids ticked on other pages are the user's and
    // survive, exactly as the table's own header checkbox behaves.
    const loadedIds = new Set(selectableLoaded.map(getRowId));
    setIdsState(ids.filter((id) => !loadedIds.has(id)));
    setMatched(null);
  };

  const canOfferSelectAllMatching =
    enabled &&
    selectAllMatching &&
    mode === "ids" &&
    allLoadedSelected &&
    total > ids.length;

  const cancelSelectAllMatching = () => {
    resolveGeneration.current += 1;
    setResolving(null);
  };

  /**
   * Resolve "everything matching" into real ids by paging the surface's OWN
   * service — the same RPC the list is already reading, with the same scope,
   * search, filters and archive axis, and no page.
   *
   * 🚨 IT IS A REAL COST AND IT SAYS SO. The banner shows the running count and
   * a Cancel while this loop runs, because on a large corpus it is several
   * seconds of requests, and a silent freeze is the fourth law's failure. There
   * is no invented ceiling: it stops at the server's own total, which is the
   * number the banner offered.
   */
  const runSelectAllMatching = () => {
    if (!canOfferSelectAllMatching) return;
    const generation = (resolveGeneration.current += 1);
    const key = liveKey;
    setResolveError(null);
    setResolving({ done: 0, total });

    void (async () => {
      const collected: TRow[] = [];
      let page = 1;
      try {
        for (;;) {
          const answer = await service.fetchPage(
            { ...query, page },
            { ...sort, pageSize: BULK_RESOLVE_PAGE_SIZE },
          );
          if (resolveGeneration.current !== generation) return;
          collected.push(...answer.rows);
          setResolving({ done: collected.length, total: answer.total });
          // A page that comes back short (or empty) is the end of the corpus,
          // whatever the total claimed — otherwise a total that disagrees with
          // the rows would loop forever.
          if (
            answer.rows.length === 0 ||
            answer.rows.length < BULK_RESOLVE_PAGE_SIZE ||
            collected.length >= answer.total
          ) {
            break;
          }
          page += 1;
        }
      } catch (error) {
        if (resolveGeneration.current !== generation) return;
        setResolving(null);
        setResolveError(
          error instanceof Error
            ? error.message
            : "The rest of the matching rows could not be read.",
        );
        return;
      }
      if (resolveGeneration.current !== generation) return;
      const selectable = collected.filter(
        (row) => isRowSelectable?.(row) ?? true,
      );
      setResolving(null);
      setMatched({ key, rows: selectable });
      setIdsState(selectable.map(getRowId));
    })();
  };

  const build = (): EntityBulkSelection<TRow> => {
    const set = new Set(ids);
    const pool =
      mode === "matching" && matched ? matched.rows : rows;
    return {
      mode,
      ids,
      rows: pool.filter((row) => set.has(getRowId(row))),
      count: ids.length,
      filter: bulkFilterFromQuery(query),
    };
  };

  return {
    enabled,
    ids,
    count: ids.length,
    mode,
    isSelected: (id: string) => selectedSet.has(id),
    setIds,
    clear,
    toggleId,
    selectLoaded,
    toggleLoaded,
    allLoadedSelected,
    loadedSelectableCount: selectableLoaded.length,
    selectedLoadedCount: selectableLoaded.filter((row) =>
      selectedSet.has(getRowId(row)),
    ).length,
    matchingTotal: total,
    canOfferSelectAllMatching,
    resolving,
    resolveError,
    runSelectAllMatching,
    cancelSelectAllMatching,
    build,
  };
}
