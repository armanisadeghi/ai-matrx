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

import { bulkWrite, upsertCell } from "../service";
import { isBulkOpError, isServiceFailure } from "../types";

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

/** The handle `recordGroup` returns, so the toast that announced a change can undo exactly it. */
export type UndoHandle = UndoEntry;

/** "1 cell" / "4 cells on 3 rows" — what an undo of a group puts back. */
export function describeCellGroup(edits: readonly CellEdit[]): string {
  const rows = new Set(edits.map((e) => e.rowId)).size;
  const cells = `${edits.length} cell${edits.length === 1 ? "" : "s"}`;
  return rows > 1 ? `${cells} on ${rows} rows` : cells;
}

/**
 * THE STACK IS THE DESIGN SYSTEM'S (`@ai-matrx/design-system/data-table/cell-undo`):
 * its depth, its redo contract and its "a fresh edit clears the future" rule are
 * spreadsheet law shared by every grid. This hook owns only what the pure stack
 * cannot: the write, the toast, and the table/column labels an entry needs for
 * its message.
 *
 * An entry is ONE thing the person did. A cell edit is one cell; a row action
 * ("New Week" on 12 rows) is every cell it wrote, recorded with `recordGroup`
 * as ONE entry — one Cmd-Z, one toolbar Undo, or the "Undo" on the action's own
 * toast puts every one of those cells back in ONE transaction (`udt_bulk_write`
 * merge ops), so a half-restored row cannot happen (Arman, 2026-09-21: "an easy
 * undo that would guarantee a full recovery"). There is exactly one undo system:
 * the toast's button and Cmd-Z pop the same stack.
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
  // What the pure entry does not carry (the table, the columns' human labels),
  // keyed by the entry object the stack hands back.
  const edits = useRef(new WeakMap<UndoEntry, CellEdit[]>());
  const [depths, setDepths] = useState({ undo: 0, redo: 0 });
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  const commit = useCallback((next: UndoStack) => {
    stack.current = next;
    setDepths({ undo: next.past.length, redo: next.future.length });
  }, []);

  /**
   * Record several cell writes that already succeeded TOGETHER as one step.
   * Returns the entry, which `undoThis` takes, or null when there was nothing.
   */
  const recordGroup = useCallback(
    (group: readonly CellEdit[], label: string): UndoHandle | null => {
      if (group.length === 0) return null;
      const entry = undoEntryFor(
        group.map((e) => ({ rowId: e.rowId, columnId: e.fieldName, value: e.priorValue })),
        group.map((e) => ({ rowId: e.rowId, columnId: e.fieldName, value: e.nextValue })),
        label,
      );
      edits.current.set(entry, [...group]);
      commit(pushUndo(stack.current, entry));
      return entry;
    },
    [commit],
  );

  /** Record a single cell write that already succeeded. */
  const record = useCallback(
    (edit: CellEdit) => {
      recordGroup([edit], edit.fieldDisplayName);
    },
    [recordGroup],
  );

  /**
   * Write one side of an entry. One cell goes through `upsertCell` exactly as a
   * hand edit; several go as ONE `udt_bulk_write` (one merge op per row), so a
   * group is restored all together or not at all.
   */
  const applySide = useCallback(
    async (group: readonly CellEdit[], side: "undo" | "redo"): Promise<boolean> => {
      const valueOf = (e: CellEdit) => (side === "undo" ? e.priorValue : e.nextValue);
      if (group.length === 1) {
        const edit = group[0];
        const result = await upsertCell({
          tableId: edit.tableId,
          rowId: edit.rowId,
          fieldName: edit.fieldName,
          value: valueOf(edit) as never,
        });
        if (isServiceFailure(result)) {
          // Loud, never silent: the stack is NOT popped on failure, so the user
          // can try again rather than losing the step.
          toast({ title: "Could not undo that change", description: result.error, variant: "destructive" });
          return false;
        }
        return true;
      }
      const byRow = new Map<string, Record<string, unknown>>();
      for (const e of group) {
        const data = byRow.get(e.rowId) ?? {};
        data[e.fieldName] = valueOf(e);
        byRow.set(e.rowId, data);
      }
      const result = await bulkWrite({
        tableId: group[0].tableId,
        operations: [...byRow].map(([row_id, data]) => ({ op: "merge" as const, row_id, data })),
      });
      if (isServiceFailure(result)) {
        toast({
          title: side === "undo" ? "Could not undo that change" : "Could not redo that change",
          description: `${result.error} Nothing was changed; try again.`,
          variant: "destructive",
        });
        return false;
      }
      const missing = (result.data?.results ?? []).filter(isBulkOpError);
      if (missing.length > 0) {
        toast({
          title: side === "undo" ? "Undo was only partly possible" : "Redo was only partly possible",
          description: `${missing.length} row${missing.length === 1 ? " was" : "s were"} removed since, so ${missing.length === 1 ? "it" : "they"} could not be put back. Row history still has ${missing.length === 1 ? "its" : "their"} earlier values.`,
          variant: "destructive",
        });
      }
      return true;
    },
    [],
  );

  const land = useCallback(
    (group: readonly CellEdit[], side: "undo" | "redo", label: string) => {
      for (const e of group) onApplied(e, side === "undo" ? e.priorValue : e.nextValue);
      const what = group.length === 1 ? label : `${label}: ${describeCellGroup(group)}`;
      toast({
        title: side === "undo" ? "Undone" : "Redone",
        description: side === "undo" ? `${what} restored.` : `${what} reapplied.`,
      });
    },
    [onApplied],
  );

  const step = useCallback(
    async (direction: "undo" | "redo") => {
      if (readOnly || busyRef.current) return;
      const popped = direction === "undo" ? popUndo(stack.current) : popRedo(stack.current);
      const entry = popped.entry;
      const group = entry ? edits.current.get(entry) : undefined;
      if (!entry || !group || group.length === 0) return;

      busyRef.current = true;
      setBusy(true);
      try {
        // Loud, never silent: the stack only moves once the write landed, so
        // a failed step can be tried again rather than lost.
        if (await applySide(group, direction)) {
          commit(popped.stack);
          land(group, direction, entry.label);
        }
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [applySide, commit, land, readOnly],
  );

  const undo = useCallback(() => step("undo"), [step]);
  const redo = useCallback(() => step("redo"), [step]);

  /**
   * Undo ONE particular step — the "Undo" button on the toast that announced
   * it. When it is the latest step this is exactly Cmd-Z. When newer steps came
   * after it, it is still undone as long as none of them touched the same
   * cells (restoring over a newer edit would silently throw that edit away);
   * otherwise it says so and leaves everything as it is.
   */
  const undoThis = useCallback(
    async (handle: UndoHandle | null): Promise<boolean> => {
      if (!handle || readOnly || busyRef.current) return false;
      const past = stack.current.past;
      const at = past.lastIndexOf(handle);
      const group = edits.current.get(handle);
      if (at < 0 || !group) {
        toast({ title: "Already undone", description: "That change is no longer on the undo list." });
        return false;
      }
      if (at === past.length - 1) {
        await step("undo");
        return !stack.current.past.includes(handle);
      }
      const touched = new Set(group.map((e) => `${e.rowId}::${e.fieldName}`));
      const newer = past.slice(at + 1).flatMap((e) => edits.current.get(e) ?? []);
      if (newer.some((e) => touched.has(`${e.rowId}::${e.fieldName}`))) {
        toast({
          title: "Newer edits changed the same cells",
          description: "Undo those first (Cmd-Z or the toolbar Undo), then this one.",
          variant: "destructive",
        });
        return false;
      }
      busyRef.current = true;
      setBusy(true);
      try {
        if (!(await applySide(group, "undo"))) return false;
        commit({ ...stack.current, past: stack.current.past.filter((e) => e !== handle) });
        land(group, "undo", handle.label);
        return true;
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [applySide, commit, land, readOnly, step],
  );

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
    recordGroup,
    undoThis,
    undo,
    redo,
    reset,
    canUndo: depths.undo > 0 && !readOnly,
    canRedo: depths.redo > 0 && !readOnly,
    undoDepth: depths.undo,
    busy,
  };
}
