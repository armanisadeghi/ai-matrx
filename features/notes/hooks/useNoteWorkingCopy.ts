"use client";

/**
 * useNoteWorkingCopy — this editor is a VIEW of the note's one working copy.
 *
 * Every note editor (desktop `NoteContentEditor`, the phone editor) reads the
 * body it shows from Redux (`workingCopies`, keyed "note:<id>", the one
 * working-copy primitive in lib/working-copy) and writes every change there —
 * never into component state. Two views of one note (a board tile and the side
 * panel, two split panes) therefore show the same text keystroke by keystroke
 * and commit it once, a remount or a waking board tile reads what was typed,
 * and an unmount commits what it held without clearing a buffer another view
 * is still using.
 *
 * The note record's body moving (realtime, undo, a fetch) is offered to the
 * copy: a clean copy follows it, words still pending are kept.
 */

import { useEffect } from "react";
import { useAppSelector, useAppStore } from "@/lib/redux/hooks";
import { selectWorkingCopyValue } from "@/lib/working-copy/workingCopySlice";
import { holdNoteWorkingCopy, noteWorkingCopy } from "../utils/noteLiveContent";

export interface NoteWorkingCopy {
  /** The body every view of this note shows now. */
  content: string;
  /** A keystroke: every view updates now, one debounced commit to the note record. */
  edit: (content: string) => void;
  /** A discrete change (a block edit, an agent write, dictation): committed now. */
  editNow: (content: string) => void;
  /** The note record already holds `content` (a resolved conflict): show it, drop pending. */
  reset: (content: string) => void;
  /** Commit pending words now (before Save, undo, a mode switch). */
  flush: () => void;
  /** Words typed in some view that have not reached the note record yet. */
  hasPending: () => boolean;
}

export function useNoteWorkingCopy(noteId: string, reduxContent: string): NoteWorkingCopy {
  const store = useAppStore();
  const key = noteWorkingCopy.key(noteId);

  useEffect(() => holdNoteWorkingCopy(noteId, store), [noteId, store]);

  // The record's body is the copy's base; a clean copy follows it.
  useEffect(() => {
    noteWorkingCopy.load(noteId, reduxContent);
  }, [noteId, reduxContent]);

  const copy = useAppSelector((state) => selectWorkingCopyValue(state, key));

  return {
    content: copy === undefined ? reduxContent : copy,
    edit: (content) => noteWorkingCopy.edit(noteId, content),
    editNow: (content) => noteWorkingCopy.edit(noteId, content, { now: true }),
    reset: (content) => noteWorkingCopy.reset(noteId, content),
    flush: () => void noteWorkingCopy.flush(noteId),
    hasPending: () => noteWorkingCopy.hasPending(noteId),
  };
}
