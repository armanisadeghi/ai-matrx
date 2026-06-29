"use client";

import { useEffect, useCallback } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  undoAgentEdit,
  redoAgentEdit,
} from "@/features/agents/redux/agent-definition/slice";
import {
  selectAgentCanUndo,
  selectAgentCanRedo,
} from "@/features/agents/redux/agent-definition/selectors";

// ---------------------------------------------------------------------------
// Platform detection (runs once, cached)
// ---------------------------------------------------------------------------

export type Platform =
  | "mac"
  | "windows"
  | "ios"
  | "android"
  | "linux"
  | "unknown";

let _cachedPlatform: Platform | null = null;

export function getPlatform(): Platform {
  if (_cachedPlatform) return _cachedPlatform;
  if (typeof navigator === "undefined") return "unknown";

  const ua = navigator.userAgent.toLowerCase();

  if (/iphone|ipad|ipod/.test(ua)) {
    _cachedPlatform = "ios";
  } else if (/android/.test(ua)) {
    _cachedPlatform = "android";
  } else if (/mac/.test(ua)) {
    _cachedPlatform = "mac";
  } else if (/win/.test(ua)) {
    _cachedPlatform = "windows";
  } else if (/linux/.test(ua)) {
    _cachedPlatform = "linux";
  } else {
    _cachedPlatform = "unknown";
  }
  return _cachedPlatform;
}

export function isMacLike(): boolean {
  const p = getPlatform();
  return p === "mac" || p === "ios";
}

export function isTouchDevice(): boolean {
  const p = getPlatform();
  return p === "ios" || p === "android";
}

/**
 * Returns a human-readable shortcut hint string for the current platform.
 * Examples: "⌘Z" on Mac, "Ctrl+Z" on Windows, "Shake" on iOS.
 */
export function getUndoShortcutHint(): string {
  const p = getPlatform();
  switch (p) {
    case "mac":
      return "⌘Z";
    case "ios":
      return "Shake to Undo";
    case "android":
      return "Ctrl+Z";
    case "windows":
      return "Ctrl+Z";
    case "linux":
      return "Ctrl+Z";
    default:
      return "Ctrl+Z";
  }
}

export function getRedoShortcutHint(): string {
  const p = getPlatform();
  switch (p) {
    case "mac":
      return "⇧⌘Z";
    case "ios":
      return "Shake to Redo";
    case "android":
      return "Ctrl+Shift+Z";
    case "windows":
      return "Ctrl+Y";
    case "linux":
      return "Ctrl+Shift+Z";
    default:
      return "Ctrl+Shift+Z";
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

interface UseAgentUndoRedoOptions {
  agentId: string | null;
  enabled?: boolean;
}

interface UseAgentUndoRedoReturn {
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
  undoHint: string;
  redoHint: string;
  platform: Platform;
}

export function useAgentUndoRedo({
  agentId,
  enabled = true,
}: UseAgentUndoRedoOptions): UseAgentUndoRedoReturn {
  const dispatch = useAppDispatch();

  const canUndo = useAppSelector((state) =>
    agentId ? selectAgentCanUndo(state, agentId) : false,
  );
  const canRedo = useAppSelector((state) =>
    agentId ? selectAgentCanRedo(state, agentId) : false,
  );

  const undo = useCallback(() => {
    if (agentId && canUndo) dispatch(undoAgentEdit({ id: agentId }));
  }, [dispatch, agentId, canUndo]);

  const redo = useCallback(() => {
    if (agentId && canRedo) dispatch(redoAgentEdit({ id: agentId }));
  }, [dispatch, agentId, canRedo]);

  // Keyboard shortcuts — works on Mac (⌘Z / ⇧⌘Z) and Win/Linux (Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y)
  //
  // We intercept undo/redo EVERYWHERE, including inside textareas. The
  // textarea content is driven by Redux state, so browser-native undo
  // would desync (it tracks DOM changes, not Redux). By calling
  // preventDefault() we suppress the browser's undo and dispatch our own.
  useEffect(() => {
    if (!enabled || !agentId) return undefined;

    function handleKeyDown(e: KeyboardEvent) {
      const mod = isMacLike() ? e.metaKey : e.ctrlKey;
      if (!mod) return;

      if (e.key === "z" || e.key === "Z") {
        if (e.shiftKey) {
          e.preventDefault();
          if (canRedo) dispatch(redoAgentEdit({ id: agentId! }));
        } else {
          e.preventDefault();
          if (canUndo) dispatch(undoAgentEdit({ id: agentId! }));
        }
        return;
      }

      // Windows/Linux: Ctrl+Y for redo
      if ((e.key === "y" || e.key === "Y") && !isMacLike()) {
        e.preventDefault();
        if (canRedo) dispatch(redoAgentEdit({ id: agentId! }));
      }
    }

    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [enabled, agentId, canUndo, canRedo, dispatch]);

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
