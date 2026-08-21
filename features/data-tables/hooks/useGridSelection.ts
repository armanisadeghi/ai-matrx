/**
 * The grid's selection + keyboard driver.
 *
 * Owns the three states described in `grid-selection.ts` (nothing / selected /
 * editing) and turns keystrokes into moves. The navigation MATH lives in that
 * pure module and is unit-tested there; this hook is only the React shell plus
 * the two things that genuinely need the DOM — keeping the selected cell
 * scrolled into view, and holding focus so keys arrive at all.
 *
 * FOCUS IS THE PART THAT BREAKS. Keys only reach the grid while the grid owns
 * focus, but an open editor must own it instead, and when that editor closes
 * focus has to come BACK or the next arrow key does nothing and the grid feels
 * dead. `refocusGrid` is that handoff, and it is why the container is
 * `tabIndex={0}`.
 */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  cellDomKey,
  classifyGridKey,
  moveSelection,
  sameCell,
  type CellAddress,
  type GridMove,
} from "../grid-selection";

export type GridSelectionApi = {
  selected: CellAddress | null;
  editing: CellAddress | null;
  /** Character that started the edit, consumed once by the editor. */
  editSeed: string | null;
  isSelected: (rowId: string, fieldName: string) => boolean;
  isEditing: (rowId: string, fieldName: string) => boolean;
  select: (address: CellAddress) => void;
  clear: () => void;
  beginEdit: (address: CellAddress, seed?: string) => void;
  /** Leave edit mode; optionally move on, the way Enter and Tab do. */
  endEdit: (move?: GridMove) => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
  onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  refocusGrid: () => void;
};

export function useGridSelection(args: {
  rowIds: readonly string[];
  fieldNames: readonly string[];
  editable: boolean;
  /** Cmd/Ctrl+C on the selected cell. */
  onCopyCell: (address: CellAddress) => void;
  /** Delete / Backspace on the selected cell. */
  onClearCell: (address: CellAddress) => void;
  onUndo: () => void;
  onRedo: () => void;
}): GridSelectionApi {
  const {
    rowIds,
    fieldNames,
    editable,
    onCopyCell,
    onClearCell,
    onUndo,
    onRedo,
  } = args;

  const [selected, setSelected] = useState<CellAddress | null>(null);
  const [editing, setEditing] = useState<CellAddress | null>(null);
  const [editSeed, setEditSeed] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const refocusGrid = useCallback(() => {
    containerRef.current?.focus({ preventScroll: true });
  }, []);

  const select = useCallback((address: CellAddress) => {
    setSelected(address);
    setEditing(null);
    setEditSeed(null);
  }, []);

  const clear = useCallback(() => {
    setSelected(null);
    setEditing(null);
    setEditSeed(null);
  }, []);

  const beginEdit = useCallback(
    (address: CellAddress, seed?: string) => {
      if (!editable) return;
      setSelected(address);
      setEditing(address);
      setEditSeed(seed ?? null);
    },
    [editable],
  );

  const endEdit = useCallback(
    (move?: GridMove) => {
      setEditing(null);
      setEditSeed(null);
      if (move) {
        setSelected((current) =>
          moveSelection(current, move, rowIds, fieldNames),
        );
      }
      // The editor had focus; without this the grid goes deaf after one edit.
      requestAnimationFrame(refocusGrid);
    },
    [fieldNames, refocusGrid, rowIds],
  );

  // Keep the selected cell on screen. `block/inline: "nearest"` so moving
  // within the visible area never yanks the viewport around — only a move that
  // genuinely leaves the frame scrolls.
  useEffect(() => {
    if (!selected) return;
    const node = containerRef.current?.querySelector(
      `[data-cell="${CSS.escape(cellDomKey(selected))}"]`,
    );
    node?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [selected]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      // An open editor owns its own keys — Escape, Enter and Tab are handled by
      // the input so a half-typed value can be cancelled or committed.
      if (editing) return;

      const mod = e.ctrlKey || e.metaKey;
      // Undo/redo work whether or not a cell is selected: the user's last edit
      // is a fact about the table, not about the cursor.
      if (mod && (e.key === "z" || e.key === "Z")) {
        e.preventDefault();
        if (e.shiftKey) onRedo();
        else onUndo();
        return;
      }
      if (mod && (e.key === "y" || e.key === "Y")) {
        e.preventDefault();
        onRedo();
        return;
      }

      if (!selected) return;

      const action = classifyGridKey(e);
      if (!action) return;

      switch (action.kind) {
        case "move": {
          const next = moveSelection(selected, action.move, rowIds, fieldNames);
          if (next && !sameCell(next, selected)) setSelected(next);
          // Always prevent default for Tab and arrows, even when the move is a
          // no-op at an edge: letting Tab escape moves focus out of the grid
          // and the user loses their place.
          e.preventDefault();
          break;
        }
        case "edit":
          if (editable) {
            e.preventDefault();
            beginEdit(selected);
          }
          break;
        case "editSeeded":
          if (editable) {
            e.preventDefault();
            beginEdit(selected, action.seed);
          }
          break;
        case "clearCell":
          if (editable) {
            e.preventDefault();
            onClearCell(selected);
          }
          break;
        case "copy":
          // No preventDefault: if the user has a real text range selected we
          // must let the browser's own copy win.
          onCopyCell(selected);
          break;
        case "escape":
          e.preventDefault();
          clear();
          break;
      }
    },
    [
      beginEdit,
      clear,
      editable,
      editing,
      fieldNames,
      onClearCell,
      onCopyCell,
      onRedo,
      onUndo,
      rowIds,
      selected,
    ],
  );

  const isSelected = useCallback(
    (rowId: string, fieldName: string) =>
      selected?.rowId === rowId && selected.fieldName === fieldName,
    [selected],
  );

  const isEditing = useCallback(
    (rowId: string, fieldName: string) =>
      editing?.rowId === rowId && editing.fieldName === fieldName,
    [editing],
  );

  return {
    selected,
    editing,
    editSeed,
    isSelected,
    isEditing,
    select,
    clear,
    beginEdit,
    endEdit,
    containerRef,
    onKeyDown,
    refocusGrid,
  };
}
