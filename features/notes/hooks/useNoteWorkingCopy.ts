"use client";

/**
 * useNoteWorkingCopy — this editor is a VIEW of the note's one working copy.
 *
 * Every note editor (desktop `NoteContentEditor`, the phone editor) reads the
 * body it shows from here and writes every change here — never into component
 * state. Two views of one note (a board tile and the side panel, two split
 * panes) therefore show the same text keystroke by keystroke and commit it
 * once, a remount or a waking board tile reads what was typed, and an unmount
 * commits what it held without clearing a buffer another view is still using.
 *
 * Store + rules: `../utils/noteLiveContent.ts` and `lib/working-copy/`.
 */

import { useEffect, useSyncExternalStore } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { holdNoteWorkingCopy, noteWorkingCopy } from "../utils/noteLiveContent";

export interface NoteWorkingCopy {
  /** The body every view of this note shows now. */
  content: string;
  /** A keystroke: every view updates now, one debounced commit to Redux. */
  edit: (content: string) => void;
  /** A discrete change (a block edit, an agent write, dictation): committed now. */
  editNow: (content: string) => void;
  /** Redux already holds `content` (a resolved conflict): show it, drop pending. */
  reset: (content: string) => void;
  /** Commit pending words now (before Save, undo, a mode switch). */
  flush: () => void;
  /** Words typed in some view that have not reached Redux yet. */
  hasPending: () => boolean;
}

export function useNoteWorkingCopy(noteId: string, reduxContent: string): NoteWorkingCopy {
  const dispatch = useAppDispatch();

  useEffect(() => holdNoteWorkingCopy(noteId, dispatch), [noteId, dispatch]);

  const copy = useSyncExternalStore(
    (listener) => noteWorkingCopy.subscribe(noteId, listener),
    () => noteWorkingCopy.get(noteId),
    () => undefined,
  );

  return {
    content: copy === undefined ? reduxContent : copy,
    edit: (content) => noteWorkingCopy.edit(noteId, content),
    editNow: (content) => noteWorkingCopy.edit(noteId, content, { commit: "now" }),
    reset: (content) => noteWorkingCopy.reset(noteId, content),
    flush: () => void noteWorkingCopy.flush(noteId),
    hasPending: () => noteWorkingCopy.hasPending(noteId),
  };
}

/**
 * The note's record moved (realtime, undo, a fetch). Every view takes it unless
 * words are still pending in some view. True when the copy took it.
 */
export function adoptNoteSource(noteId: string, reduxContent: string): boolean {
  return noteWorkingCopy.adopt(noteId, reduxContent);
}
