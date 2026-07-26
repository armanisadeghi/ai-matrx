// logic.ts — pure, deterministic 2048 rules. No React, no DOM.
//
// Kept side-effect free on purpose so the merge/move/win/lose rules can be
// unit-tested headlessly (see logic.test.mjs). The hook layer adds animation,
// input, persistence, and undo on top of these functions.

export const GRID_SIZE = 4;
export const WIN_VALUE = 2048;

export type Direction = 'up' | 'down' | 'left' | 'right';

export interface Tile {
    id: number;
    value: number;
    row: number;
    col: number;
    /** True for the frame a tile is spawned (drives the pop-in animation). */
    isNew: boolean;
    /** True for the frame a tile was formed by a merge (drives the pop animation). */
    isMerged: boolean;
}

export type Cell = Tile | null;
export type Grid = Cell[][]; // grid[row][col]

export interface MoveResult {
    /** Tiles that survive the move, at their new positions. */
    tiles: Tile[];
    /** Consumed tiles, positioned at the cell they merged into (they slide, then vanish). */
    ghosts: Tile[];
    moved: boolean;
    gained: number;
}

export const createEmptyGrid = (): Grid =>
    Array.from({ length: GRID_SIZE }, () => Array.from({ length: GRID_SIZE }, () => null));

export const tilesToGrid = (tiles: Tile[]): Grid => {
    const grid = createEmptyGrid();
    for (const t of tiles) grid[t.row][t.col] = t;
    return grid;
};

export const gridToTiles = (grid: Grid): Tile[] => {
    const out: Tile[] = [];
    for (const row of grid) for (const cell of row) if (cell) out.push(cell);
    return out;
};

export const emptyCells = (grid: Grid): Array<{ row: number; col: number }> => {
    const cells: Array<{ row: number; col: number }> = [];
    for (let r = 0; r < GRID_SIZE; r++) for (let c = 0; c < GRID_SIZE; c++) if (!grid[r][c]) cells.push({ row: r, col: c });
    return cells;
};

// Traversal lines, ordered from the wall the tiles move toward, outward.
const linesFor = (dir: Direction): Array<Array<{ row: number; col: number }>> => {
    const lines: Array<Array<{ row: number; col: number }>> = [];
    const idx = [0, 1, 2, 3];
    if (dir === 'left' || dir === 'right') {
        for (let r = 0; r < GRID_SIZE; r++) {
            const cols = dir === 'left' ? idx : [...idx].reverse();
            lines.push(cols.map((c) => ({ row: r, col: c })));
        }
    } else {
        for (let c = 0; c < GRID_SIZE; c++) {
            const rows = dir === 'up' ? idx : [...idx].reverse();
            lines.push(rows.map((r) => ({ row: r, col: c })));
        }
    }
    return lines;
};

/**
 * Apply a move to the grid. Mutates the tiles' positions/values in place and
 * returns the surviving tiles, the consumed "ghost" tiles (for the slide-then-
 * vanish animation), whether anything moved, and the points gained.
 */
export const applyMove = (grid: Grid, dir: Direction): MoveResult => {
    const tiles: Tile[] = [];
    const ghosts: Tile[] = [];
    let gained = 0;
    let moved = false;

    for (const line of linesFor(dir)) {
        const present = line.map((p) => grid[p.row][p.col]).filter((c): c is Tile => c !== null);
        let target = 0;
        let i = 0;
        while (i < present.length) {
            const a = present[i];
            const dest = line[target];
            const next = present[i + 1];
            if (next && next.value === a.value) {
                // Merge a + next into the destination cell.
                if (a.row !== dest.row || a.col !== dest.col) moved = true;
                else moved = true; // a merge always changes the board
                a.row = dest.row;
                a.col = dest.col;
                a.value *= 2;
                a.isMerged = true;
                a.isNew = false;
                gained += a.value;
                next.row = dest.row;
                next.col = dest.col;
                ghosts.push(next);
                tiles.push(a);
                i += 2;
            } else {
                if (a.row !== dest.row || a.col !== dest.col) moved = true;
                a.row = dest.row;
                a.col = dest.col;
                a.isMerged = false;
                a.isNew = false;
                tiles.push(a);
                i += 1;
            }
            target += 1;
        }
    }

    return { tiles, ghosts, moved, gained };
};

/** Whether any legal move exists (board not full, or an adjacent equal pair exists). */
export const hasMoves = (grid: Grid): boolean => {
    for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
            const cell = grid[r][c];
            if (!cell) return true;
            if (c + 1 < GRID_SIZE && grid[r][c + 1]?.value === cell.value) return true;
            if (r + 1 < GRID_SIZE && grid[r + 1][c]?.value === cell.value) return true;
        }
    }
    return false;
};

export const hasWon = (tiles: Tile[]): boolean => tiles.some((t) => t.value >= WIN_VALUE);
