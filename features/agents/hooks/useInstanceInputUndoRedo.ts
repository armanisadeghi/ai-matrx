"use client";

/**
 * useInstanceInputUndoRedo
 *
 * Undo/redo for the agent input composition area — covers both the text field
 * and variable user values together (they're restored as one atomic unit).
 *
 * Keyboard shortcuts:
 *   Mac:       Cmd+Z (undo)  /  Shift+Cmd+Z (redo)
 *   Win/Linux: Ctrl+Z (undo) /  Ctrl+Shift+Z or Ctrl+Y (redo)
 *
 * Intercepts at capture phase to suppress native textarea undo, which would
 * desync from Redux state (browser tracks DOM, not Redux).
 */

import { useEffect, useCallback } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  undoInputEdit,
  redoInputEdit,
} from "../redux/execution-system/instance-user-input/instance-user-input.slice";
import { setUserVariableValues } from "../redux/execution-system/instance-variable-values/instance-variable-values.slice";
import {
  isMacLike,
  getUndoShortcutHint,
  getRedoShortcutHint,
  type Platform,
  getPlatform,
} from "./useAgentUndoRedo";

interface UseInstanceInputUndoRedoOptions {
  conversationId: string | null;
  enabled?: boolean;
}

interface UseInstanceInputUndoRedoReturn {
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
  undoHint: string;
  redoHint: string;
  platform: Platform;
}

export function useInstanceInputUndoRedo({
  conversationId,
  enabled = true,
}: UseInstanceInputUndoRedoOptions): UseInstanceInputUndoRedoReturn {
  const dispatch = useAppDispatch();

  const canUndo = useAppSelector((state) => {
    if (!conversationId) return false;
    return (
      (state.instanceUserInput.byConversationId[conversationId]?._undoPast
        ?.length ?? 0) > 0
    );
  });

  const canRedo = useAppSelector((state) => {
    if (!conversationId) return false;
    return (
      (state.instanceUserInput.byConversationId[conversationId]?._undoFuture
        ?.length ?? 0) > 0
    );
  });

  // Peek at the top of the past stack to get the userValues to restore
  const undoUserValues = useAppSelector((state) => {
    if (!conversationId) return null;
    const past =
      state.instanceUserInput.byConversationId[conversationId]?._undoPast;
    return past && past.length > 0 ? past[past.length - 1].userValues : null;
  });

  const redoUserValues = useAppSelector((state) => {
    if (!conversationId) return null;
    const future =
      state.instanceUserInput.byConversationId[conversationId]?._undoFuture;
    return future && future.length > 0
      ? future[future.length - 1].userValues
      : null;
  });

  const undo = useCallback(() => {
    if (!conversationId || !canUndo) return;
    dispatch(undoInputEdit({ conversationId }));
    if (undoUserValues) {
      dispatch(
        setUserVariableValues({ conversationId, values: undoUserValues }),
      );
    }
  }, [dispatch, conversationId, canUndo, undoUserValues]);

  const redo = useCallback(() => {
    if (!conversationId || !canRedo) return;
    dispatch(redoInputEdit({ conversationId }));
    if (redoUserValues) {
      dispatch(
        setUserVariableValues({ conversationId, values: redoUserValues }),
      );
    }
  }, [dispatch, conversationId, canRedo, redoUserValues]);

  useEffect(() => {
    if (!enabled || !conversationId) return undefined;

    function handleKeyDown(e: KeyboardEvent) {
      const mod = isMacLike() ? e.metaKey : e.ctrlKey;
      if (!mod) return;

      if (e.key === "z" || e.key === "Z") {
        if (e.shiftKey) {
          e.preventDefault();
          redo();
        } else {
          e.preventDefault();
          undo();
        }
        return;
      }

      // Windows/Linux Ctrl+Y
      if ((e.key === "y" || e.key === "Y") && !isMacLike()) {
        e.preventDefault();
        redo();
      }
    }

    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [enabled, conversationId, undo, redo]);

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
