/**
 * THE USER-DATA-TABLE GRID'S RIGHT-CLICK MENU — one definition of what you can
 * do to a CELL, a ROW and a COLUMN of a `udt_datasets` grid, shared by every
 * host that mounts `UserTableViewer` (the `/data/[id]` route, the floating
 * `UserTableWindow`, `QuickDataSheet`, the dataset tool-call overlay, the
 * canvas table artifact, the resource picker). The grid mounts ONE
 * `NonEditableContextMenu` around its scroll container and resolves the
 * clicked cell / row / column on open (`resolveGridMenuTarget`), so the same
 * menu says "Cut cell" on a value and "Sort A→Z" on a header.
 *
 * WHY THE CORE `Copy` VERB IS NOT DUPLICATED HERE. The menu's own Copy row
 * acts on the scope's `content`, which the grid sets to the clicked cell's
 * text — so "Copy" already copies the cell, exactly the way Excel's does. Cut
 * and Paste are core verbs only on EDITABLE (textarea) menus, and a grid is
 * not a textarea, so they live in the Cell section instead.
 *
 * 🚨 NO NEW WRITE PATH LIVES HERE. Every item delegates to a handler the grid
 * already has (its toolbar buttons, header menu, row actions and keyboard
 * chords all call the same ones). THE CONSISTENCY STEP: an action this table
 * cannot take (view-only share, last column) stays visible and disabled with
 * the reason — never dropped. THE DENSITY LAW: labels only; the shortcut
 * rides as a right-aligned hint.
 *
 * Pure module (`build*`, no hooks) — the target resolver reads DOM attributes
 * but touches no React.
 */

import {
  ArrowDownAZ,
  ArrowUpAZ,
  ArrowUpDown,
  ClipboardPaste,
  Copy,
  CopyPlus,
  Eraser,
  EyeOff,
  History,
  Link,
  Pencil,
  Scissors,
  Settings2,
  Trash2,
} from "lucide-react";

import type {
  ContextMenuExtraItem,
  ContextMenuExtraSection,
} from "@/features/context-menu-v3/types";
import {
  needs,
  withAvailability,
  type AvailabilityMap,
} from "@/features/context-menu-v3/utils/availability";

import type { CellAddress } from "./grid-selection";

// ─── DOM anchors ────────────────────────────────────────────────────────────
//
// The WRITER (the grid's <tr> / <th> / <td>) and the READER (`resolveGridMenuTarget`)
// are different places in a 3,000-line file; naming the attributes once is what
// keeps a typo from silently degrading the menu to table-level items.

/** Carries a row's id on its `<tr>`. */
export const GRID_ROW_DOM_ATTR = "data-row-id";
/** Carries a column's machine field name on its header `<th>`. */
export const GRID_FIELD_DOM_ATTR = "data-field";
/** Carries `cellDomKey(address)` on a body `<td>` (owned by the grid already). */
export const GRID_CELL_DOM_ATTR = "data-cell";

export type GridMenuTarget = {
  /** The body cell under the cursor, if any. */
  cell: CellAddress | null;
  /** The row under the cursor — from the cell, or from the actions column. */
  rowId: string | null;
  /** The column under the cursor — from the cell, or from the header. */
  fieldName: string | null;
};

export const EMPTY_GRID_MENU_TARGET: GridMenuTarget = {
  cell: null,
  rowId: null,
  fieldName: null,
};

/** Inverse of `cellDomKey` — the row id is a UUID and never contains `::`. */
export function parseCellDomKey(key: string | null): CellAddress | null {
  if (!key) return null;
  const at = key.indexOf("::");
  if (at <= 0 || at === key.length - 2) return null;
  return { rowId: key.slice(0, at), fieldName: key.slice(at + 2) };
}

/** Which cell / row / column did the user right-click? */
export function resolveGridMenuTarget(
  target: HTMLElement | null,
): GridMenuTarget {
  if (!target || typeof target.closest !== "function") {
    return EMPTY_GRID_MENU_TARGET;
  }
  const cell = parseCellDomKey(
    target.closest(`[${GRID_CELL_DOM_ATTR}]`)?.getAttribute(GRID_CELL_DOM_ATTR) ??
      null,
  );
  const rowId =
    cell?.rowId ??
    target.closest(`[${GRID_ROW_DOM_ATTR}]`)?.getAttribute(GRID_ROW_DOM_ATTR) ??
    null;
  const fieldName =
    cell?.fieldName ??
    target
      .closest(`[${GRID_FIELD_DOM_ATTR}]`)
      ?.getAttribute(GRID_FIELD_DOM_ATTR) ??
    null;
  return { cell, rowId, fieldName };
}

// ─── Sections ───────────────────────────────────────────────────────────────

const VIEW_ONLY = "View-only table — ask the owner for edit access";

export function buildGridCellMenuSection(opts: {
  cell: { address: CellAddress; displayName: string } | null;
  readOnly: boolean;
  on: {
    cut: (address: CellAddress) => void;
    paste: (address: CellAddress) => void;
    clear: (address: CellAddress) => void;
    edit: (address: CellAddress) => void;
  };
  unavailable?: AvailabilityMap;
}): ContextMenuExtraSection {
  const { cell, readOnly, on } = opts;
  const address = cell?.address ?? null;
  const gate = !cell ? needs("a cell") : readOnly ? VIEW_ONLY : undefined;

  const items: ContextMenuExtraItem[] = [
    {
      kind: "item",
      id: "grid-cell-cut",
      label: "Cut cell",
      icon: Scissors,
      hint: "⌘X",
      onSelect: () => address && on.cut(address),
    },
    {
      kind: "item",
      id: "grid-cell-paste",
      label: "Paste",
      icon: ClipboardPaste,
      hint: "⌘V",
      onSelect: () => address && on.paste(address),
    },
    {
      kind: "item",
      id: "grid-cell-clear",
      label: "Clear cell",
      icon: Eraser,
      hint: "⌫",
      onSelect: () => address && on.clear(address),
    },
    {
      kind: "item",
      id: "grid-cell-edit",
      label: "Edit cell",
      icon: Pencil,
      hint: "↵",
      onSelect: () => address && on.edit(address),
    },
  ];

  return withAvailability(
    {
      id: "grid-cell",
      label: cell ? `Cell · ${cell.displayName}` : "Cell",
      icon: Pencil,
      anchor: "after-clipboard",
      items,
    },
    {
      "grid-cell-cut": gate,
      "grid-cell-paste": gate,
      "grid-cell-clear": gate,
      "grid-cell-edit": gate,
      ...opts.unavailable,
    },
  );
}

export function buildGridRowMenuSection(opts: {
  row: { id: string; label: string } | null;
  readOnly: boolean;
  on: {
    edit: (rowId: string) => void;
    duplicate: (rowId: string) => void;
    copy: (rowId: string) => void;
    history: (rowId: string) => void;
    reference: (rowId: string) => void;
    remove: (rowId: string) => void;
  };
  unavailable?: AvailabilityMap;
}): ContextMenuExtraSection {
  const { row, readOnly, on } = opts;
  const id = row?.id ?? null;
  const noRow = !row ? needs("a row") : undefined;
  const writeGate = noRow ?? (readOnly ? VIEW_ONLY : undefined);

  const items: ContextMenuExtraItem[] = [
    {
      kind: "item",
      id: "grid-row-edit",
      label: "Edit row…",
      icon: Pencil,
      onSelect: () => id && on.edit(id),
    },
    {
      kind: "item",
      id: "grid-row-duplicate",
      label: "Duplicate row",
      icon: CopyPlus,
      onSelect: () => id && on.duplicate(id),
    },
    {
      kind: "item",
      id: "grid-row-copy",
      label: "Copy row",
      icon: Copy,
      onSelect: () => id && on.copy(id),
    },
    {
      kind: "item",
      id: "grid-row-history",
      label: "Row history",
      icon: History,
      onSelect: () => id && on.history(id),
    },
    {
      kind: "item",
      id: "grid-row-reference",
      label: "Get reference…",
      icon: Link,
      onSelect: () => id && on.reference(id),
    },
    {
      kind: "item",
      id: "grid-row-delete",
      label: "Delete row…",
      icon: Trash2,
      destructive: true,
      onSelect: () => id && on.remove(id),
    },
  ];

  return withAvailability(
    {
      id: "grid-row",
      label: row ? `Row · ${row.label}` : "Row",
      icon: ArrowUpDown,
      anchor: "after-clipboard",
      items,
    },
    {
      "grid-row-edit": writeGate,
      "grid-row-duplicate": writeGate,
      "grid-row-copy": noRow,
      "grid-row-history": noRow,
      "grid-row-reference": noRow,
      "grid-row-delete": writeGate,
      ...opts.unavailable,
    },
  );
}

export function buildGridColumnMenuSection(opts: {
  column: {
    fieldName: string;
    displayName: string;
    /** Direction the grid is sorted by THIS column, or null. */
    sortedBy: "asc" | "desc" | null;
  } | null;
  readOnly: boolean;
  /** The table has one column left — it cannot be removed. */
  isOnlyColumn: boolean;
  on: {
    sortAsc: (fieldName: string) => void;
    sortDesc: (fieldName: string) => void;
    clearSort: () => void;
    hide: (fieldName: string) => void;
    configure: (fieldName: string) => void;
    remove: (fieldName: string) => void;
  };
  unavailable?: AvailabilityMap;
}): ContextMenuExtraSection {
  const { column, readOnly, isOnlyColumn, on } = opts;
  const name = column?.fieldName ?? null;
  const noColumn = !column ? needs("a column") : undefined;
  const writeGate = noColumn ?? (readOnly ? VIEW_ONLY : undefined);

  const items: ContextMenuExtraItem[] = [
    {
      kind: "item",
      id: "grid-col-sort-asc",
      label: "Sort A→Z",
      icon: ArrowUpAZ,
      onSelect: () => name && on.sortAsc(name),
    },
    {
      kind: "item",
      id: "grid-col-sort-desc",
      label: "Sort Z→A",
      icon: ArrowDownAZ,
      onSelect: () => name && on.sortDesc(name),
    },
    {
      kind: "item",
      id: "grid-col-clear-sort",
      label: "Clear sort",
      icon: ArrowUpDown,
      onSelect: () => on.clearSort(),
    },
    {
      kind: "item",
      id: "grid-col-hide",
      label: "Hide column",
      icon: EyeOff,
      onSelect: () => name && on.hide(name),
    },
    {
      kind: "item",
      id: "grid-col-configure",
      label: "Column settings…",
      icon: Settings2,
      onSelect: () => name && on.configure(name),
    },
    {
      kind: "item",
      id: "grid-col-delete",
      label: "Delete column…",
      icon: Trash2,
      destructive: true,
      onSelect: () => name && on.remove(name),
    },
  ];

  return withAvailability(
    {
      id: "grid-column",
      label: column ? `Column · ${column.displayName}` : "Column",
      icon: Settings2,
      anchor: "after-clipboard",
      items,
    },
    {
      "grid-col-sort-asc": noColumn,
      "grid-col-sort-desc": noColumn,
      "grid-col-clear-sort":
        noColumn ?? (column && !column.sortedBy ? "Not sorted by this column" : undefined),
      "grid-col-hide": noColumn,
      "grid-col-configure": writeGate,
      "grid-col-delete":
        writeGate ?? (isOnlyColumn ? "A table keeps at least one column" : undefined),
      ...opts.unavailable,
    },
  );
}
