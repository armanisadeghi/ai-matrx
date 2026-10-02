/**
 * Long-press selection math in buffer cells. Pure; the React layer maps touch points to cells.
 */

export interface Cell {
  col: number;
  /** Absolute buffer row (scrollback included). */
  row: number;
}

/** Characters that belong to a "word" for a long press: paths, URLs, flags and hosts select whole. */
const WORD = /[A-Za-z0-9_\-./~:@%+=,?&#]/;

/** [start, end) of the word at `col` in `line`; a one-cell range on a separator. */
export function wordBounds(line: string, col: number): { start: number; end: number } {
  const chars = Array.from(line);
  if (col < 0 || col >= chars.length || !WORD.test(chars[col] ?? " ")) return { start: col, end: col + 1 };
  let start = col;
  let end = col + 1;
  while (start > 0 && WORD.test(chars[start - 1]!)) start--;
  while (end < chars.length && WORD.test(chars[end]!)) end++;
  return { start, end };
}

/**
 * xterm's `select(column, row, length)` for the span between two cells (either order), where a
 * span wraps at `cols`. `anchor` is the first selected cell; `focus` is included too.
 */
export function spanBetween(anchor: Cell, focus: Cell, cols: number): { col: number; row: number; length: number } {
  const a = anchor.row * cols + anchor.col;
  const b = focus.row * cols + focus.col;
  const from = Math.min(a, b);
  const to = Math.max(a, b);
  return { col: from % cols, row: Math.floor(from / cols), length: to - from + 1 };
}

/** The cell under a point, given the screen element's box and the grid size; clamped to the grid. */
export function cellAt(
  point: { x: number; y: number },
  box: { left: number; top: number; width: number; height: number },
  grid: { cols: number; rows: number; viewportY: number },
): Cell {
  const cw = box.width / Math.max(1, grid.cols);
  const ch = box.height / Math.max(1, grid.rows);
  const col = Math.min(grid.cols - 1, Math.max(0, Math.floor((point.x - box.left) / cw)));
  const screenRow = Math.min(grid.rows - 1, Math.max(0, Math.floor((point.y - box.top) / ch)));
  return { col, row: grid.viewportY + screenRow };
}
