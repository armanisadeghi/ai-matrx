"use client";

// NoteModeSwitch — the four note modes (Split / Plain / Write / Read), one
// click each, from the one NOTE_VIEW_MODES list. The /notes page header and
// every host that shows ONE note with the whole notes toolset (the Board's
// note tile, `NoteWorkspace`) render THIS component, so the control is the
// same everywhere.

import { useCallback } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { cn } from "@/lib/utils";
import { useSetting } from "@/features/settings/hooks/useSetting";
import {
  NAV_ITEM_SELECTED,
  NAV_ITEM_UNSELECTED,
} from "@/features/shell/components/header/navItemClasses";
import { setNoteEditorMode } from "../redux/slice";
import {
  DEFAULT_EDITOR_MODE_SETTING,
  normalizeNoteEditorMode,
  useNoteEditorMode,
} from "../hooks/usePreferredDefaultEditorMode";
import type { EditorMode } from "./NoteEditorCore";
import { NOTE_VIEW_MODES } from "./NoteViewControls";

export interface NoteModeSwitchProps {
  noteId: string;
  /**
   * Picking a WRITING mode (Split / Plain / Write) becomes the person's
   * default for notes they have not typed in before
   * (notes.defaultEditorMode). Reading one note never does.
   */
  rememberAsDefault: boolean;
  /**
   * `always` (default) shows every label. `container` shows labels only when
   * the nearest `@container` ancestor is at least 26rem wide — for hosts that
   * can be narrow (a board tile), so the four modes never overflow.
   */
  labels?: "always" | "container";
  className?: string;
}

export function NoteModeSwitch({
  noteId,
  rememberAsDefault,
  labels = "always",
  className,
}: NoteModeSwitchProps) {
  const dispatch = useAppDispatch();
  const editorMode = useNoteEditorMode(noteId);
  const [, saveDefaultEditorMode] = useSetting<EditorMode>(
    DEFAULT_EDITOR_MODE_SETTING,
  );

  const setMode = useCallback(
    (mode: string) => {
      const next = normalizeNoteEditorMode(mode, editorMode);
      dispatch(setNoteEditorMode({ id: noteId, mode: next }));
      if (rememberAsDefault && next !== "preview") saveDefaultEditorMode(next);
    },
    [dispatch, noteId, editorMode, rememberAsDefault, saveDefaultEditorMode],
  );

  return (
    // Equal columns: the control's width never depends on which view is
    // selected (a bolder selected label used to nudge it sideways).
    <div
      className={cn(
        "matrx-glass-thin-border grid grid-cols-4 items-center gap-0.5 rounded-full p-0.5",
        className,
      )}
    >
      {NOTE_VIEW_MODES.map(({ mode, label, hint, icon: Icon }) => (
        <button
          key={mode}
          type="button"
          title={hint}
          aria-label={label}
          aria-pressed={editorMode === mode}
          className={cn(
            "flex cursor-pointer items-center justify-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors",
            "[&_svg]:h-3.5 [&_svg]:w-3.5",
            editorMode === mode ? NAV_ITEM_SELECTED : NAV_ITEM_UNSELECTED,
          )}
          onClick={() => setMode(mode)}
        >
          <Icon />
          <span className={labels === "container" ? "hidden @[26rem]:inline" : undefined}>
            {label}
          </span>
        </button>
      ))}
    </div>
  );
}
