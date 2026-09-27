"use client";

// Preferred default editor mode for notes that have no saved per-note mode.
// The person's own choice (userPreferences.notes.defaultEditorMode, saved when
// they pick a view in the header) wins; the platform default is Rich — the
// rendered editor, never raw markdown first. A two-pane choice on a viewport
// too narrow for two panes falls back to Rich.

import { useMediaQuery } from "@/hooks/use-media-query";
import { useSetting } from "@/features/settings/hooks/useSetting";
import { canonicalNoteEditorMode } from "../redux/notes.types";
import type { EditorMode } from "../components/NoteEditorCore";

/** Viewport width below which the two-pane views are too cramped. */
export const NOTES_SPLIT_MIN_WIDTH_PX = 900;

const PLATFORM_DEFAULT_EDITOR_MODE: EditorMode = "wysiwyg";

export function usePreferredDefaultEditorMode(): EditorMode {
  const isNarrow = useMediaQuery(
    `(max-width: ${NOTES_SPLIT_MIN_WIDTH_PX - 1}px)`,
  );
  const [saved] = useSetting<string | undefined>(
    "userPreferences.notes.defaultEditorMode",
  );
  const mode = canonicalNoteEditorMode(saved) ?? PLATFORM_DEFAULT_EDITOR_MODE;
  if (isNarrow && (mode === "split" || mode === "markdown-split"))
    return PLATFORM_DEFAULT_EDITOR_MODE;
  return mode;
}

/** Map legacy / alias mode strings onto the live EditorMode union. */
export function normalizeNoteEditorMode(
  mode: string | null | undefined,
  fallback: EditorMode,
): EditorMode {
  return canonicalNoteEditorMode(mode) ?? fallback;
}
