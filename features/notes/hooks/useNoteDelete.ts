"use client";

// useNoteDelete — Delete with confirmation dialog + undo toast.
// Used by both desktop NoteTabItem and mobile MobileNoteEditor.

import { useState, useCallback, useRef } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { removeInstanceTab } from "../redux/slice";
import { deleteNote, restoreNote } from "../redux/thunks";
import { isNoteContentEmpty } from "../utils/noteUtils";
import { toast } from "@/lib/toast-service";

interface UseNoteDeleteOptions {
  instanceId: string;
  noteId: string;
  noteLabel?: string;
  /**
   * Current note content. When empty (or whitespace-only), `requestDelete`
   * skips the confirmation dialog entirely and deletes immediately — an
   * empty note has nothing worth confirming the loss of.
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
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const confirmDelete = useCallback(async () => {
    setConfirmOpen(false);
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

  const requestDelete = useCallback(() => {
    if (isNoteContentEmpty(content)) {
      void confirmDelete();
      return;
    }
    setConfirmOpen(true);
  }, [content, confirmDelete]);

  const cancelDelete = useCallback(() => {
    setConfirmOpen(false);
  }, []);

  return {
    confirmOpen,
    isDeleting,
    requestDelete,
    cancelDelete,
    confirmDelete,
  };
}
