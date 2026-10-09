/**
 * Arrange acts on every object on the board, not only tiles (FigJam): 12 stickies in a 4x3 grid
 * -> One column used to say "Already arranged that way" and move nothing, because the arrange scene
 * was built from tiles alone.
 */
import { BoardStore } from "../board/board-store";
import { runArrange } from "../board/arrange-board";
import { makeSticky } from "../engine/canvas-text";
import { boundsOfPoints } from "../engine/shapes";

type Tile = { id: string; rect: { x: number; y: number; w: number; h: number } };
const opts = { groupOf: () => "note", order: ["note"], frameTitle: (g: string) => g };

function stickyGrid() {
  const shapes = Array.from({ length: 12 }, (_, i) =>
    makeSticky({ x: (i % 4) * 300 + 110, y: Math.floor(i / 4) * 300 + 110 }, { id: `s${i}` }),
  );
  return new BoardStore<Tile>({ tiles: [], shapes });
}

const rects = (b: BoardStore<Tile>) => b.getShapes().map((s) => boundsOfPoints(s.points));

describe("Arrange on canvas objects", () => {
  it("One column stacks 12 stickies in a 4x3 grid", () => {
    const board = stickyGrid();
    const moved = runArrange(board, { kind: "layout", layout: "column" }, opts);
    expect(moved).toBeGreaterThan(0);
    const xs = new Set(rects(board).map((r) => r.x));
    expect(xs.size).toBe(1);
    const ys = rects(board).map((r) => r.y);
    expect(new Set(ys).size).toBe(12);
  });

  it("One row, Grid, Tidy and Align all move stickies", () => {
    for (const command of [
      { kind: "layout", layout: "row" },
      { kind: "layout", layout: "tidy" },
      { kind: "align", edge: "left" },
      { kind: "align", edge: "top" },
      { kind: "distribute", axis: "horizontal" },
    ] as const) {
      const board = stickyGrid();
      // Make the positions irregular so Distribute has work to do.
      board.moveMany([{ id: "s1", x: 400, y: 0 }]);
      expect(runArrange(board, command, opts)).toBeGreaterThan(0);
    }
  });

  it("acts on the selection only when given one", () => {
    const board = stickyGrid();
    const before = rects(board);
    runArrange(board, { kind: "layout", layout: "column" }, { ...opts, only: ["s0", "s1", "s2"] });
    const after = rects(board);
    expect(after.slice(3)).toEqual(before.slice(3));
    expect(new Set(after.slice(0, 3).map((r) => r.x)).size).toBe(1);
  });
});
