/**
 * Triangle, diamond, star and rounded rectangle are shapes like the rectangle and oval: they hit-test
 * on their own outline, serialize, resize (box kinds), hold text and can be bound to.
 */
import { BoardStore } from "../board/board-store";
import { hitShape, isBoxed, isBoxKind, parseShape, serializeShape, shapePolygon, textCapable, type BoardShape, type ShapeKind } from "../engine/shapes";

type Tile = { id: string; rect: { x: number; y: number; w: number; h: number } };
const make = (kind: ShapeKind): BoardShape => ({ id: `${kind}:1`, kind, points: [{ x: 0, y: 0 }, { x: 200, y: 200 }] });
const NEW_KINDS: ShapeKind[] = ["rounded", "triangle", "diamond", "star"];

describe("the shapes menu's new shapes", () => {
  it.each(NEW_KINDS)("%s is a box kind that holds text and can be bound to", (kind) => {
    expect(isBoxKind(kind)).toBe(true);
    expect(isBoxed(kind)).toBe(true);
    expect(textCapable(kind)).toBe(true);
  });

  it.each(NEW_KINDS)("%s round-trips through the board document", (kind) => {
    const parsed = parseShape({ ...serializeShape(make(kind)) });
    expect(parsed.shape?.kind).toBe(kind);
  });

  it("a triangle is hit on its edge and (when filled) its body, not in its empty top corner", () => {
    const tri = make("triangle");
    expect(hitShape(tri, { x: 100, y: 100 }, 4, () => undefined)).toBe("interior");
    expect(hitShape({ ...tri, style: { fill: "blue" } }, { x: 100, y: 100 }, 4, () => undefined)).toBe("fill");
    expect(hitShape(tri, { x: 10, y: 10 }, 4, () => undefined)).toBeNull();
    expect(hitShape(tri, { x: 100, y: 0 }, 4, () => undefined)).toBe("stroke");
  });

  it("a diamond misses its corners and a star has ten corners", () => {
    expect(hitShape(make("diamond"), { x: 8, y: 8 }, 4, () => undefined)).toBeNull();
    expect(shapePolygon("star", { x: 0, y: 0, w: 200, h: 200 })).toHaveLength(10);
  });

  it("resizes like a rectangle", () => {
    const board = new BoardStore<Tile>({ tiles: [], shapes: [make("star")] });
    board.resizeShape("star:1", { x: 0, y: 0, w: 400, h: 300 });
    expect(board.getShape("star:1")?.points).toEqual([{ x: 0, y: 0 }, { x: 400, y: 300 }]);
  });
});
