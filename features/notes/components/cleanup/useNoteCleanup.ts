"use client";

// useNoteCleanup — binds the pure content-cleanup engine to a note in Redux.
// Reads the note's CURRENT (live, possibly-unsaved) content, and applies a
// chosen result back through the canonical edit + save path so the editor
// reflects it and the DB trigger snapshots a new version automatically.

import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectNoteContent, selectNoteLabel } from "@/features/notes/redux/selectors";
import { updateNoteContent } from "@/features/notes/redux/slice";
import { saveNote } from "@/features/notes/redux/thunks";

export function useNoteCleanup(noteId: string) {
  const dispatch = useAppDispatch();
  const content = useAppSelector(selectNoteContent(noteId)) ?? "";
  const label = useAppSelector(selectNoteLabel(noteId)) ?? "Untitled";

  /** Apply cleaned/staged content. Returns false when it would be a no-op. */
  const apply = (finalContent: string): boolean => {
    if (finalContent === content) return false;
    dispatch(updateNoteContent({ id: noteId, content: finalContent }));
    void dispatch(saveNote(noteId));
    return true;
  };

  return { content, label, apply };
}
