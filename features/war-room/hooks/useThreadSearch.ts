"use client";

// features/war-room/hooks/useThreadSearch.ts
//
// Feature ba9f72e4 — filter a room's threads by a free-text query, ranked
// NAME → DESCRIPTION → CONTENTS, in place. Built on the canonical relevance
// scorer (`filterAndSortBySearch`, utils/search-scoring) so the ranking rules
// (title beats body; exact > prefix > includes) match every other search box in
// the app — not a bespoke `includes()`.
//
// A thread (tile) has no description column of its own; the user-authored
// description lives on the thread's active note (set by QuickAddThread). So the
// fields map to:
//   • NAME        — the tile title
//   • DESCRIPTION — the active note's content
//   • CONTENTS    — the anchored task's title (the other "what's in this thread")
//
// Empty query ⇒ the input list is returned UNCHANGED (same order, same refs), so
// the rail/gallery render exactly as before when no one is searching.
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

interface ThreadSearchRow {
  id: string;
  /** Thread name (tile title). */
  name: string;
  /** Active-note content — the thread's description. */
  description: string;
  /** Anchored task title — the thread's contents. */
  taskTitle: string;
}

/** Active entity_id of `entityType` in a thread bucket (active row, else first). */
function activeEntityIdOf(
  rows: { entity_type: string; entity_id: string; is_active: boolean }[],
  entityType: string,
): string | null {
  const active = rows.find((r) => r.entity_type === entityType && r.is_active);
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
        (s: RootState) => s.warRoom.tileIdsBySession[sessionId],
        (s: RootState) => s.warRoom.tilesById,
        (s: RootState) => s.warRoom.assignmentsByContainer,
        (s: RootState) => s.notes.notes,
        // The agent-context tasks slice is an RTK entity adapter; `.entities`
        // is its stable public id→record map.
        (s: RootState) => s.tasks.entities,
      ],
      (ids, tilesById, byContainer, notes, taskEntities): ThreadSearchRow[] => {
        if (!ids || ids.length === 0) return EMPTY_ROWS;
        return ids.map((id): ThreadSearchRow => {
          const tile = tilesById[id];
          const bucket = byContainer[containerKey("thread", id)] ?? [];
          const noteId = activeEntityIdOf(bucket, "note");
          const taskId = activeEntityIdOf(bucket, "task");
          return {
            id,
            name: tile?.title?.trim() ?? "",
            description: (noteId ? notes[noteId]?.content : "") ?? "",
            taskTitle: (taskId ? taskEntities[taskId]?.title : "") ?? "",
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
 * Returns the subset of `visibleIds` matching `query`, ranked by relevance
 * (NAME → DESCRIPTION → CONTENTS). When `query` is blank, returns `visibleIds`
 * unchanged (identity preserved).
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
      { get: (r) => r.name, weight: "title" },
      { get: (r) => r.description, weight: "body" },
      { get: (r) => r.taskTitle, weight: "body" },
    ]);
    return ranked.map((r) => r.id);
  }, [rows, visibleIds, trimmed]);
}
