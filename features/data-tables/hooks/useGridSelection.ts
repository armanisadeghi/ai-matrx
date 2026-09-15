/**
 * The grid's selection + keyboard driver.
 *
 * Owns the three states described in `grid-selection.ts` (nothing / selected /
 * editing) and turns keystrokes into moves. The navigation MATH lives in that
 * pure module and is unit-tested there; this hook is only the React shell plus
 * the two things that genuinely need the DOM — keeping the selected cell
 * scrolled into view, and holding focus so keys arrive at all.
 *
 * RANGES (2026-09-14). A selection is an ANCHOR (the cell with the ring) and,
 * optionally, a FOCUS it was extended to — by shift-click, by dragging, by
 * shift+arrows, or by picking a whole row / column / page. Every clipboard and
 * clearing gesture then acts on the rectangle they span, which is what turns
 * "copy" into "copy these cells" and lets a user hand a block of cells to an
 * agent. The anchor is still `selected`, so everything that only knows about
 * one cell (edit, the context menu's "this cell") keeps working unchanged.
 *
 * FOCUS IS THE PART THAT BREAKS. Keys only reach the grid while the grid owns
 * focus, but an open editor must own it instead, and when that editor closes
 * focus has to come BACK or the next arrow key does nothing and the grid feels
 * dead. `refocusGrid` is that handoff, and it is why the container is
 * `tabIndex={0}`.
 *
 * THE CLIPBOARD HAS TWO DOORS, AND BOTH MUST WORK. A native `copy` / `cut` /
 * `paste` event fires when the user goes through the browser's Edit menu or
 * its own right-click "Paste", and it is the only path that can READ the
 * clipboard without a permission prompt (`event.clipboardData`). But the
 * browser does not reliably fire those events on a focused <div> with nothing
 * text-selected — Chromium raised none for Cmd-C on this grid (2026-09-14) —
 * so the keyboard chords are ALSO caught on keydown and, if no native event
 * claims the gesture within a beat, served through the async Clipboard API.
 * The pending flag is what stops a browser that fires both from copying twice.
 * A chord is never intercepted while the user has real text highlighted inside
 * the grid: the browser's own copy of that range must win.
 */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ClipboardEvent as ReactClipboardEvent } from "react";

import { toast } from "@/components/ui/use-toast";

import {
  allRange,
  boundsContain,
  cellDomKey,
  cellsInRange,
  classifyGridKey,
  columnRange,
  isSingleCellRange,
  moveSelection,
  rangeBounds,
  rangeRows,
  rowRange,
  sameCell,
  type CellAddress,
  type CellRange,
  type GridMove,
  type RangeBounds,
} from "../grid-selection";
import { gridToTsv } from "../grid-clipboard";

export type GridSelectionApi = {
  /** The anchor — the cell with the ring. */
  selected: CellAddress | null;
  editing: CellAddress | null;
  /** Character that started the edit, consumed once by the editor. */
  editSeed: string | null;
  /** The extended selection, or null when only the anchor is selected. */
  range: CellRange | null;
  /** The range's rectangle in the grid's current order (null = single / none). */
  bounds: RangeBounds | null;
  /** Every selected cell in reading order — the anchor alone when no range. */
  selectedCells: CellAddress[];
  /** True while a pointer drag is extending the range. */
  dragging: boolean;
  isSelected: (rowId: string, fieldName: string) => boolean;
  /** In the extended range (anchor included). */
  isInRange: (rowId: string, fieldName: string) => boolean;
  isEditing: (rowId: string, fieldName: string) => boolean;
  select: (address: CellAddress) => void;
  /** Shift-click: keep the anchor, move the focus here. */
  extendTo: (address: CellAddress) => void;
  selectRow: (rowId: string) => void;
  selectColumn: (fieldName: string) => void;
  selectAll: () => void;
  /** Pointer drag: press on a cell, sweep over others, release anywhere. */
  beginDrag: (address: CellAddress) => void;
  dragOver: (address: CellAddress) => void;
  clear: () => void;
  beginEdit: (address: CellAddress, seed?: string) => void;
  /** Leave edit mode; optionally move on, the way Enter and Tab do. */
  endEdit: (move?: GridMove) => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
  onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  /**
   * Native clipboard events for the container — the Edit-menu / browser
   * right-click door. Spread onto the same element as `onKeyDown`.
   */
  clipboardHandlers: {
    onCopy: (e: ReactClipboardEvent<HTMLDivElement>) => void;
    onCut: (e: ReactClipboardEvent<HTMLDivElement>) => void;
    onPaste: (e: ReactClipboardEvent<HTMLDivElement>) => void;
  };
  /** Copy the selection (or `address`) — the context-menu door. */
  copyCell: (address?: CellAddress) => void;
  /** Copy then clear. Refused (no-op) when the grid is not editable. */
  cutCell: (address?: CellAddress) => void;
  /**
   * Paste over the selection (or `address`) from the async Clipboard API.
   * Needs a user gesture and, in some browsers, a one-time permission — the
   * failure toast names the keyboard chord as the always-available way in.
   */
  pasteIntoCell: (address?: CellAddress) => Promise<void>;
  /** The selection as spreadsheet TSV — what Copy puts on the clipboard. */
  selectionText: () => string;
  refocusGrid: () => void;
};

/**
 * How long the keydown path waits for a native clipboard event to claim the
 * same gesture before serving it through the async Clipboard API itself.
 * Long enough that a browser which fires both never double-copies; short
 * enough that a paste still feels instant when the native event never comes.
 */
const NATIVE_CLIPBOARD_GRACE_MS = 80;

export function useGridSelection(args: {
  rowIds: readonly string[];
  fieldNames: readonly string[];
  editable: boolean;
  /** The clipboard text for a cell. Read at copy time, never cached. */
  getCellText: (address: CellAddress) => string;
  /** A copy landed on the clipboard — the caller owns the "Copied" feedback. */
  onCopied?: (cells: CellAddress[], text: string) => void;
  /** Delete / Backspace on the selection, and the second half of a cut. ONE write for all of them. */
  onClearCells: (addresses: CellAddress[]) => void;
  /**
   * Clipboard text arrived on the selection. `targetCells` is every selected
   * cell (the anchor alone when nothing is extended) so a single copied value
   * can FILL a range, the way Excel does; a block always lands at `anchor`.
   */
  onPasteText: (
    anchor: CellAddress,
    text: string,
    targetCells: CellAddress[],
  ) => void;
  /** Cmd-D: copy the range's first row down over the rest. */
  onFillDown?: (rows: CellAddress[][]) => void;
  onUndo: () => void;
  onRedo: () => void;
}): GridSelectionApi {
  const {
    rowIds,
    fieldNames,
    editable,
    getCellText,
    onCopied,
    onClearCells,
    onPasteText,
    onFillDown,
    onUndo,
    onRedo,
  } = args;

  const [selected, setSelected] = useState<CellAddress | null>(null);
  const [focus, setFocus] = useState<CellAddress | null>(null);
  const [editing, setEditing] = useState<CellAddress | null>(null);
  const [editSeed, setEditSeed] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // ─── derived range ──────────────────────────────────────────────────────
  const range: CellRange | null =
    selected && focus && !sameCell(selected, focus)
      ? { anchor: selected, focus }
      : null;
  const bounds = range ? rangeBounds(range, rowIds, fieldNames) : null;
  const selectedCells: CellAddress[] = range
    ? cellsInRange(range, rowIds, fieldNames)
    : selected
      ? [selected]
      : [];

  const refocusGrid = useCallback(() => {
    containerRef.current?.focus({ preventScroll: true });
  }, []);

  const select = useCallback((address: CellAddress) => {
    setSelected(address);
    setFocus(null);
    setEditing(null);
    setEditSeed(null);
  }, []);

  const extendTo = useCallback(
    (address: CellAddress) => {
      setEditing(null);
      setEditSeed(null);
      // No anchor yet: the first shift-click just selects.
      setSelected((anchor) => anchor ?? address);
      setFocus(address);
    },
    [],
  );

  const applyRange = useCallback((next: CellRange | null) => {
    if (!next) return;
    setEditing(null);
    setEditSeed(null);
    setSelected(next.anchor);
    setFocus(isSingleCellRange(next) ? null : next.focus);
  }, []);

  const selectRow = useCallback(
    (rowId: string) => applyRange(rowRange(rowId, fieldNames)),
    [applyRange, fieldNames],
  );
  const selectColumn = useCallback(
    (fieldName: string) => applyRange(columnRange(fieldName, rowIds)),
    [applyRange, rowIds],
  );
  const selectAll = useCallback(
    () => applyRange(allRange(rowIds, fieldNames)),
    [applyRange, fieldNames, rowIds],
  );

  const clear = useCallback(() => {
    setSelected(null);
    setFocus(null);
    setEditing(null);
    setEditSeed(null);
  }, []);

  // ─── drag ───────────────────────────────────────────────────────────────
  const beginDrag = useCallback(
    (address: CellAddress) => {
      select(address);
      setDragging(true);
    },
    [select],
  );
  const dragOver = useCallback(
    (address: CellAddress) => {
      if (!dragging) return;
      setFocus(address);
    },
    [dragging],
  );
  useEffect(() => {
    if (!dragging) return undefined;
    const end = () => setDragging(false);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    return () => {
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
  }, [dragging]);

  const beginEdit = useCallback(
    (address: CellAddress, seed?: string) => {
      if (!editable) return;
      setSelected(address);
      setFocus(null);
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
        setFocus(null);
      }
      // The editor had focus; without this the grid goes deaf after one edit.
      //
      // But only reclaim it when the user is still IN the grid. A blur-commit
      // caused by clicking a toolbar button (or anywhere else) would otherwise
      // yank focus straight back out of whatever they just clicked.
      requestAnimationFrame(() => {
        const active = document.activeElement;
        const stillInside =
          active === null ||
          active === document.body ||
          containerRef.current?.contains(active) === true;
        if (move || stillInside) refocusGrid();
      });
    },
    [fieldNames, refocusGrid, rowIds],
  );

  // CLICKING AWAY DESELECTS. A selection that survives a click into the rest of
  // the app is a lie: the grid looks focused, the keyboard no longer reaches
  // it, and the next Delete or Cmd-Z appears to target a cell that is not
  // actually current any more. Losing focus must lose the selection.
  //
  // Two exceptions, and only two:
  //  - inside the grid itself, which manages its own selection;
  //  - inside a floating layer the grid OPENED (a choice chooser, a confirm
  //    dialog, a toast). Those render in portals OUTSIDE the container, so a
  //    naive outside-click test would treat picking an option as clicking away
  //    and tear down the very editor the user is answering.
  //
  // `pointerdown` rather than `click`, so the selection clears on press and
  // cannot briefly appear active over a control the user has already moved to.
  useEffect(() => {
    if (!selected && !editing) return undefined;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (containerRef.current?.contains(target)) return;
      if (
        target instanceof Element &&
        target.closest(
          '[data-radix-popper-content-wrapper],[role="dialog"],[role="listbox"],[role="menu"],[data-sonner-toaster]',
        )
      ) {
        return;
      }
      clear();
    };

    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [clear, editing, selected]);

  // Keep the FOCUS cell on screen (the anchor when there is no range).
  // `block/inline: "nearest"` so moving within the visible area never yanks
  // the viewport around — only a move that genuinely leaves the frame scrolls.
  const scrollTarget = focus ?? selected;
  useEffect(() => {
    if (!scrollTarget) return;
    const node = containerRef.current?.querySelector(
      `[data-cell="${CSS.escape(cellDomKey(scrollTarget))}"]`,
    );
    node?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [scrollTarget]);

  // ─── clipboard ──────────────────────────────────────────────────────────

  /** The selection as TSV: one cell's text, or the range as a block. */
  const selectionText = useCallback((): string => {
    if (range) {
      return gridToTsv(
        rangeRows(range, rowIds, fieldNames).map((row) =>
          row.map((address) => getCellText(address)),
        ),
      );
    }
    return selected ? getCellText(selected) : "";
  }, [fieldNames, getCellText, range, rowIds, selected]);

  /** True when the user has real text highlighted inside the grid. */
  const hasTextRangeInGrid = useCallback((): boolean => {
    const sel = typeof window !== "undefined" ? window.getSelection() : null;
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return false;
    const node = sel.getRangeAt(0).commonAncestorContainer;
    return containerRef.current?.contains(node) === true;
  }, []);

  const writeClipboard = useCallback(
    (cells: CellAddress[], text: string) => {
      if (typeof navigator === "undefined" || !navigator.clipboard) {
        toast({
          title: "Could not copy",
          description: "This browser exposes no clipboard to the page.",
          variant: "destructive",
        });
        return;
      }
      void navigator.clipboard.writeText(text).then(
        () => onCopied?.(cells, text),
        () =>
          toast({
            title: "Could not copy",
            description: "The browser refused clipboard access.",
            variant: "destructive",
          }),
      );
    },
    [onCopied],
  );

  /** The cells a clipboard gesture acts on: the range, else `address` / the anchor. */
  const targetCellsFor = useCallback(
    (address?: CellAddress): CellAddress[] => {
      if (address && !(range && selectedCells.some((c) => sameCell(c, address)))) {
        return [address];
      }
      return selectedCells;
    },
    [range, selectedCells],
  );

  const textFor = useCallback(
    (cells: CellAddress[]): string =>
      cells.length === 1 && !range
        ? getCellText(cells[0])
        : cells.length === 1
          ? getCellText(cells[0])
          : selectionText(),
    [getCellText, range, selectionText],
  );

  const copyCell = useCallback(
    (address?: CellAddress) => {
      const cells = targetCellsFor(address);
      if (cells.length === 0) return;
      writeClipboard(cells, textFor(cells));
    },
    [targetCellsFor, textFor, writeClipboard],
  );

  const cutCell = useCallback(
    (address?: CellAddress) => {
      if (!editable) return;
      const cells = targetCellsFor(address);
      if (cells.length === 0) return;
      writeClipboard(cells, textFor(cells));
      onClearCells(cells);
    },
    [editable, onClearCells, targetCellsFor, textFor, writeClipboard],
  );

  const pasteIntoCell = useCallback(
    async (address?: CellAddress) => {
      const anchor = address ?? selected;
      if (!anchor || !editable) return;
      let text: string;
      try {
        text = await navigator.clipboard.readText();
      } catch {
        toast({
          title: "Could not read the clipboard",
          description:
            "The browser did not allow it. Click the cell and press Cmd-V (Ctrl-V) instead.",
          variant: "destructive",
        });
        return;
      }
      onPasteText(anchor, text, targetCellsFor(address));
    },
    [editable, onPasteText, selected, targetCellsFor],
  );

  // A keyboard chord waits for the native event to claim the gesture; if none
  // does within the grace period, the chord is served through the async API.
  const pendingChord = useRef<{
    kind: "copy" | "cut" | "paste";
    timer: ReturnType<typeof setTimeout>;
  } | null>(null);

  const clearPendingChord = useCallback(() => {
    if (pendingChord.current) clearTimeout(pendingChord.current.timer);
    pendingChord.current = null;
  }, []);

  useEffect(() => clearPendingChord, [clearPendingChord]);

  const armChord = useCallback(
    (kind: "copy" | "cut" | "paste") => {
      clearPendingChord();
      pendingChord.current = {
        kind,
        timer: setTimeout(() => {
          pendingChord.current = null;
          if (kind === "copy") copyCell();
          else if (kind === "cut") cutCell();
          else void pasteIntoCell();
        }, NATIVE_CLIPBOARD_GRACE_MS),
      };
    },
    [clearPendingChord, copyCell, cutCell, pasteIntoCell],
  );

  /** The grid may act on a native clipboard event: a cell is current, no editor is open, and no text is highlighted. */
  const nativeEventIsOurs = useCallback(
    () => selected !== null && editing === null && !hasTextRangeInGrid(),
    [editing, hasTextRangeInGrid, selected],
  );

  const onCopy = useCallback(
    (e: ReactClipboardEvent<HTMLDivElement>) => {
      if (!nativeEventIsOurs() || selectedCells.length === 0) return;
      const text = selectionText();
      e.clipboardData.setData("text/plain", text);
      e.preventDefault();
      clearPendingChord();
      onCopied?.(selectedCells, text);
    },
    [clearPendingChord, nativeEventIsOurs, onCopied, selectedCells, selectionText],
  );

  const onCut = useCallback(
    (e: ReactClipboardEvent<HTMLDivElement>) => {
      if (!nativeEventIsOurs() || selectedCells.length === 0) return;
      const text = selectionText();
      e.clipboardData.setData("text/plain", text);
      e.preventDefault();
      clearPendingChord();
      onCopied?.(selectedCells, text);
      if (editable) onClearCells(selectedCells);
    },
    [
      clearPendingChord,
      editable,
      nativeEventIsOurs,
      onClearCells,
      onCopied,
      selectedCells,
      selectionText,
    ],
  );

  const onPaste = useCallback(
    (e: ReactClipboardEvent<HTMLDivElement>) => {
      if (!nativeEventIsOurs() || !selected || !editable) return;
      const text = e.clipboardData.getData("text/plain");
      e.preventDefault();
      clearPendingChord();
      onPasteText(selected, text, selectedCells);
    },
    [clearPendingChord, editable, nativeEventIsOurs, onPasteText, selected, selectedCells],
  );

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
          setFocus(null);
          // Always prevent default for Tab and arrows, even when the move is a
          // no-op at an edge: letting Tab escape moves focus out of the grid
          // and the user loses their place.
          e.preventDefault();
          break;
        }
        case "extend": {
          const from = focus ?? selected;
          const next = moveSelection(from, action.move, rowIds, fieldNames);
          if (next) setFocus(sameCell(next, selected) ? null : next);
          e.preventDefault();
          break;
        }
        case "selectAll":
          e.preventDefault();
          selectAll();
          break;
        case "selectRow":
          e.preventDefault();
          selectRow(selected.rowId);
          break;
        case "selectColumn":
          e.preventDefault();
          selectColumn(selected.fieldName);
          break;
        case "fillDown":
          if (editable && range && onFillDown) {
            e.preventDefault();
            onFillDown(rangeRows(range, rowIds, fieldNames));
          }
          break;
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
            onClearCells(selectedCells);
          }
          break;
        case "copy":
        case "cut":
        case "paste":
          // No preventDefault: a real highlighted range inside the grid is the
          // browser's to copy, and the native event (when it fires) must still
          // reach `clipboardHandlers`. The chord is only ARMED; whichever door
          // opens first serves it.
          if (hasTextRangeInGrid()) break;
          if (action.kind !== "copy" && !editable) break;
          armChord(action.kind);
          break;
        case "escape":
          e.preventDefault();
          // First Escape collapses a range to its anchor; the second clears.
          if (focus) setFocus(null);
          else clear();
          break;
      }
    },
    [
      armChord,
      beginEdit,
      clear,
      editable,
      editing,
      fieldNames,
      focus,
      hasTextRangeInGrid,
      onClearCells,
      onFillDown,
      onRedo,
      onUndo,
      range,
      rowIds,
      selectAll,
      selectColumn,
      selectRow,
      selected,
      selectedCells,
    ],
  );

  const isSelected = useCallback(
    (rowId: string, fieldName: string) =>
      selected?.rowId === rowId && selected.fieldName === fieldName,
    [selected],
  );

  const isInRange = useCallback(
    (rowId: string, fieldName: string) => {
      if (!bounds) return false;
      const r = rowIds.indexOf(rowId);
      const c = fieldNames.indexOf(fieldName);
      return r !== -1 && c !== -1 && boundsContain(bounds, r, c);
    },
    [bounds, fieldNames, rowIds],
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
    range,
    bounds,
    selectedCells,
    dragging,
    isSelected,
    isInRange,
    isEditing,
    select,
    extendTo,
    selectRow,
    selectColumn,
    selectAll,
    beginDrag,
    dragOver,
    clear,
    beginEdit,
    endEdit,
    containerRef,
    onKeyDown,
    clipboardHandlers: { onCopy, onCut, onPaste },
    copyCell,
    cutCell,
    pasteIntoCell,
    selectionText,
    refocusGrid,
  };
}
