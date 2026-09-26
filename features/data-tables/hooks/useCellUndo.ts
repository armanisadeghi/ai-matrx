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
import {
  DEFAULT_UNDO_DEPTH,
  createUndoStack,
  popRedo,
  popUndo,
  pushUndo,
  undoEntryFor,
  type UndoEntry,
  type UndoStack,
} from "@ai-matrx/design-system/data-table/cell-undo";

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
 * THE STACK IS THE DESIGN SYSTEM'S (`@ai-matrx/design-system/data-table/cell-undo`):
 * its depth, its redo contract and its "a fresh edit clears the future" rule are
 * spreadsheet law shared by every grid. This hook owns only what the pure stack
 * cannot: the write through `upsertCell`, the toast, and the table/column labels
 * an entry needs for its message. Each entry carries exactly one cell patch.
 */
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

  // The stack lives in a ref so recording an edit never re-renders the grid
  // mid-typing; depths are mirrored into state ONLY for the toolbar buttons.
  const stack = useRef<UndoStack>(createUndoStack(DEFAULT_UNDO_DEPTH));
  // What the pure entry does not carry (the table, the column's human label),
  // keyed by the entry object the stack hands back.
  const edits = useRef(new WeakMap<UndoEntry, CellEdit>());
  const [depths, setDepths] = useState({ undo: 0, redo: 0 });
  const [busy, setBusy] = useState(false);

  const commit = useCallback((next: UndoStack) => {
    stack.current = next;
    setDepths({ undo: next.past.length, redo: next.future.length });
  }, []);

  /** Record a write that already succeeded. */
  const record = useCallback(
    (edit: CellEdit) => {
      const entry = undoEntryFor(
        [{ rowId: edit.rowId, columnId: edit.fieldName, value: edit.priorValue }],
        [{ rowId: edit.rowId, columnId: edit.fieldName, value: edit.nextValue }],
        edit.fieldDisplayName,
      );
      edits.current.set(entry, edit);
      commit(pushUndo(stack.current, entry));
    },
    [commit],
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

  const step = useCallback(
    async (direction: "undo" | "redo") => {
      if (readOnly || busy) return;
      const popped =
        direction === "undo" ? popUndo(stack.current) : popRedo(stack.current);
      const entry = popped.entry;
      const edit = entry ? edits.current.get(entry) : undefined;
      const patch = entry ? (direction === "undo" ? entry.undo : entry.redo)[0] : undefined;
      if (!entry || !edit || !patch) return;

      setBusy(true);
      try {
        // Loud, never silent: the stack only moves once the write landed, so
        // a failed step can be tried again rather than lost.
        if (await applyValue(edit, patch.value)) {
          commit(popped.stack);
          onApplied(edit, patch.value);
          toast({
            title: direction === "undo" ? "Undone" : "Redone",
            description:
              direction === "undo"
                ? `${edit.fieldDisplayName} restored.`
                : `${edit.fieldDisplayName} reapplied.`,
          });
        }
      } finally {
        setBusy(false);
      }
    },
    [applyValue, busy, commit, onApplied, readOnly],
  );

  const undo = useCallback(() => step("undo"), [step]);
  const redo = useCallback(() => step("redo"), [step]);

  /**
   * Drop everything. Called when the viewer switches to a different table —
   * an undo stack that outlived its table would restore values into a table
   * the user is no longer looking at.
   */
  const reset = useCallback(() => {
    commit(createUndoStack(stack.current.depth));
  }, [commit]);

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
