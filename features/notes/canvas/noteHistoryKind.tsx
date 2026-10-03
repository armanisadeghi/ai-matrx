"use client";

/**
 * A note's version history (timeline + compare + restore) as a canvas tab —
 * the existing NoteVersionHistoryPanel, beside the note. ONE tab per note,
 * keyed by its id; every Versions button (the /notes header, the note
 * workspace, the notes window, a context-item note) toggles it, pressed while
 * it is in front. The header's link opens the full diff page.
 */

import Link from "next/link";
import { ExternalLink, History } from "lucide-react";
import { defineCanvasKind, type CanvasKindProps } from "@ai-matrx/canvas/react";
import type { CanvasJson } from "@ai-matrx/canvas";
import { canvasText, useToolToggle, type ToolOpenInput } from "@/features/canvas/host/toolCanvas";

export const NOTE_HISTORY_KIND = "note-history";
const LABEL = "Version history";

export function readNoteHistoryTab(data: CanvasJson | undefined | null): { noteId: string } | null {
  const noteId = canvasText(data, "noteId");
  return noteId ? { noteId } : null;
}

/** The toggle (and open) request for one note's tab. */
export function noteHistoryInput(noteId: string | null): ToolOpenInput {
  return { kind: NOTE_HISTORY_KIND, key: noteId ?? "", title: LABEL, data: { noteId } };
}

/** A Versions button: `isVisible` (pressed) while this note's tab is in front; `toggle` opens / focuses / closes it. */
export function useNoteHistoryTab(noteId: string | null): { isVisible: boolean; toggle: () => void } {
  return useToolToggle(noteHistoryInput(noteId));
}

function OpenFullDiff({ item }: CanvasKindProps) {
  const tab = readNoteHistoryTab(item.data);
  if (!tab) return null;
  return (
    <Link
      href={`/notes/${tab.noteId}/diff`}
      target="_blank"
      rel="noopener noreferrer"
      title="Open full diff view"
      aria-label="Open full diff view"
      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      <ExternalLink className="h-3.5 w-3.5" />
    </Link>
  );
}

export const NOTE_HISTORY_CANVAS_KIND = defineCanvasKind<CanvasJson>({
  id: NOTE_HISTORY_KIND,
  label: LABEL,
  icon: History,
  load: () => import("./NoteHistoryCanvasView"),
  unavailable: (data) => (readNoteHistoryTab(data) ? null : "No note"),
  HeaderAction: OpenFullDiff,
  restore: true,
});
