"use client";

/** The body of a note-history canvas tab: the existing NoteVersionHistoryPanel. */

import type { CanvasKindProps } from "@ai-matrx/canvas/react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { NoteVersionHistoryPanel } from "@/features/notes/components/diff/NoteVersionHistoryPanel";
import { refetchNoteContent } from "@/features/notes/redux/thunks";
import { readNoteHistoryTab } from "./noteHistoryKind";

export default function NoteHistoryCanvasView({ data }: CanvasKindProps) {
  const dispatch = useAppDispatch();
  const tab = readNoteHistoryTab(data);
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
