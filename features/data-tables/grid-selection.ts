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
  | { kind: "edit" }
  | { kind: "editSeeded"; seed: string }
  | { kind: "clearCell" }
  | { kind: "copy" }
  | { kind: "escape" }
  | null;

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

  switch (e.key) {
    case "ArrowUp":
      return { kind: "move", move: mod ? "gridStart" : "up" };
    case "ArrowDown":
      return { kind: "move", move: mod ? "gridEnd" : "down" };
    case "ArrowLeft":
      return { kind: "move", move: mod ? "rowStart" : "left" };
    case "ArrowRight":
      return { kind: "move", move: mod ? "rowEnd" : "right" };
    case "Tab":
      return { kind: "move", move: e.shiftKey ? "prevCell" : "nextCell" };
    case "Home":
      return { kind: "move", move: mod ? "gridStart" : "rowStart" };
    case "End":
      return { kind: "move", move: mod ? "gridEnd" : "rowEnd" };
    case "Enter":
    case "F2":
      return { kind: "edit" };
    case " ":
      // Space opens the editor without seeding it, so a boolean or choice cell
      // can be operated entirely from the keyboard.
      return { kind: "edit" };
    case "Escape":
      return { kind: "escape" };
    case "Delete":
    case "Backspace":
      return { kind: "clearCell" };
    case "c":
    case "C":
      if (mod) return { kind: "copy" };
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
