"use client";

/**
 * A note's version history (timeline + compare + restore) as a canvas tab —
 * the existing NoteVersionHistoryPanel, beside the note. ONE tab per note,
 * keyed by its id; every Versions button (the /notes header, the note
 * workspace, the notes window, a context-item note) toggles it, pressed while
 * it is in front. (The panel carries its own "Full view" link to the diff page.)
 */

import { History } from "lucide-react";
import { defineCanvasKind } from "@ai-matrx/canvas/react";
import type { CanvasJson } from "@ai-matrx/canvas";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectNoteLabel } from "@/features/notes/redux/selectors";
import { canvasText, subjectTitle, useToolToggle, type ToolOpenInput } from "@/features/canvas/host/toolCanvas";

export const NOTE_HISTORY_KIND = "note-history";
// The tab names its subject — two open history tabs never share a title.
const LABEL = "Note history";

/** "Note history · <note title>" (just "Note history" while untitled). */
export function noteHistoryTitle(label: string | null | undefined): string {
  return subjectTitle(LABEL, label);
}

export function readNoteHistoryTab(data: CanvasJson | undefined | null): { noteId: string } | null {
  const noteId = canvasText(data, "noteId");
  return noteId ? { noteId } : null;
}

/** The toggle (and open) request for one note's tab. */
export function noteHistoryInput(noteId: string | null, label?: string | null): ToolOpenInput {
  return { kind: NOTE_HISTORY_KIND, key: noteId ?? "", title: noteHistoryTitle(label), data: { noteId } };
}

/** A Versions button: `isVisible` (pressed) while this note's tab is in front; `toggle` opens / focuses / closes it. */
export function useNoteHistoryTab(noteId: string | null): { isVisible: boolean; toggle: () => void } {
  const label = useAppSelector(noteId ? selectNoteLabel(noteId) : () => undefined);
  return useToolToggle(noteHistoryInput(noteId, label));
}

export const NOTE_HISTORY_CANVAS_KIND = defineCanvasKind<CanvasJson>({
  id: NOTE_HISTORY_KIND,
  surface: "dom",
  label: LABEL,
  icon: History,
  load: () => import("./NoteHistoryCanvasView"),
  unavailable: (data) => (readNoteHistoryTab(data) ? null : "No note"),
  restore: true,
});
