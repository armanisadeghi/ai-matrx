"use client";

// Preferred default editor mode for notes that have no saved lastEditorMode.
// MatrxSplit ("split") is the desktop default once the viewport is wide enough
// to show both panes usefully; narrow viewports stay on plain edit.

import { useMediaQuery } from "@/hooks/use-media-query";
import type { EditorMode } from "../components/NoteEditorCore";

/** Viewport width at which MatrxSplit becomes the default (between md/lg). */
export const NOTES_SPLIT_MIN_WIDTH_PX = 900;

export function usePreferredDefaultEditorMode(): EditorMode {
  // Use max-width so the hook's initial `false` means "not narrow" → split.
  // That avoids a plain→split flash on typical desktop first paint.
  const isNarrow = useMediaQuery(
    `(max-width: ${NOTES_SPLIT_MIN_WIDTH_PX - 1}px)`,
  );
  return isNarrow ? "plain" : "split";
}

/** Map legacy / alias mode strings onto the live EditorMode union. */
export function normalizeNoteEditorMode(
  mode: string | null | undefined,
  fallback: EditorMode,
): EditorMode {
  if (!mode) return fallback;
  if (mode === "matrx-split") return "split";
  if (mode === "markdown") return "markdown-split";
  if (
    mode === "plain" ||
    mode === "split" ||
    mode === "preview" ||
    mode === "wysiwyg" ||
    mode === "markdown-split"
  ) {
    return mode;
  }
  return fallback;
}
