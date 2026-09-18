/**
 * Grid selection model for user data tables.
 *
 * THE THREE STATES. A spreadsheet grid has three, not two, and collapsing them
 * to two is what made this grid feel like a web page instead of a tool:
 *
 *   1. NOTHING SELECTED  — the grid at rest.
 *   2. SELECTED          — one cell is current. Nothing has changed. You can
 *                          look, copy, and move with the keyboard.
 *   3. EDITING           — a value is being changed.
 *
 * State 2 is the one that was missing, and its absence is why every edit needed
 * a double-click and why arrow keys, Tab, copy and fill-down were all
 * impossible: none of them mean anything without a notion of "the current cell".
 *
 * 🚨 THE CLICK LAW — a single click may SELECT a cell, TOGGLE a two-state
 * value, or OPEN a chooser. It may NEVER drop the user into a free-text buffer.
 * Opening a menu is not a mutation and toggling a checkbox is instantly
 * reversible, but landing in a text buffer turns every attempt to select-and-
 * copy into an accidental edit. `directClickKinds()` below is the whole list of
 * what a single click may act on; adding a free-text editor to it is a defect.
 *
 * A CHOOSER OPENS ON THE SECOND CLICK. A choice cell's first click SELECTS it
 * (so Cmd-C, Cmd-X, the arrow keys and the right-click menu all have a current
 * cell); a click on the cell that is ALREADY selected opens the option list —
 * the Airtable gesture. Opening the chooser on the very first click moved
 * focus into its search box, and every keyboard shortcut then went to that box
 * instead of the grid: a choice column could not be copied at all (2026-09-14).
 * Checkboxes and ratings stay one-click: a mis-click on those is instantly
 * undone in place and steals no focus.
 *
 * CLIPBOARD KEYS. Cmd-C / Cmd-X / Cmd-V on a selected cell act on THAT CELL —
 * copy its value, cut it (copy + clear), paste over it. A paste carrying a
 * spreadsheet block (tabs / line breaks) lands as a block from the selected
 * cell downward and rightward (`grid-clipboard.ts`). None of these need an
 * editor open, which is the whole point: a normal table copies what you point
 * at, not only what you are typing into.
 *
 * Addresses are (rowId, fieldName), never (rowIndex, colIndex): the grid
 * reloads after every write, and realtime reorders rows underneath the user. An
 * index-based selection silently jumps to a DIFFERENT cell when that happens —
 * and the next keystroke then edits the wrong row.
 *
 * Pure module: no React, no DOM. Everything here is a function of the current
 * address and the row/field lists, which is what makes the navigation testable
 * without mounting a grid.
 */

export type CellAddress = { rowId: string; fieldName: string };

export type GridMove =
  | "up"
  | "down"
  | "left"
  | "right"
  | "nextCell"
  | "prevCell"
  | "rowStart"
  | "rowEnd"
  | "gridStart"
  | "gridEnd";

/** What a keystroke means when a cell is selected but NOT being edited. */
export type GridKeyAction =
  | { kind: "move"; move: GridMove }
  /** Shift+arrow: grow the range toward `move`, anchor fixed. */
  | { kind: "extend"; move: GridMove }
  | { kind: "selectAll" }
  | { kind: "selectRow" }
  | { kind: "selectColumn" }
  | { kind: "fillDown" }
  | { kind: "edit" }
  | { kind: "editSeeded"; seed: string }
  | { kind: "clearCell" }
  | { kind: "copy" }
  | { kind: "cut" }
  | { kind: "paste" }
  | { kind: "escape" }
  | null;

// ─── Ranges ─────────────────────────────────────────────────────────────────
//
// A RANGE is an anchor (where the selection started — the cell with the ring)
// and a focus (where it was extended to), both by ADDRESS. The rectangle they
// span is resolved against the grid's current row and column order at the
// moment it is needed, so a range survives a re-sort or a hidden column the
// same way a single selection does: by naming cells, not positions.

export type CellRange = { anchor: CellAddress; focus: CellAddress };

/** The rectangle a range spans, as inclusive indexes into the grid's order. */
export type RangeBounds = { r0: number; r1: number; c0: number; c1: number };

export function rangeBounds(
  range: CellRange,
  rowIds: readonly string[],
  fieldNames: readonly string[],
): RangeBounds | null {
  const ra = rowIds.indexOf(range.anchor.rowId);
  const rf = rowIds.indexOf(range.focus.rowId);
  const ca = fieldNames.indexOf(range.anchor.fieldName);
  const cf = fieldNames.indexOf(range.focus.fieldName);
  if (ra === -1 || rf === -1 || ca === -1 || cf === -1) return null;
  return {
    r0: Math.min(ra, rf),
    r1: Math.max(ra, rf),
    c0: Math.min(ca, cf),
    c1: Math.max(ca, cf),
  };
}

export function rangeSize(bounds: RangeBounds): {
  rows: number;
  cols: number;
  cells: number;
} {
  const rows = bounds.r1 - bounds.r0 + 1;
  const cols = bounds.c1 - bounds.c0 + 1;
  return { rows, cols, cells: rows * cols };
}

export function boundsContain(
  bounds: RangeBounds,
  rowIndex: number,
  colIndex: number,
): boolean {
  return (
    rowIndex >= bounds.r0 &&
    rowIndex <= bounds.r1 &&
    colIndex >= bounds.c0 &&
    colIndex <= bounds.c1
  );
}

/** Every cell of the range in reading order (row by row, left to right). */
export function cellsInRange(
  range: CellRange,
  rowIds: readonly string[],
  fieldNames: readonly string[],
): CellAddress[] {
  const b = rangeBounds(range, rowIds, fieldNames);
  if (!b) return [];
  const out: CellAddress[] = [];
  for (let r = b.r0; r <= b.r1; r += 1) {
    for (let c = b.c0; c <= b.c1; c += 1) {
      out.push({ rowId: rowIds[r], fieldName: fieldNames[c] });
    }
  }
  return out;
}

/** The range as a 2-D grid of addresses — what a block copy serialises. */
export function rangeRows(
  range: CellRange,
  rowIds: readonly string[],
  fieldNames: readonly string[],
): CellAddress[][] {
  const b = rangeBounds(range, rowIds, fieldNames);
  if (!b) return [];
  const rows: CellAddress[][] = [];
  for (let r = b.r0; r <= b.r1; r += 1) {
    const row: CellAddress[] = [];
    for (let c = b.c0; c <= b.c1; c += 1) {
      row.push({ rowId: rowIds[r], fieldName: fieldNames[c] });
    }
    rows.push(row);
  }
  return rows;
}

export function isSingleCellRange(range: CellRange): boolean {
  return sameCell(range.anchor, range.focus);
}

/** The whole row, first column to last — what clicking a row's edge selects. */
export function rowRange(
  rowId: string,
  fieldNames: readonly string[],
): CellRange | null {
  if (fieldNames.length === 0) return null;
  return {
    anchor: { rowId, fieldName: fieldNames[0] },
    focus: { rowId, fieldName: fieldNames[fieldNames.length - 1] },
  };
}

/** The whole column across the page — what clicking a header's edge selects. */
export function columnRange(
  fieldName: string,
  rowIds: readonly string[],
): CellRange | null {
  if (rowIds.length === 0) return null;
  return {
    anchor: { rowId: rowIds[0], fieldName },
    focus: { rowId: rowIds[rowIds.length - 1], fieldName },
  };
}

/** Every cell on the page. */
export function allRange(
  rowIds: readonly string[],
  fieldNames: readonly string[],
): CellRange | null {
  if (rowIds.length === 0 || fieldNames.length === 0) return null;
  return {
    anchor: { rowId: rowIds[0], fieldName: fieldNames[0] },
    focus: {
      rowId: rowIds[rowIds.length - 1],
      fieldName: fieldNames[fieldNames.length - 1],
    },
  };
}

export function sameCell(
  a: CellAddress | null,
  b: CellAddress | null,
): boolean {
  if (!a || !b) return a === b;
  return a.rowId === b.rowId && a.fieldName === b.fieldName;
}

/**
 * Where does `move` land from `current`?
 *
 * Returns null when the move is impossible (no selection, empty grid). Vertical
 * moves CLAMP at the edges — running into the top of the grid should park you
 * on the first row, not clear the selection, because a selection that vanishes
 * when you overshoot loses your place. Horizontal Tab moves WRAP to the next or
 * previous row, which is what makes Tab a usable data-entry gesture.
 */
export function moveSelection(
  current: CellAddress | null,
  move: GridMove,
  rowIds: readonly string[],
  fieldNames: readonly string[],
): CellAddress | null {
  if (rowIds.length === 0 || fieldNames.length === 0) return null;

  const first: CellAddress = { rowId: rowIds[0], fieldName: fieldNames[0] };
  if (!current) return first;

  let r = rowIds.indexOf(current.rowId);
  let c = fieldNames.indexOf(current.fieldName);
  // The selected row or column disappeared (deleted, filtered out, re-sorted
  // off the page). Fall back to the start rather than computing from -1, which
  // would quietly resolve to the last element.
  if (r === -1 || c === -1) return first;

  const lastRow = rowIds.length - 1;
  const lastCol = fieldNames.length - 1;
  const clamp = (n: number, max: number) => Math.min(Math.max(n, 0), max);

  switch (move) {
    case "up":
      r = clamp(r - 1, lastRow);
      break;
    case "down":
      r = clamp(r + 1, lastRow);
      break;
    case "left":
      c = clamp(c - 1, lastCol);
      break;
    case "right":
      c = clamp(c + 1, lastCol);
      break;
    case "rowStart":
      c = 0;
      break;
    case "rowEnd":
      c = lastCol;
      break;
    case "gridStart":
      r = 0;
      c = 0;
      break;
    case "gridEnd":
      r = lastRow;
      c = lastCol;
      break;
    case "nextCell":
      if (c < lastCol) c += 1;
      else if (r < lastRow) {
        r += 1;
        c = 0;
      }
      break;
    case "prevCell":
      if (c > 0) c -= 1;
      else if (r > 0) {
        r -= 1;
        c = lastCol;
      }
      break;
  }

  return { rowId: rowIds[r], fieldName: fieldNames[c] };
}

/**
 * A single printable character typed on a selected cell starts an edit seeded
 * with it — the spreadsheet reflex of "just start typing to replace".
 *
 * Modifier combinations are excluded so Cmd-C / Ctrl-R never get mistaken for
 * typing, and only genuinely printable single characters qualify: `key` is the
 * character itself for those, and a multi-character name ("ArrowUp", "F3") for
 * everything else.
 */
export function isTypingKey(e: {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
}): boolean {
  if (e.ctrlKey || e.metaKey || e.altKey) return false;
  return e.key.length === 1 && e.key !== " ";
}

/**
 * Translate a keystroke into a grid action. Called ONLY when a cell is selected
 * and not being edited — an editor owns its own keys while it is open.
 */
export function classifyGridKey(e: {
  key: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
}): GridKeyAction {
  const mod = e.ctrlKey || e.metaKey;

  // Shift+arrow GROWS the selection instead of moving it — the spreadsheet
  // gesture for "these cells". Shift+Tab stays a move (previous cell).
  const arrowMove: Record<string, GridMove> = {
    ArrowUp: mod ? "gridStart" : "up",
    ArrowDown: mod ? "gridEnd" : "down",
    ArrowLeft: mod ? "rowStart" : "left",
    ArrowRight: mod ? "rowEnd" : "right",
    Home: mod ? "gridStart" : "rowStart",
    End: mod ? "gridEnd" : "rowEnd",
  };
  if (e.key in arrowMove) {
    return { kind: e.shiftKey ? "extend" : "move", move: arrowMove[e.key] };
  }

  switch (e.key) {
    case "Tab":
      return { kind: "move", move: e.shiftKey ? "prevCell" : "nextCell" };
    case "Enter":
    case "F2":
      return { kind: "edit" };
    case " ":
      // Shift+Space selects the row and Ctrl/Cmd+Space the column (Excel);
      // plain Space opens the editor without seeding it, so a boolean or
      // choice cell can be operated entirely from the keyboard.
      if (e.shiftKey) return { kind: "selectRow" };
      if (mod) return { kind: "selectColumn" };
      return { kind: "edit" };
    case "a":
    case "A":
      if (mod) return { kind: "selectAll" };
      break;
    case "d":
    case "D":
      if (mod) return { kind: "fillDown" };
      break;
    case "Escape":
      return { kind: "escape" };
    case "Delete":
    case "Backspace":
      return { kind: "clearCell" };
    case "c":
    case "C":
      if (mod) return { kind: "copy" };
      break;
    case "x":
    case "X":
      if (mod) return { kind: "cut" };
      break;
    case "v":
    case "V":
      if (mod) return { kind: "paste" };
      break;
  }

  if (isTypingKey(e)) return { kind: "editSeeded", seed: e.key };
  return null;
}

/**
 * Editor kinds a SINGLE click may operate directly, without first entering edit
 * mode. See THE CLICK LAW at the top of this file — this list is closed sets
 * and two-state values only, where a mis-click is obvious and instantly undone.
 */
export function directClickKinds(): readonly string[] {
  return ["checkbox", "rating", "select", "multiselect"] as const;
}

export function isDirectClickEditor(editorKind: string | undefined): boolean {
  return editorKind !== undefined && directClickKinds().includes(editorKind);
}

/** Stable DOM key for a cell, so selection can scroll itself into view. */
export function cellDomKey(address: CellAddress): string {
  return `${address.rowId}::${address.fieldName}`;
}
