/**
 * Undo for user-table cell writes.
 *
 * WHY THIS SHIPS WITH INLINE EDITING, NOT AFTER IT. Lowering the friction to
 * change data raises the rate of accidental change: a single click now toggles
 * a boolean, a bare keystroke now starts an edit, and Delete now empties a
 * cell. Every one of those is a good affordance ONLY if the floor underneath it
 * is recoverable. Shipping the easier editing without the undo would be trading
 * the user's safety for our convenience.
 *
 * WHAT IT IS NOT. This is not a general document history — `udt_dataset_rows`
 * already versions every write into `udt_dataset_row_versions`, and the Row
 * History viewer is still the authority for "what did this row look like last
 * Tuesday". This stack is the SESSION-LOCAL memory of what *you* just did, so
 * Cmd-Z means what it means everywhere else.
 *
 * THE INVERSE IS CAPTURED BEFORE THE WRITE, NEVER DERIVED AFTER IT. Each entry
 * carries the prior value read at the moment of the edit. Re-reading the cell
 * afterwards to discover what to restore would race with realtime and with
 * agent writes, and would happily "undo" to a value someone else just set.
 *
 * Undo is itself a write, so it goes through the SAME `upsertCell` path as a
 * hand edit — it validates, it versions, and it is refused on a read-only table
 * exactly like any other write. An undo that bypassed the write path would be
 * a second way to change data, and the second way is always the one that
 * corrupts something.
 */
"use client";

import { useCallback, useRef, useState } from "react";

import { toast } from "@/components/ui/use-toast";

import { upsertCell } from "../service";
import { isServiceFailure } from "../types";

/** One reversible cell write. */
export type CellEdit = {
  tableId: string;
  rowId: string;
  fieldName: string;
  /** Human label for the toast — the column header, not the machine name. */
  fieldDisplayName: string;
  /** The value BEFORE the write. Restoring this is the undo. */
  priorValue: unknown;
  /** The value written. Restoring this is the redo. */
  nextValue: unknown;
};

/**
 * How many steps back we remember. Deliberately generous — the cost is a few
 * kilobytes of session memory, and the failure mode of a too-short stack is a
 * user discovering their mistake is unrecoverable.
 */
const MAX_DEPTH = 100;

export function useCellUndo(options: {
  /**
   * An undo/redo landed. Carries the exact cell and the value now stored, so
   * the grid can patch that ONE cell instead of refetching the table — a
   * reload would remount the body and throw away the user's place, which is
   * especially wrong for undo, whose whole job is to put things back.
   */
  onApplied: (edit: CellEdit, appliedValue: unknown) => void;
  /** True when the table is not writable — undo must be refused too. */
  readOnly: boolean;
}) {
  const { onApplied, readOnly } = options;

  const undoStack = useRef<CellEdit[]>([]);
  const redoStack = useRef<CellEdit[]>([]);
  // Depths are mirrored into state ONLY so the toolbar can enable/disable its
  // buttons; the stacks themselves stay in refs so recording an edit never
  // re-renders the grid mid-typing.
  const [depths, setDepths] = useState({ undo: 0, redo: 0 });
  const [busy, setBusy] = useState(false);

  const syncDepths = useCallback(() => {
    setDepths({ undo: undoStack.current.length, redo: redoStack.current.length });
  }, []);

  /** Record a write that already succeeded. */
  const record = useCallback(
    (edit: CellEdit) => {
      undoStack.current.push(edit);
      if (undoStack.current.length > MAX_DEPTH) undoStack.current.shift();
      // A fresh edit invalidates the redo branch, exactly as in every editor:
      // you cannot redo into a future you have just diverged from.
      redoStack.current = [];
      syncDepths();
    },
    [syncDepths],
  );

  const applyValue = useCallback(
    async (edit: CellEdit, value: unknown): Promise<boolean> => {
      const result = await upsertCell({
        tableId: edit.tableId,
        rowId: edit.rowId,
        fieldName: edit.fieldName,
        value: value as never,
      });
      if (isServiceFailure(result)) {
        // Loud, never silent: the stack is NOT popped on failure, so the user
        // can try again rather than losing the step.
        toast({
          title: "Could not undo that change",
          description: result.error,
          variant: "destructive",
        });
        return false;
      }
      return true;
    },
    [],
  );

  const undo = useCallback(async () => {
    if (readOnly || busy) return;
    const edit = undoStack.current[undoStack.current.length - 1];
    if (!edit) return;

    setBusy(true);
    try {
      if (await applyValue(edit, edit.priorValue)) {
        undoStack.current.pop();
        redoStack.current.push(edit);
        syncDepths();
        onApplied(edit, edit.priorValue);
        toast({
          title: "Undone",
          description: `${edit.fieldDisplayName} restored.`,
        });
      }
    } finally {
      setBusy(false);
    }
  }, [applyValue, busy, onApplied, readOnly, syncDepths]);

  const redo = useCallback(async () => {
    if (readOnly || busy) return;
    const edit = redoStack.current[redoStack.current.length - 1];
    if (!edit) return;

    setBusy(true);
    try {
      if (await applyValue(edit, edit.nextValue)) {
        redoStack.current.pop();
        undoStack.current.push(edit);
        syncDepths();
        onApplied(edit, edit.nextValue);
        toast({
          title: "Redone",
          description: `${edit.fieldDisplayName} reapplied.`,
        });
      }
    } finally {
      setBusy(false);
    }
  }, [applyValue, busy, onApplied, readOnly, syncDepths]);

  /**
   * Drop everything. Called when the viewer switches to a different table —
   * an undo stack that outlived its table would restore values into a table
   * the user is no longer looking at.
   */
  const reset = useCallback(() => {
    undoStack.current = [];
    redoStack.current = [];
    syncDepths();
  }, [syncDepths]);

  return {
    record,
    undo,
    redo,
    reset,
    canUndo: depths.undo > 0 && !readOnly,
    canRedo: depths.redo > 0 && !readOnly,
    undoDepth: depths.undo,
    busy,
  };
}
