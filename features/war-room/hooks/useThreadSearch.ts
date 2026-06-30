"use client";

// features/war-room/hooks/useThreadSearch.ts
//
// Feature ba9f72e4 — filter a room's threads by title, ranked by relevance.
// Thread title = tile.title, falling back to the anchored task title when the
// tile is still untitled — the same label shown in rails and cards.
//
// The searchable-text projection is ONE memoized selector reading the war-room
// assignment buckets + the notes/tasks slices (cross-slice, so it lives here as
// a hook selector rather than in the war-room selectors file). It returns a
// stable shape per render; the actual scoring runs in a useMemo keyed on the
// projection + query.

import { useMemo } from "react";
import { createSelector } from "@reduxjs/toolkit";
import { useAppSelector } from "@/lib/redux/hooks";
import type { RootState } from "@/lib/redux/store";
import { filterAndSortBySearch } from "@/utils/search-scoring";
import { containerKey } from "@/features/war-room/types";
import { threadDisplayTitle } from "@/features/war-room/utils/threadDisplayTitle";

interface ThreadSearchRow {
  id: string;
  /** Thread title (tile title, else anchored task title). */
  threadTitle: string;
}

/** Active entity_id of `entityType` in a thread bucket (active row, else first). */
function activeEntityIdOf(
  rows: { entity_type: string; entity_id: string; is_active: boolean | null }[],
  entityType: string,
): string | null {
  const active = rows.find(
    (r) => r.entity_type === entityType && r.is_active === true,
  );
  if (active) return active.entity_id;
  return rows.find((r) => r.entity_type === entityType)?.entity_id ?? null;
}

/**
 * One memoized selector per sessionId building the searchable rows for every
 * tile in the room (cached so React 19 gets a stable instance per key).
 */
const rowsCache = new Map<string, (s: RootState) => ThreadSearchRow[]>();
function selectThreadSearchRows(sessionId: string) {
  let sel = rowsCache.get(sessionId);
  if (!sel) {
    sel = createSelector(
      [
        (s: RootState) => s.warRoom.threadIdsByRoom[sessionId],
        (s: RootState) => s.warRoom.threadsById,
        (s: RootState) => s.warRoom.assignmentsByContainer,
        (s: RootState) => s.tasks.entities,
      ],
      (ids, threadsById, byContainer, taskEntities): ThreadSearchRow[] => {
        if (!ids || ids.length === 0) return EMPTY_ROWS;
        return ids.map((id): ThreadSearchRow => {
          const tile = threadsById[id];
          const bucket = byContainer[containerKey("thread", id)] ?? [];
          const taskId = activeEntityIdOf(bucket, "task");
          const taskTitle = taskId ? taskEntities[taskId]?.title : undefined;
          return {
            id,
            threadTitle: threadDisplayTitle(tile, taskTitle),
          };
        });
      },
    );
    rowsCache.set(sessionId, sel);
  }
  return sel;
}

const EMPTY_ROWS: ThreadSearchRow[] = [];

/**
 * Returns the subset of `visibleIds` matching `query`, ranked by thread title.
 * When `query` is blank, returns `visibleIds` unchanged (identity preserved).
 */
export function useThreadSearch(
  sessionId: string,
  visibleIds: string[],
  query: string,
): string[] {
  const rows = useAppSelector(selectThreadSearchRows(sessionId));
  const trimmed = query.trim();

  return useMemo(() => {
    if (!trimmed) return visibleIds;
    const visibleSet = new Set(visibleIds);
    const candidates = rows.filter((r) => visibleSet.has(r.id));
    const ranked = filterAndSortBySearch(candidates, trimmed, [
      { get: (r) => r.threadTitle, weight: "title" },
    ]);
    return ranked.map((r) => r.id);
  }, [rows, visibleIds, trimmed]);
}
