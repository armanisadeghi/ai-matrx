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
  /**
   * Native clipboard events for the container — the Edit-menu / browser
   * right-click door. Spread onto the same element as `onKeyDown`.
   */
  clipboardHandlers: {
    onCopy: (e: ReactClipboardEvent<HTMLDivElement>) => void;
    onCut: (e: ReactClipboardEvent<HTMLDivElement>) => void;
    onPaste: (e: ReactClipboardEvent<HTMLDivElement>) => void;
  };
  /** Copy the selected cell (or `address`) — the context-menu door. */
  copyCell: (address?: CellAddress) => void;
  /** Copy then clear. Refused (no-op) when the grid is not editable. */
  cutCell: (address?: CellAddress) => void;
  /**
   * Paste over the selected cell (or `address`) from the async Clipboard API.
   * Needs a user gesture and, in some browsers, a one-time permission — the
   * failure toast names the keyboard chord as the always-available way in.
   */
  pasteIntoCell: (address?: CellAddress) => Promise<void>;
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
  onCopied?: (address: CellAddress, text: string) => void;
  /** Delete / Backspace on the selected cell, and the second half of a cut. */
  onClearCell: (address: CellAddress) => void;
  /**
   * Clipboard text arrived on a selected cell. The caller decides whether it
   * is one value or a spreadsheet block and writes accordingly.
   */
  onPasteText: (address: CellAddress, text: string) => void;
  onUndo: () => void;
  onRedo: () => void;
}): GridSelectionApi {
  const {
    rowIds,
    fieldNames,
    editable,
    getCellText,
    onCopied,
    onClearCell,
    onPasteText,
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

  // ─── clipboard ──────────────────────────────────────────────────────────

  /** True when the user has real text highlighted inside the grid. */
  const hasTextRangeInGrid = useCallback((): boolean => {
    const sel = typeof window !== "undefined" ? window.getSelection() : null;
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return false;
    const node = sel.getRangeAt(0).commonAncestorContainer;
    return containerRef.current?.contains(node) === true;
  }, []);

  const writeClipboard = useCallback(
    (address: CellAddress, text: string) => {
      if (typeof navigator === "undefined" || !navigator.clipboard) {
        toast({
          title: "Could not copy",
          description: "This browser exposes no clipboard to the page.",
          variant: "destructive",
        });
        return;
      }
      void navigator.clipboard.writeText(text).then(
        () => onCopied?.(address, text),
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

  const copyCell = useCallback(
    (address?: CellAddress) => {
      const target = address ?? selected;
      if (!target) return;
      writeClipboard(target, getCellText(target));
    },
    [getCellText, selected, writeClipboard],
  );

  const cutCell = useCallback(
    (address?: CellAddress) => {
      const target = address ?? selected;
      if (!target || !editable) return;
      writeClipboard(target, getCellText(target));
      onClearCell(target);
    },
    [editable, getCellText, onClearCell, selected, writeClipboard],
  );

  const pasteIntoCell = useCallback(
    async (address?: CellAddress) => {
      const target = address ?? selected;
      if (!target || !editable) return;
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
      onPasteText(target, text);
    },
    [editable, onPasteText, selected],
  );

  // A keyboard chord waits for the native event to claim the gesture; if none
  // does within the grace period, the chord is served through the async API.
  const pendingChord = useRef<{
    kind: "copy" | "cut" | "paste";
    address: CellAddress;
    timer: ReturnType<typeof setTimeout>;
  } | null>(null);

  const clearPendingChord = useCallback(() => {
    if (pendingChord.current) clearTimeout(pendingChord.current.timer);
    pendingChord.current = null;
  }, []);

  useEffect(() => clearPendingChord, [clearPendingChord]);

  const armChord = useCallback(
    (kind: "copy" | "cut" | "paste", address: CellAddress) => {
      clearPendingChord();
      pendingChord.current = {
        kind,
        address,
        timer: setTimeout(() => {
          pendingChord.current = null;
          if (kind === "copy") copyCell(address);
          else if (kind === "cut") cutCell(address);
          else void pasteIntoCell(address);
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
      if (!nativeEventIsOurs() || !selected) return;
      const text = getCellText(selected);
      e.clipboardData.setData("text/plain", text);
      e.preventDefault();
      clearPendingChord();
      onCopied?.(selected, text);
    },
    [clearPendingChord, getCellText, nativeEventIsOurs, onCopied, selected],
  );

  const onCut = useCallback(
    (e: ReactClipboardEvent<HTMLDivElement>) => {
      if (!nativeEventIsOurs() || !selected) return;
      const text = getCellText(selected);
      e.clipboardData.setData("text/plain", text);
      e.preventDefault();
      clearPendingChord();
      onCopied?.(selected, text);
      if (editable) onClearCell(selected);
    },
    [
      clearPendingChord,
      editable,
      getCellText,
      nativeEventIsOurs,
      onClearCell,
      onCopied,
      selected,
    ],
  );

  const onPaste = useCallback(
    (e: ReactClipboardEvent<HTMLDivElement>) => {
      if (!nativeEventIsOurs() || !selected || !editable) return;
      const text = e.clipboardData.getData("text/plain");
      e.preventDefault();
      clearPendingChord();
      onPasteText(selected, text);
    },
    [clearPendingChord, editable, nativeEventIsOurs, onPasteText, selected],
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
        case "cut":
        case "paste":
          // No preventDefault: a real highlighted range inside the grid is the
          // browser's to copy, and the native event (when it fires) must still
          // reach `clipboardHandlers`. The chord is only ARMED; whichever door
          // opens first serves it.
          if (hasTextRangeInGrid()) break;
          if (action.kind !== "copy" && !editable) break;
          armChord(action.kind, selected);
          break;
        case "escape":
          e.preventDefault();
          clear();
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
      hasTextRangeInGrid,
      onClearCell,
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
    clipboardHandlers: { onCopy, onCut, onPaste },
    copyCell,
    cutCell,
    pasteIntoCell,
    refocusGrid,
  };
}
