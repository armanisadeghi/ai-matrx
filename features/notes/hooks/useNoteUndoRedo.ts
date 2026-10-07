"use client";

// useNoteUndoRedo — Keyboard shortcuts for note undo/redo.
// Adapted from features/agents/hooks/useAgentUndoRedo.ts.
// Intercepts Cmd+Z / Ctrl+Z at capture phase to prevent native textarea
// undo from desynchronizing with Redux state — ONLY for keys pressed inside
// this note's editor (`scope`). A board or a side panel mounts many notes
// at once; an unscoped listener undid every one of them on a single ⌘Z and
// stole ⌘Z from the board (@ai-matrx/kit/keyboard-scope).
//
// THE HISTORY BELONGS TO THE NOTE, NOT THE VIEW. The record's undo stack lives
// in Redux keyed by note id, so it survives a remount (a board tile waking, a
// tab reopened) and is shared by every view of the note. Before stepping it,
// the note's working copy is committed, so words still inside the debounce are
// part of what undo reverses. Inside the one rich editor, the editor's own
// history answers first (it restores the caret and approves island steps); when
// it has nothing to give — right after a (re)mount — the note's history answers.

import { useEffect, useCallback } from "react";
import { keyEventInside } from "@ai-matrx/kit/keyboard-scope";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { undoNoteEdit, redoNoteEdit } from "../redux/slice";
import { noteWorkingCopy } from "../utils/noteLiveContent";
import {
  getPlatform,
  isMacLike,
  getUndoShortcutHint,
  getRedoShortcutHint,
  type Platform,
} from "@/features/agents/hooks/useAgentUndoRedo";

interface UseNoteUndoRedoOptions {
  noteId: string | null;
  /** The editor's root — the shortcut answers only keys pressed inside it. */
  scope: () => Element | null;
  /**
   * The rich editor's own history depth when it is the body (null otherwise).
   * Zero steps there → the note's record history answers ⌘Z.
   */
  editorHistoryDepth?: () => { undo: number; redo: number } | null;
  enabled?: boolean;
}

interface UseNoteUndoRedoReturn {
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
  undoHint: string;
  redoHint: string;
  platform: Platform;
}

export function useNoteUndoRedo({
  noteId,
  scope,
  editorHistoryDepth,
  enabled = true,
}: UseNoteUndoRedoOptions): UseNoteUndoRedoReturn {
  const dispatch = useAppDispatch();

  const canUndo = useAppSelector((state) => {
    if (!noteId) return false;
    const record = state.notes?.notes?.[noteId];
    return record ? record._undoPast.length > 0 : false;
  });

  const canRedo = useAppSelector((state) => {
    if (!noteId) return false;
    const record = state.notes?.notes?.[noteId];
    return record ? record._undoFuture.length > 0 : false;
  });

  // The step reverses what is on screen: words still pending in the working
  // copy reach the record first (the save-request middleware commits them as
  // an undo step), then the step is saved through the note's one door. The
  // reducers refuse an empty stack themselves, so the gate is the record.
  const stepRecord = useCallback(
    (direction: "undo" | "redo") => {
      if (!noteId) return;
      dispatch(direction === "undo" ? undoNoteEdit({ id: noteId }) : redoNoteEdit({ id: noteId }));
    },
    [dispatch, noteId],
  );

  const undo = useCallback(() => {
    if (noteId && (canUndo || noteWorkingCopy.hasPending(noteId))) stepRecord("undo");
  }, [noteId, canUndo, stepRecord]);

  const redo = useCallback(() => {
    if (noteId && canRedo) stepRecord("redo");
  }, [noteId, canRedo, stepRecord]);

  // Keyboard shortcuts — Cmd+Z / Shift+Cmd+Z (Mac), Ctrl+Z / Ctrl+Y (Win/Linux)
  // Intercept at capture phase to suppress native textarea undo
  useEffect(() => {
    if (!enabled || !noteId) return undefined;

    function handleKeyDown(e: KeyboardEvent) {
      const mod = isMacLike() ? e.metaKey : e.ctrlKey;
      if (!mod) return;
      // Another surface's key (another note, the board, a chat) — not ours.
      if (!keyEventInside(e, scope())) return;
      const isUndo = (e.key === "z" || e.key === "Z") && !e.shiftKey;
      const isRedo =
        ((e.key === "z" || e.key === "Z") && e.shiftKey) ||
        ((e.key === "y" || e.key === "Y") && !isMacLike());
      if (!isUndo && !isRedo) return;

      // Write / Source: THE ONE EDITOR owns undo while it has steps (it
      // restores the caret and treats protected blocks as the person's own
      // act). Its result reaches the note through onChange, like typing —
      // never undo twice. With no steps of its own (just mounted) the note's
      // history answers, so ⌘Z survives a remount.
      if (
        e.target instanceof Element &&
        e.target.closest("[data-rich-editor]")
      ) {
        const depth = editorHistoryDepth?.() ?? null;
        if (!depth) return;
        if (isUndo ? depth.undo > 0 : depth.redo > 0) return;
        // The editor would have done nothing; keep it from trying.
        e.stopPropagation();
      }

      e.preventDefault();
      stepRecord(isUndo ? "undo" : "redo");
    }

    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [enabled, noteId, stepRecord, scope, editorHistoryDepth]);

  return {
    canUndo,
    canRedo,
    undo,
    redo,
    undoHint: getUndoShortcutHint(),
    redoHint: getRedoShortcutHint(),
    platform: getPlatform(),
  };
}
