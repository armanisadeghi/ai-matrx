"use client";

// features/war-room/hooks/useWarRoomAllSearch.ts
//
// Cross-room search for /war-room/all. Ranking is deliberate and two-tier:
//   1. War Room titles (session.title)
//   2. Thread titles (tile.title, with anchored task title as fallback)
//
// Room hits and thread hits are returned separately so the UI can render
// rooms first, then threads — each thread row carries its parent room so you
// always know where it lives (critical for avoiding duplicate threads).

import { useMemo } from "react";
import { createSelector } from "@reduxjs/toolkit";
import { useAppSelector } from "@/lib/redux/hooks";
import type { RootState } from "@/lib/redux/store";
import { filterAndSortBySearch } from "@/utils/search-scoring";
import { containerKey } from "@/features/war-room/types";
import { threadDisplayTitle } from "@/features/war-room/utils/threadDisplayTitle";

export interface WarRoomSearchRoomHit {
  sessionId: string;
  title: string;
  description: string | null;
}

export interface WarRoomSearchThreadHit {
  tileId: string;
  sessionId: string;
  threadTitle: string;
  roomTitle: string;
}

interface RoomSearchRow {
  sessionId: string;
  title: string;
  description: string;
}

interface ThreadSearchRow {
  tileId: string;
  sessionId: string;
  threadTitle: string;
  roomTitle: string;
}

function activeEntityIdOf(
  rows: { entity_type: string; entity_id: string; is_active: boolean }[],
  entityType: string,
): string | null {
  const active = rows.find((r) => r.entity_type === entityType && r.is_active);
  if (active) return active.entity_id;
  return rows.find((r) => r.entity_type === entityType)?.entity_id ?? null;
}

const selectRoomSearchRows = createSelector(
  [
    (s: RootState) => s.warRoom.sessionIds,
    (s: RootState) => s.warRoom.sessionsById,
  ],
  (sessionIds, sessionsById): RoomSearchRow[] =>
    sessionIds.map((id) => {
      const session = sessionsById[id];
      return {
        sessionId: id,
        title: session?.title?.trim() ?? "",
        description: session?.description?.trim() ?? "",
      };
    }),
);

const selectThreadSearchRows = createSelector(
  [
    (s: RootState) => s.warRoom.sessionIds,
    (s: RootState) => s.warRoom.sessionsById,
    (s: RootState) => s.warRoom.tileIdsBySession,
    (s: RootState) => s.warRoom.tilesById,
    (s: RootState) => s.warRoom.assignmentsByContainer,
    (s: RootState) => s.tasks.entities,
  ],
  (
    sessionIds,
    sessionsById,
    tileIdsBySession,
    tilesById,
    byContainer,
    taskEntities,
  ): ThreadSearchRow[] => {
    const rows: ThreadSearchRow[] = [];
    for (const sessionId of sessionIds) {
      const roomTitle =
        sessionsById[sessionId]?.title?.trim() || "Untitled War Room";
      const tileIds = tileIdsBySession[sessionId] ?? [];
      for (const tileId of tileIds) {
        const tile = tilesById[tileId];
        if (!tile) continue;
        const bucket = byContainer[containerKey("thread", tileId)] ?? [];
        const taskId = activeEntityIdOf(bucket, "task");
        const taskTitle = taskId ? taskEntities[taskId]?.title : undefined;
        rows.push({
          tileId,
          sessionId,
          threadTitle: threadDisplayTitle(tile, taskTitle),
          roomTitle,
        });
      }
    }
    return rows;
  },
);

export function useWarRoomAllSearch(query: string): {
  roomHits: WarRoomSearchRoomHit[];
  threadHits: WarRoomSearchThreadHit[];
  isSearching: boolean;
} {
  const roomRows = useAppSelector(selectRoomSearchRows);
  const threadRows = useAppSelector(selectThreadSearchRows);
  const trimmed = query.trim();

  return useMemo(() => {
    if (!trimmed) {
      return { roomHits: [], threadHits: [], isSearching: false };
    }

    const rankedRooms = filterAndSortBySearch(roomRows, trimmed, [
      { get: (r) => r.title, weight: "title" },
      { get: (r) => r.description, weight: "body" },
    ]);

    const rankedThreads = filterAndSortBySearch(threadRows, trimmed, [
      { get: (r) => r.threadTitle, weight: "title" },
    ]);

    return {
      isSearching: true,
      roomHits: rankedRooms.map((r) => ({
        sessionId: r.sessionId,
        title: r.title || "Untitled War Room",
        description: r.description || null,
      })),
      threadHits: rankedThreads.map((r) => ({
        tileId: r.tileId,
        sessionId: r.sessionId,
        threadTitle: r.threadTitle,
        roomTitle: r.roomTitle,
      })),
    };
  }, [roomRows, threadRows, trimmed]);
}
