// features/notes/actions/useOpenNoteInWindow.ts
//
// Platform primitive: open ONE specific note in the canonical floating Notes
// window (overlayId `notesWindow`). Any surface that has a note id and
// wants to let the user read/edit it without leaving the page should use this
// rather than hand-wiring the overlay + notes-instance seeding.
//
// How it works: the canonical NotesWindow derives a deterministic notes
// instance id (`notes-${windowInstanceId}`). `registerInstance` is
// idempotent, so we pre-register that instance, seed it with the target note
// as the active tab, prefetch its content, then open the window — which mounts
// already showing the note. Re-opening the same note reuses the same window
// instance instead of spawning a duplicate.

"use client";

import { useCallback } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import {
  registerInstance,
  addInstanceTab,
  setInstanceActiveTab,
} from "@/features/notes/redux/slice";
import { fetchNoteContent } from "@/features/notes/redux/thunks";
import { useOpenNotesWindow } from "@/features/overlays/openers/notesWindow";

export interface OpenNoteInWindowOptions {
  noteId: string;
  /** Window title (defaults to "Notes"). */
  title?: string;
}

export function useOpenNoteInWindow() {
  const dispatch = useAppDispatch();
  const openNotesWindow = useOpenNotesWindow();

  return useCallback(
    ({ noteId, title }: OpenNoteInWindowOptions) => {
      const windowInstanceId = `note-${noteId}`;
      const notesInstanceId = `notes-${windowInstanceId}`;

      dispatch(registerInstance(notesInstanceId));
      dispatch(addInstanceTab({ instanceId: notesInstanceId, noteId }));
      dispatch(setInstanceActiveTab({ instanceId: notesInstanceId, noteId }));
      void dispatch(fetchNoteContent(noteId));

      return openNotesWindow({
        windowInstanceId,
        title: title ?? "Notes",
      });
    },
    [dispatch, openNotesWindow],
  );
}
