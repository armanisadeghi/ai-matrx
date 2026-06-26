"use client";

// features/war-room/hooks/useTileMetrics.ts
//
// Reads LIVE Redux data for one tile and distills it into the small set of
// "instrument readings" the tile header surfaces as metric chips — so the room
// scans like a wall of monitors, not a wall of decoration. Every number here is
// real (subtask progress, transcript presence, context state); none is
// cosmetic. Consumed by <TileMetricChips>.

import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectSubtasksByParent,
  selectTaskById,
} from "@/features/agent-context/redux/tasksSlice";
import { selectNoteContent } from "@/features/notes/redux/selectors";
import { selectSessionRawText } from "@/features/transcript-studio/redux/selectors";
import {
  selectActiveAudioSessionId,
  selectActiveNoteId,
  selectAudioSessionIdsForTile,
  selectTileById,
  selectTileEffectiveContext,
  selectTileTaskId,
} from "@/features/war-room/redux/selectors";
import type { TileTab } from "@/features/war-room/types";

export interface TileMetrics {
  /** Resolved active tab. */
  activeTab: TileTab;
  /** true when the tile is anchored to a real task record. */
  hasTask: boolean;
  taskTitle: string | null;
  taskCompleted: boolean;
  /** Subtask progress — only meaningful when subtasks exist. */
  subtasksTotal: number;
  subtasksDone: number;
  /** true when a backing note record exists. */
  hasNote: boolean;
  /** Non-empty note body length (chars), for a "filled / empty" read. */
  noteChars: number;
  /** How many audio (transcript) sessions this tile owns. */
  audioCount: number;
  /** true when the active audio session has committed transcript text. */
  hasTranscript: boolean;
  /** Context readings. */
  hasContext: boolean;
  contextOverridden: boolean;
  scopeCount: number;
}

export function useTileMetrics(tileId: string): TileMetrics {
  const tile = useAppSelector(selectTileById(tileId));
  const taskId = useAppSelector(selectTileTaskId(tileId));
  const noteId = useAppSelector(selectActiveNoteId(tileId));

  const task = useAppSelector((s) => (taskId ? selectTaskById(s, taskId) : undefined));
  const subtasks = useAppSelector((s) =>
    taskId ? selectSubtasksByParent(s, taskId) : EMPTY_SUBTASKS,
  );
  const noteContent = useAppSelector((s) =>
    noteId ? selectNoteContent(noteId)(s) : undefined,
  );

  const audioIds = useAppSelector(selectAudioSessionIdsForTile(tileId));
  const activeAudioId = useAppSelector(selectActiveAudioSessionId(tileId));
  const rawText = useAppSelector(selectSessionRawText(activeAudioId));

  const ctx = useAppSelector((s) => selectTileEffectiveContext(tileId)(s));

  const subtasksDone = subtasks.filter((st) => st.status === "completed").length;

  return {
    activeTab: ((tile?.active_tab as TileTab) ?? "task") as TileTab,
    hasTask: !!taskId,
    taskTitle: task?.title ?? null,
    taskCompleted: task?.status === "completed",
    subtasksTotal: subtasks.length,
    subtasksDone,
    hasNote: !!noteId,
    noteChars: noteContent ? noteContent.trim().length : 0,
    audioCount: audioIds.length,
    hasTranscript: !!rawText && rawText.trim().length > 0,
    hasContext: !!ctx.organizationId || ctx.scopeIds.length > 0,
    contextOverridden: ctx.isOverridden,
    scopeCount: ctx.scopeIds.length,
  };
}

const EMPTY_SUBTASKS: ReturnType<typeof selectSubtasksByParent> = [];
