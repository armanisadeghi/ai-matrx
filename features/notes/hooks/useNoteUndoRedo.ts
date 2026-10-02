"use client";

// useNoteUndoRedo — Keyboard shortcuts for note undo/redo.
// Adapted from features/agents/hooks/useAgentUndoRedo.ts.
// Intercepts Cmd+Z / Ctrl+Z at capture phase to prevent native textarea
// undo from desynchronizing with Redux state — ONLY for keys pressed inside
// this note's editor (`scope`). A board or a side panel mounts many notes
// at once; an unscoped listener undid every one of them on a single ⌘Z and
// stole ⌘Z from the board (@ai-matrx/kit/keyboard-scope).

import { useEffect, useCallback } from "react";
import { keyEventInside } from "@ai-matrx/kit/keyboard-scope";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { undoNoteEdit, redoNoteEdit } from "../redux/slice";
import {
  getPlatform,
  isMacLike,
  getUndoShortcutHint,
  getRedoShortcutHint,
  type Platform,
} from "@ai-matrx/chat/agents/hooks/useAgentUndoRedo";

interface UseNoteUndoRedoOptions {
  noteId: string | null;
  /** The editor's root — the shortcut answers only keys pressed inside it. */
  scope: () => Element | null;
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

  const undo = useCallback(() => {
    if (noteId && canUndo) dispatch(undoNoteEdit({ id: noteId }));
  }, [dispatch, noteId, canUndo]);

  const redo = useCallback(() => {
    if (noteId && canRedo) dispatch(redoNoteEdit({ id: noteId }));
  }, [dispatch, noteId, canRedo]);

  // Keyboard shortcuts — Cmd+Z / Shift+Cmd+Z (Mac), Ctrl+Z / Ctrl+Y (Win/Linux)
  // Intercept at capture phase to suppress native textarea undo
  useEffect(() => {
    if (!enabled || !noteId) return undefined;

    function handleKeyDown(e: KeyboardEvent) {
      const mod = isMacLike() ? e.metaKey : e.ctrlKey;
      if (!mod) return;
      // Another surface's key (another note, the board, a chat) — not ours.
      if (!keyEventInside(e, scope())) return;
      // Write / Source: THE ONE EDITOR owns undo (it restores the caret and
      // treats protected blocks as the person's own act). Its result reaches
      // the note through onChange, like typing — never undo twice.
      if (
        e.target instanceof Element &&
        e.target.closest("[data-rich-editor]")
      ) {
        return;
      }

      if (e.key === "z" || e.key === "Z") {
        if (e.shiftKey) {
          e.preventDefault();
          if (canRedo) dispatch(redoNoteEdit({ id: noteId! }));
        } else {
          e.preventDefault();
          if (canUndo) dispatch(undoNoteEdit({ id: noteId! }));
        }
        return;
      }

      // Windows/Linux: Ctrl+Y for redo
      if ((e.key === "y" || e.key === "Y") && !isMacLike()) {
        e.preventDefault();
        if (canRedo) dispatch(redoNoteEdit({ id: noteId! }));
      }
    }

    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [enabled, noteId, canUndo, canRedo, dispatch, scope]);

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
