"use client";

// useNoteDelete — Delete with confirmation + undo toast.
// Used by both desktop NoteTabItem and mobile MobileNoteEditor.
//
// 🚨 THE CONFIRMATION IS THE PACKAGE'S, AND IT LIVES HERE (2026-09-07).
// This hook used to hand its callers an `confirmOpen` / `cancelDelete` /
// `confirmDelete` state machine and let each one BUILD ITS OWN AlertDialog.
// Two callers took that offer and wrote two different dialogs for one
// decision: the desktop tab's was hand-assembled from AlertDialog primitives
// at `z-[10001]` wearing `data-[state=open]:animate-in … zoom-in-95 …
// slide-in-from-top-[48%]` — host-plugin utilities no package ships, so that
// surface was unanimated anywhere but this app by accident of our CSS entry —
// and both were banned by CLAUDE.md besides. The confirmation now happens
// ONCE, here, through the canonical imperative `confirm()` door, which renders
// `@ai-matrx/design-system`'s ConfirmDialog: themed scrim, package motion, a
// clamped scrolling body with a sticky footer, and the destructive button that
// is literally the package's destructive button. Callers get an intent
// (`requestDelete`) and a busy flag. THEY NEVER RENDER A DIALOG AGAIN.
//
// The copy is consequence-first per
// common-docs/policies/destructive-and-expensive-actions.md: it names the note
// by title, says the tab closes, and — because that is the honest fact, not a
// softener — names the two ways back (the Undo toast, and Trash).

import { useState, useCallback, useRef } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { removeInstanceTab } from "../redux/slice";
import { deleteNote, restoreNote } from "../redux/thunks";
import { isNoteContentEmpty } from "../utils/noteUtils";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { toast } from "@/lib/toast-service";

interface UseNoteDeleteOptions {
  instanceId: string;
  noteId: string;
  noteLabel?: string;
  /**
   * Current note content. When empty (or whitespace-only), `requestDelete`
   * skips the confirmation entirely and deletes immediately — an empty note
   * has nothing worth confirming the loss of.
   */
  content?: string | null;
  /** Close the tab after delete (desktop). Set false for mobile where navigation handles it. */
  closeTab?: boolean;
  /** Callback after delete completes (e.g., navigate back on mobile) */
  onDeleted?: () => void;
}

export function useNoteDelete({
  instanceId,
  noteId,
  noteLabel,
  content,
  closeTab = true,
  onDeleted,
}: UseNoteDeleteOptions) {
  const dispatch = useAppDispatch();
  // Not a dialog's open state any more — the dialog belongs to the package.
  // This is "a confirmation is on screen right now", which the notes tab strip
  // reads to keep its idle auto-move parked while the user decides.
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const performDelete = useCallback(async () => {
    setIsDeleting(true);

    try {
      if (closeTab) {
        dispatch(removeInstanceTab({ instanceId, noteId }));
      }
      await dispatch(deleteNote(noteId)).unwrap();

      // Show undo toast for 5 seconds
      toast.show(
        "Note deleted",
        noteLabel ? `"${noteLabel}" moved to trash` : "Moved to trash",
        "default",
        {
          duration: 5000,
          action: {
            label: "Undo",
            onClick: () => {
              if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
              dispatch(restoreNote(noteId));
              toast.success("Note restored");
            },
          },
        },
      );

      onDeleted?.();
    } catch {
      toast.error("Failed to delete note");
    } finally {
      setIsDeleting(false);
    }
  }, [dispatch, instanceId, noteId, noteLabel, closeTab, onDeleted]);

  const requestDelete = useCallback(async () => {
    if (isNoteContentEmpty(content)) {
      await performDelete();
      return;
    }

    const title = noteLabel?.trim() ? noteLabel.trim() : "Untitled";
    setConfirmOpen(true);
    let ok = false;
    try {
      ok = await confirm({
        title: `Delete “${title}”?`,
        description: `This note leaves your notes list and its tab closes. It is moved to Trash, not erased — you can bring it back from the Undo button on the toast, or later from Trash.`,
        confirmLabel: "Delete note",
        variant: "destructive",
      });
    } finally {
      setConfirmOpen(false);
    }
    if (!ok) return;

    await performDelete();
  }, [content, noteLabel, performDelete]);

  return {
    /** True while the confirmation is on screen. Not a dialog you render. */
    confirmOpen,
    isDeleting,
    /** The ONE entry point: confirms (unless the note is empty), then deletes. */
    requestDelete,
  };
}
