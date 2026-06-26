"use client";

// features/war-room/hooks/useTilePulse.ts
//
// The load-bearing "is this thread alive?" primitive for the War Room.
//
// A wall of equal cards can't tell you which threads are alive — a peripheral
// thread has to telegraph its real state without being opened. `useTilePulse`
// derives that live pulse for a single tile by COMPOSING the existing feature
// slices (tasks, notes, transcript, war-room audio links) read-only. It writes
// nothing. It is the difference between a dead tile and a living instrument on
// the rail.
//
// Everything here is real data: task status + subtask progress from the
// agent-context tasks slice, note content length from the notes slice, the
// committed transcript from the transcriptStudio slice, and the live audio
// link state from the warRoom slice. Consumed by the rail status word, the
// PulseGlyph, and the parked-thread chips.

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

export interface TilePulse {
  /** The tile's chosen lead tab — what its "face" should show. */
  activeTab: TileTab;
  /** A short human label for the tile's dominant state, e.g. "3/5 done". */
  headline: string;
  /** The most relevant content preview line (note text, transcript, etc.). */
  preview: string | null;

  // ── Task signal ──
  hasTask: boolean;
  taskDone: boolean;
  subtaskTotal: number;
  subtaskDone: number;

  // ── Notes signal ──
  hasNote: boolean;
  noteChars: number;

  // ── Audio signal ──
  audioSessionCount: number;
  transcriptChars: number;
  /** TRUE only while one of this tile's sessions is ACTUALLY capturing /
   *  transcribing right now (the live recordingsSlice signal) — NOT merely
   *  "has a session". The only thing that may animate as "live". */
  isRecording: boolean;

  // ── Context signal ──
  contextOverridden: boolean;
  hasContext: boolean;

  /** Rough "activity weight" 0..1 — drives subtle emphasis on busy tiles. */
  activity: number;
  /** True when the thread has literally nothing yet (an empty shell). */
  isEmpty: boolean;
}

const PREVIEW_MAX = 160;

function clampPreview(text: string | null | undefined): string | null {
  if (!text) return null;
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return null;
  return t.length > PREVIEW_MAX ? `${t.slice(0, PREVIEW_MAX)}…` : t;
}

export function useTilePulse(tileId: string): TilePulse {
  const tile = useAppSelector(selectTileById(tileId));
  const taskId = useAppSelector(selectTileTaskId(tileId));
  const noteId = useAppSelector(selectActiveNoteId(tileId));

  const task = useAppSelector((s) =>
    taskId ? selectTaskById(s, taskId) : undefined,
  );
  const subtasks = useAppSelector((s) =>
    taskId ? selectSubtasksByParent(s, taskId) : EMPTY_SUBTASKS,
  );
  const noteContent = useAppSelector((s) =>
    noteId ? selectNoteContent(noteId)(s) : undefined,
  );

  const audioSessionIds = useAppSelector(selectAudioSessionIdsForTile(tileId));
  const activeAudioId = useAppSelector(selectActiveAudioSessionId(tileId));
  const transcript = useAppSelector(selectSessionRawText(activeAudioId));

  // LIVE recording signal — the ONLY source of a "Recording" claim. Reads the
  // global recordingsSlice (at most ONE capture app-wide) and matches its target
  // session against THIS tile's sessions. Returns a STABLE primitive, so the
  // ~60fps audioLevel ticks during a recording never re-render the pulse. The
  // mere EXISTENCE of a session is NOT recording (that was the bug — every tile
  // that ever opened Audio/Agent showed "Recording" forever).
  const recStatus = useAppSelector((s): "idle" | "recording" | "transcribing" => {
    const c = s.recordings.context;
    if (!c || c.kind !== "studio" || !audioSessionIds.includes(c.sessionId)) {
      return "idle";
    }
    if (s.recordings.isRecording) return "recording";
    if (s.recordings.isTranscribing) return "transcribing";
    return "idle";
  });
  const isRecording = recStatus !== "idle";

  const ctx = useAppSelector((s) => selectTileEffectiveContext(tileId)(s));

  const activeTab = (tile?.active_tab as TileTab) ?? "task";

  const subtaskTotal = subtasks.length;
  const subtaskDone = subtasks.filter((t) => t.status === "completed").length;
  const taskDone = task?.status === "completed";
  const noteChars = (noteContent ?? "").trim().length;
  const transcriptChars = transcript.trim().length;

  // Headline: a single tight phrase summarizing the tile's dominant state.
  // LIVE recording wins (it's happening now); otherwise a session that merely
  // exists reads as a static, honest label — never "Recording".
  let headline = "Empty";
  if (isRecording) {
    headline = recStatus === "transcribing" ? "Transcribing" : "Recording";
  } else if (taskId) {
    if (subtaskTotal > 0) headline = `${subtaskDone}/${subtaskTotal} done`;
    else if (taskDone) headline = "Done";
    else headline = "Active task";
  } else if (transcriptChars > 0 || audioSessionIds.length > 0) {
    headline =
      audioSessionIds.length > 1
        ? `${audioSessionIds.length} recordings`
        : transcriptChars > 0
          ? "Transcript"
          : "Audio";
  } else if (noteChars > 0) {
    headline = "Notes";
  }

  // Preview: the richest available content line for the tile's face.
  let preview: string | null = null;
  if (activeTab === "notes" && noteChars > 0) preview = clampPreview(noteContent);
  else if (activeTab === "audio" && transcriptChars > 0)
    preview = clampPreview(transcript);
  else if (task?.description) preview = clampPreview(task.description);
  else if (noteChars > 0) preview = clampPreview(noteContent);
  else if (transcriptChars > 0) preview = clampPreview(transcript);

  const hasTask = !!taskId;
  const hasNote = !!noteId;
  const isEmpty =
    !hasTask &&
    noteChars === 0 &&
    transcriptChars === 0 &&
    audioSessionIds.length === 0;

  // Activity weight: a soft 0..1 from how much real substance the thread holds.
  const activity = Math.min(
    1,
    (subtaskTotal > 0 ? 0.3 : hasTask ? 0.15 : 0) +
      (noteChars > 0 ? Math.min(0.35, noteChars / 1200) : 0) +
      (transcriptChars > 0 ? Math.min(0.35, transcriptChars / 1200) : 0) +
      (audioSessionIds.length > 1 ? 0.15 : 0),
  );

  return {
    activeTab,
    headline,
    preview,
    hasTask,
    taskDone,
    subtaskTotal,
    subtaskDone,
    hasNote,
    noteChars,
    audioSessionCount: audioSessionIds.length,
    transcriptChars,
    isRecording,
    contextOverridden: ctx.isOverridden,
    hasContext: !!ctx.organizationId || ctx.scopeIds.length > 0,
    activity,
    isEmpty,
  };
}

const EMPTY_SUBTASKS: ReturnType<typeof selectSubtasksByParent> = [];
