/**
 * A new tile or sticky never lands on older drawings: the shapes layer paints over tiles, so a
 * Note tile added under a rectangle and a pen stroke had its header covered.
 */
import { BoardStore } from "../board/board-store";
import { createStickyOnBoard } from "../home/canvas-text-create";
import { boundsOfPoints } from "../engine/shapes";
import { rectsIntersect } from "../engine/camera";

type Tile = { id: string; rect: { x: number; y: number; w: number; h: number } };

const rectangle = { id: "r1", kind: "rect" as const, points: [{ x: 0, y: 0 }, { x: 500, y: 400 }] };
const stroke = { id: "p1", kind: "pen" as const, points: [{ x: 100, y: 100 }, { x: 300, y: 250 }, { x: 450, y: 120 }] };

describe("new objects land clear of existing content", () => {
  it("addTile at the view centre avoids a rectangle and a pen stroke", () => {
    const board = new BoardStore<Tile>({ tiles: [], shapes: [rectangle, stroke] });
    const placed = board.addTile({ id: "n1", rect: { x: 0, y: 0, w: 480, h: 360 } }, { x: 250, y: 200 });
    expect(rectsIntersect(placed, boundsOfPoints(rectangle.points))).toBe(false);
    expect(rectsIntersect(placed, boundsOfPoints(stroke.points))).toBe(false);
  });

  it("a sticky made at the view centre avoids older content, a clicked point is kept", () => {
    const board = new BoardStore<Tile>({ tiles: [{ id: "t", rect: { x: -200, y: -200, w: 480, h: 360 } }], shapes: [rectangle] });
    const store = { getSize: () => ({ w: 1000, h: 800 }), getCamera: () => ({ x: 500 - 250, y: 400 - 200, z: 1 }), getSelection: () => null, select: () => {}, setEditing: () => {} };
    const id = createStickyOnBoard(board, store as never);
    const sticky = board.getShapes().find((s) => s.id === id)!;
    const box = boundsOfPoints(sticky.points);
    expect(rectsIntersect(box, boundsOfPoints(rectangle.points))).toBe(false);
    expect(rectsIntersect(box, { x: -200, y: -200, w: 480, h: 360 })).toBe(false);
    const clicked = createStickyOnBoard(board, store as never, { x: 250, y: 200 });
    const cb = boundsOfPoints(board.getShapes().find((s) => s.id === clicked)!.points);
    expect(cb.x + cb.w / 2).toBe(250);
  });
});
