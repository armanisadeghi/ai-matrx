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
 * WHY THE CORE `Copy` VERB IS NOT DUPLICATED HERE — EXCEPT FOR A RANGE. The
 * menu's own Copy row acts on the scope's `content`, which the grid sets to
 * the clicked cell's text — so "Copy" already copies the cell, exactly the way
 * Excel's does. Cut and Paste are core verbs only on EDITABLE (textarea)
 * menus, and a grid is not a textarea, so they live in the Cell section.
 *
 * That rationale holds for ONE cell and breaks for a RANGE: the scope content
 * is still the single clicked cell, so on a 3-cell selection the core Copy
 * quietly yielded one cell while this section's own "Cut 3 cells" / "Clear 3
 * cells" took all three — a narrower result than the menu promised, nothing
 * saying so, and no way to copy the range from the menu at all. So the Cell
 * section carries its OWN range-aware `Copy n cells` whenever a range is
 * selected. It stays enabled on a view-only table: copying only reads.
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
  ArrowDownToLine,
  ArrowUpAZ,
  ArrowUpDown,
  ClipboardPaste,
  Copy,
  CopyPlus,
  Eraser,
  EyeOff,
  History,
  Link,
  Paintbrush,
  Palette,
  PanelLeft,
  PanelRight,
  Pencil,
  Plus,
  Scissors,
  Settings2,
  Trash2,
  Zap,
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
import {
  STYLE_COLORS,
  STYLE_COLOR_LABELS,
  type StyleColor,
} from "./table-style";

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

/**
 * Why a write is unavailable. `readOnlyReason` overrides the default sentence,
 * because the default one lies to the owner of a PLATFORM EXAMPLE table: that
 * account IS the owner, and there is no edit access to ask for. Found on
 * independent review 2026-09-15.
 */
function viewOnlyGate(readOnly: boolean, reason?: string): string | undefined {
  return readOnly ? (reason ?? VIEW_ONLY) : undefined;
}

/**
 * The manual-highlight palette as a submenu: one row per color plus Clear.
 * `current` marks the color already applied so the user sees what they have.
 * Colors are the choice-chip palette (`table-style.ts`), never a picker.
 */
export function buildHighlightSubmenu(opts: {
  id: string;
  label: string;
  current: StyleColor | null | undefined;
  disabled?: boolean;
  onPick: (color: StyleColor | null) => void;
}): ContextMenuExtraItem {
  const children: ContextMenuExtraItem[] = STYLE_COLORS.map((color) => ({
    kind: "item",
    id: `${opts.id}-${color}`,
    label: STYLE_COLOR_LABELS[color],
    icon: Palette,
    hint: opts.current === color ? "✓" : undefined,
    onSelect: () => opts.onPick(color),
  }));
  children.push({ kind: "separator", id: `${opts.id}-sep` });
  children.push({
    kind: "item",
    id: `${opts.id}-clear`,
    label: "Clear highlight",
    icon: Eraser,
    disabled: !opts.current,
    onSelect: () => opts.onPick(null),
  });
  return {
    kind: "submenu",
    id: opts.id,
    label: opts.label,
    icon: Paintbrush,
    disabled: opts.disabled,
    children,
  };
}

export function buildGridCellMenuSection(opts: {
  cell: {
    address: CellAddress;
    displayName: string;
    /** The manual highlight this cell carries, if any. */
    highlight?: StyleColor | null;
  } | null;
  /**
   * When the right-clicked cell sits inside an extended RANGE, every cell of
   * that range — the menu then acts on all of them ("Cut 12 cells"). Null or
   * a single address means the menu acts on the one cell.
   */
  rangeCells?: CellAddress[] | null;
  readOnly: boolean;
  /** Overrides the default view-only sentence when it would be untrue. */
  readOnlyReason?: string;
  /** True when a CELL is what the user right-clicked — see `primary` in v3 types. */
  primary?: boolean;
  on: {
    /** Copy the range to the clipboard as TSV. Range only — see the header. */
    copy: (address: CellAddress) => void;
    cut: (address: CellAddress) => void;
    paste: (address: CellAddress) => void;
    clear: (address: CellAddress) => void;
    clearMany: (addresses: CellAddress[]) => void;
    edit: (address: CellAddress) => void;
    /** Copy the range's first row down over the rest (Cmd-D). */
    fillDown: () => void;
    highlight: (address: CellAddress, color: StyleColor | null) => void;
    highlightMany: (addresses: CellAddress[], color: StyleColor | null) => void;
  };
  unavailable?: AvailabilityMap;
}): ContextMenuExtraSection {
  const { cell, readOnly, on } = opts;
  const address = cell?.address ?? null;
  const many =
    opts.rangeCells && opts.rangeCells.length > 1 ? opts.rangeCells : null;
  const n = many?.length ?? 1;
  const gate = !cell ? needs("a cell") : viewOnlyGate(readOnly, opts.readOnlyReason);
  const rowsSpanned = many ? new Set(many.map((c) => c.rowId)).size : 1;

  const items: ContextMenuExtraItem[] = [
    // Range only: for one cell the core Copy verb already copies it, and a
    // second Copy row would just say the same thing twice.
    ...(many
      ? [
          {
            kind: "item" as const,
            id: "grid-cell-copy",
            label: `Copy ${n} cells`,
            icon: Copy,
            hint: "⌘C",
            // `copyCell(address)` copies the range when the address is in it.
            onSelect: () => address && on.copy(address),
          },
        ]
      : []),
    {
      kind: "item",
      id: "grid-cell-cut",
      label: many ? `Cut ${n} cells` : "Cut cell",
      icon: Scissors,
      hint: "⌘X",
      // `cutCell(address)` acts on the range when the address is inside it.
      onSelect: () => address && on.cut(address),
    },
    {
      kind: "item",
      id: "grid-cell-paste",
      label: many ? `Paste over ${n} cells` : "Paste",
      icon: ClipboardPaste,
      hint: "⌘V",
      onSelect: () => address && on.paste(address),
    },
    {
      kind: "item",
      id: "grid-cell-clear",
      label: many ? `Clear ${n} cells` : "Clear cell",
      icon: Eraser,
      hint: "⌫",
      onSelect: () =>
        many ? on.clearMany(many) : address && on.clear(address),
    },
    {
      kind: "item",
      id: "grid-cell-fill-down",
      label: "Fill down",
      icon: ArrowDownToLine,
      hint: "⌘D",
      onSelect: () => on.fillDown(),
    },
    {
      kind: "item",
      id: "grid-cell-edit",
      label: "Edit cell",
      icon: Pencil,
      hint: "↵",
      onSelect: () => address && on.edit(address),
    },
    buildHighlightSubmenu({
      id: "grid-cell-highlight",
      label: many ? `Highlight ${n} cells` : "Highlight cell",
      current: many ? null : cell?.highlight,
      onPick: (color) =>
        many ? on.highlightMany(many, color) : address && on.highlight(address, color),
    }),
  ];

  return withAvailability(
    {
      id: "grid-cell",
      label: many
        ? `Cells · ${n} selected`
        : cell
          ? `Cell · ${cell.displayName}`
          : "Cell",
      icon: Pencil,
      anchor: "after-clipboard",
      primary: opts.primary,
      items,
    },
    {
      // Copy reads; it survives a view-only share, unlike cut/paste/clear.
      "grid-cell-copy": !cell ? needs("a cell") : undefined,
      "grid-cell-cut": gate,
      "grid-cell-paste": gate,
      "grid-cell-clear": gate,
      "grid-cell-fill-down":
        gate ?? (rowsSpanned < 2 ? "Select cells in two or more rows first" : undefined),
      "grid-cell-edit": gate ?? (many ? "Select one cell to edit it" : undefined),
      "grid-cell-highlight": gate,
      ...opts.unavailable,
    },
  );
}

export function buildGridRowMenuSection(opts: {
  row: { id: string; label: string; highlight?: StyleColor | null } | null;
  readOnly: boolean;
  /** Overrides the default view-only sentence when it would be untrue. */
  readOnlyReason?: string;
  /** True when the ROW (its checkbox / actions, not a cell) is what was right-clicked. */
  primary?: boolean;
  on: {
    /** Open the new-row form. Rows are unordered, so there is no above/below. */
    add: () => void;
    edit: (rowId: string) => void;
    duplicate: (rowId: string) => void;
    copy: (rowId: string) => void;
    history: (rowId: string) => void;
    reference: (rowId: string) => void;
    remove: (rowId: string) => void;
    highlight: (rowId: string, color: StyleColor | null) => void;
    /** Run one of the table's row actions (row-actions.ts) on this row. */
    runAction?: (rowId: string, actionId: string) => void;
  };
  /** The table's row actions; the submenu is absent when there are none. */
  actions?: readonly { id: string; name: string; description: string }[];
  unavailable?: AvailabilityMap;
}): ContextMenuExtraSection {
  const { row, readOnly, on } = opts;
  const id = row?.id ?? null;
  const noRow = !row ? needs("a row") : undefined;
  const writeGate = noRow ?? viewOnlyGate(readOnly, opts.readOnlyReason);

  const items: ContextMenuExtraItem[] = [
    {
      kind: "item",
      id: "grid-row-add",
      label: "Add row…",
      icon: Plus,
      onSelect: () => on.add(),
    },
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
    buildHighlightSubmenu({
      id: "grid-row-highlight",
      label: "Highlight row",
      current: row?.highlight,
      onPick: (color) => id && on.highlight(id, color),
    }),
    // The table's own buttons, one click from the row: the same list the
    // Actions cell and the selection bar show.
    ...(opts.actions && opts.actions.length > 0
      ? [
          {
            kind: "submenu" as const,
            id: "grid-row-run-action",
            label: "Run action",
            icon: Zap,
            children: opts.actions.map((a) => ({
              kind: "item" as const,
              id: `grid-row-run-action-${a.id}`,
              label: a.name,
              icon: Zap,
              onSelect: () => id && on.runAction?.(id, a.id),
            })),
          },
        ]
      : []),
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
      primary: opts.primary,
      items,
    },
    {
      "grid-row-add": viewOnlyGate(readOnly, opts.readOnlyReason),
      "grid-row-edit": writeGate,
      "grid-row-duplicate": writeGate,
      "grid-row-copy": noRow,
      "grid-row-history": noRow,
      "grid-row-reference": noRow,
      "grid-row-highlight": writeGate,
      "grid-row-run-action": writeGate,
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
    /** The manual highlight the whole column carries, if any. */
    highlight?: StyleColor | null;
    /** True for a choice / multi-choice / boolean column — one that can drive color-by. */
    canColorBy: boolean;
    /** True when the table is currently colored BY this column. */
    isColorBy: boolean;
  } | null;
  readOnly: boolean;
  /** Overrides the default view-only sentence when it would be untrue. */
  readOnlyReason?: string;
  /** The table has one column left — it cannot be removed. */
  isOnlyColumn: boolean;
  /** True when the column HEADER is what the user right-clicked. */
  primary?: boolean;
  on: {
    /** Rename the column in place, in its header. */
    rename: (fieldName: string) => void;
    sortAsc: (fieldName: string) => void;
    sortDesc: (fieldName: string) => void;
    clearSort: () => void;
    hide: (fieldName: string) => void;
    configure: (fieldName: string) => void;
    remove: (fieldName: string) => void;
    /** Open the new-column form so the column lands beside this one. */
    insert: (fieldName: string, side: "left" | "right") => void;
    highlight: (fieldName: string, color: StyleColor | null) => void;
    /** Color rows by this column's option colors, or stop (`false`). */
    colorBy: (fieldName: string, on: boolean) => void;
    /** Open the table-wide Colors dialog (color-by + rules). */
    colors: () => void;
  };
  unavailable?: AvailabilityMap;
}): ContextMenuExtraSection {
  const { column, readOnly, isOnlyColumn, on } = opts;
  const name = column?.fieldName ?? null;
  const noColumn = !column ? needs("a column") : undefined;
  const writeGate = noColumn ?? viewOnlyGate(readOnly, opts.readOnlyReason);

  // Ordered the way a header click is used: name it, arrange it, add beside
  // it, color it, and the destructive row last (Airtable's field menu order).
  const items: ContextMenuExtraItem[] = [
    {
      kind: "item",
      id: "grid-col-rename",
      label: "Rename column",
      icon: Pencil,
      onSelect: () => name && on.rename(name),
    },
    {
      kind: "item",
      id: "grid-col-configure",
      label: "Column settings…",
      icon: Settings2,
      onSelect: () => name && on.configure(name),
    },
    { kind: "separator", id: "grid-col-sep-name" },
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
    { kind: "separator", id: "grid-col-sep-insert" },
    {
      kind: "item",
      id: "grid-col-insert-left",
      label: "Insert column left…",
      icon: PanelLeft,
      onSelect: () => name && on.insert(name, "left"),
    },
    {
      kind: "item",
      id: "grid-col-insert-right",
      label: "Insert column right…",
      icon: PanelRight,
      onSelect: () => name && on.insert(name, "right"),
    },
    { kind: "separator", id: "grid-col-sep-color" },
    buildHighlightSubmenu({
      id: "grid-col-highlight",
      label: "Highlight column",
      current: column?.highlight,
      onPick: (color) => name && on.highlight(name, color),
    }),
    {
      kind: "item",
      id: "grid-col-color-by",
      label: column?.isColorBy
        ? "Stop coloring rows by this column"
        : "Color rows by this column",
      icon: Palette,
      onSelect: () => name && on.colorBy(name, !column?.isColorBy),
    },
    {
      kind: "item",
      id: "grid-col-colors",
      label: "Table colors…",
      icon: Paintbrush,
      onSelect: () => on.colors(),
    },
    { kind: "separator", id: "grid-col-sep-delete" },
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
      primary: opts.primary,
      items,
    },
    {
      "grid-col-rename": writeGate,
      "grid-col-insert-left": writeGate,
      "grid-col-insert-right": writeGate,
      "grid-col-sort-asc": noColumn,
      "grid-col-sort-desc": noColumn,
      "grid-col-clear-sort":
        noColumn ?? (column && !column.sortedBy ? "Not sorted by this column" : undefined),
      "grid-col-hide": noColumn,
      "grid-col-highlight": writeGate,
      "grid-col-color-by":
        writeGate ??
        (column && !column.canColorBy
          ? "Works on a choice or checkbox column"
          : undefined),
      "grid-col-colors": viewOnlyGate(readOnly, opts.readOnlyReason),
      "grid-col-configure": writeGate,
      "grid-col-delete":
        writeGate ?? (isOnlyColumn ? "A table keeps at least one column" : undefined),
      ...opts.unavailable,
    },
  );
}
