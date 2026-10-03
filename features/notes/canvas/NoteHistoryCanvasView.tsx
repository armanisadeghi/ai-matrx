"use client";

/** The body of a note-history canvas tab: the existing NoteVersionHistoryPanel. */

import type { CanvasKindProps } from "@ai-matrx/canvas/react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectNoteLabel } from "@/features/notes/redux/selectors";
import { useCanvasTabTitle } from "@/features/canvas/host/toolCanvas";
import { NoteVersionHistoryPanel } from "@/features/notes/components/diff/NoteVersionHistoryPanel";
import { refetchNoteContent } from "@/features/notes/redux/thunks";
import { noteHistoryTitle, readNoteHistoryTab } from "./noteHistoryKind";

export default function NoteHistoryCanvasView({ data, item, canvas }: CanvasKindProps) {
  const dispatch = useAppDispatch();
  const tab = readNoteHistoryTab(data);
  const label = useAppSelector(tab ? selectNoteLabel(tab.noteId) : () => undefined);
  // The tab follows the note's live title (a rename, a tab restored from before).
  useCanvasTabTitle(canvas, item, noteHistoryTitle(label));
  if (!tab) return null;
  return (
    <div className="h-full min-h-0 overflow-hidden bg-background">
      <NoteVersionHistoryPanel
        noteId={tab.noteId}
        variant="embedded"
        onVersionRestored={() => void dispatch(refetchNoteContent(tab.noteId))}
        className="h-full"
      />
    </div>
  );
}
