"use client";

// NoteModeSwitch — the four note modes (Split / Plain / Write / Read), one
// click each, from the one NOTE_VIEW_MODES list. The /notes page header and
// every host that shows ONE note with the whole notes toolset (the Board's
// note tile, `NoteWorkspace`) render THIS component, so the control is the
// same everywhere.

import { SegmentedControl } from "@ai-matrx/design-system/controls";
import {
  useNoteEditorMode,
  useSelectNoteMode,
} from "../hooks/usePreferredDefaultEditorMode";
import { NOTE_VIEW_MODES, type NoteViewMode } from "./NoteViewControls";

export interface NoteModeSwitchProps {
  noteId: string;
  /**
   * `always` (default) shows every label. `container` shows labels only when
   * the nearest `@container` ancestor is at least 26rem wide — for hosts that
   * can be narrow (a board tile), so the four modes never overflow. `none`
   * shows icons only (a compact header); the names stay in the tooltip and
   * the accessible label.
   */
  labels?: "always" | "container" | "none";
  className?: string;
}

export function NoteModeSwitch({
  noteId,
  labels = "always",
  className,
}: NoteModeSwitchProps) {
  const editorMode = useNoteEditorMode(noteId);
  const selectNoteMode = useSelectNoteMode();

  // THE canonical capsule toggle (one geometry everywhere), so the control is
  // the same height and padding as every other segmented control.
  const data = NOTE_VIEW_MODES.map(({ mode, label, hint, icon: Icon }) => ({
    value: mode,
    title: hint,
    ariaLabel: label,
    label: (
      <>
        <Icon className="h-3.5 w-3.5" />
        {/* No label node at all when icons-only: a zero-width flex item still takes
            the segment's 4px gap and pushed the glyph off-centre (the segment already
            carries `ariaLabel` + `title` for assistive tech). */}
        {labels !== "none" && (
          <span className={labels === "container" ? "hidden @[26rem]:inline" : undefined}>{label}</span>
        )}
      </>
    ),
  }));

  return (
    <SegmentedControl
      aria-label="Note view"
      value={editorMode}
      onValueChange={(mode) => selectNoteMode(noteId, mode as NoteViewMode)}
      data={data}
      className={className}
    />
  );
}
