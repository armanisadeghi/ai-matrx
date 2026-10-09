/**
 * SHAPES ARE FIRST-CLASS OBJECTS (tldraw / FigJam / Figma).
 *
 * Pins, on the real board model, camera store and document parser:
 *  - a click INSIDE an unfilled rectangle or oval finds it (on empty board),
 *    a click NEAR a thin line, arrow or pen stroke finds it, a click far away
 *    finds nothing; a stroke beats a hollow interior under it;
 *  - a mixed selection (tiles + shapes) drags as ONE undo step;
 *  - resize maths per kind (box, line, pen scale with the box);
 *  - an arrow bound to a tile follows the tile when it moves;
 *  - style, text and bindings round-trip through save / load, and an old
 *    shape row (id, kind, points only) still parses;
 *  - Fit everything includes shapes; shapes never join the tile life budget.
 */

import { BoardStore } from "../board/board-store";
import { BoardCameraStore } from "../engine/camera-store";
import { parseBoardDocument, serializeBoardDocument, type BoardDocument } from "../board/document";
import {
  type BoardShape,
  connectorEnds,
  hitShape,
  parseShape,
  resizeShapeTo,
  shapeBounds,
  styleOf,
  topShapeAt,
} from "../engine/shapes";
import { groupMoveSet, shiftMoves } from "../engine/selection";

type Tile = { id: string; rect: { x: number; y: number; w: number; h: number } };

const rect = (id: string, x: number, y: number, w: number, h: number, extra: Partial<BoardShape> = {}): BoardShape => ({
  id,
  kind: "rect",
  points: [
    { x, y },
    { x: x + w, y: y + h },
  ],
  ...extra,
});
const noTargets = () => undefined;

describe("hit testing", () => {
  const box = rect("rect:a", 0, 0, 200, 100);
  const oval: BoardShape = { id: "oval:a", kind: "oval", points: [{ x: 300, y: 0 }, { x: 500, y: 100 }] };
  const line: BoardShape = { id: "line:a", kind: "line", points: [{ x: 0, y: 300 }, { x: 200, y: 300 }] };
  const pen: BoardShape = { id: "pen:a", kind: "pen", points: [{ x: 0, y: 500 }, { x: 50, y: 520 }, { x: 100, y: 500 }] };

  it("finds an unfilled rectangle and oval by their interior", () => {
    expect(hitShape(box, { x: 100, y: 50 }, 4, noTargets)).toBe("interior");
    expect(hitShape(oval, { x: 400, y: 50 }, 4, noTargets)).toBe("interior");
    // the oval's bounding-box corner is NOT inside it
    expect(hitShape(oval, { x: 302, y: 2 }, 4, noTargets)).toBeNull();
  });

  it("a filled shape's interior is fill (it wins over a tile under it)", () => {
    const filled = rect("rect:f", 0, 0, 200, 100, { style: { fill: "blue" } });
    expect(hitShape(filled, { x: 100, y: 50 }, 4, noTargets)).toBe("fill");
  });

  it("finds a thin line, an arrow and a pen stroke within the tolerance", () => {
    expect(hitShape(line, { x: 100, y: 306 }, 8, noTargets)).toBe("stroke");
    expect(hitShape(line, { x: 100, y: 330 }, 8, noTargets)).toBeNull();
    expect(hitShape(pen, { x: 25, y: 513 }, 8, noTargets)).toBe("stroke");
    expect(hitShape(pen, { x: 50, y: 560 }, 8, noTargets)).toBeNull();
    expect(hitShape(box, { x: 203, y: 50 }, 8, noTargets)).toBe("stroke");
  });

  it("a stroke beats a hollow interior above it; interiors only count on empty board", () => {
    const inner: BoardShape = { id: "pen:in", kind: "pen", points: [{ x: 50, y: 50 }, { x: 150, y: 50 }] };
    const outer = rect("rect:out", 0, 0, 200, 100);
    // outer drawn later (on top), the pen inside it is still the one you meant
    expect(topShapeAt([inner, outer], { x: 100, y: 52 }, 6, noTargets, { background: true })).toBe("pen:in");
    expect(topShapeAt([inner, outer], { x: 100, y: 80 }, 6, noTargets, { background: true })).toBe("rect:out");
    expect(topShapeAt([inner, outer], { x: 100, y: 80 }, 6, noTargets, { background: false })).toBeNull();
    expect(topShapeAt([inner, outer], { x: 900, y: 900 }, 6, noTargets, { background: true })).toBeNull();
  });
});

describe("resize maths per kind", () => {
  it("a box takes the new rect exactly", () => {
    const out = resizeShapeTo(rect("rect:a", 0, 0, 100, 50), { x: 10, y: 20, w: 300, h: 150 });
    expect(shapeBounds(out)).toEqual({ x: 10, y: 20, w: 300, h: 150 });
  });
  it("a line keeps its direction and scales its ends", () => {
    const l: BoardShape = { id: "line:a", kind: "line", points: [{ x: 100, y: 0 }, { x: 0, y: 100 }] };
    const out = resizeShapeTo(l, { x: 0, y: 0, w: 200, h: 50 });
    expect(out.points).toEqual([{ x: 200, y: 0 }, { x: 0, y: 50 }]);
  });
  it("a pen stroke scales every point with the box", () => {
    const p: BoardShape = { id: "pen:a", kind: "pen", points: [{ x: 0, y: 0 }, { x: 50, y: 100 }, { x: 100, y: 0 }] };
    const out = resizeShapeTo(p, { x: 0, y: 0, w: 200, h: 50 });
    expect(out.points).toEqual([{ x: 0, y: 0 }, { x: 100, y: 50 }, { x: 200, y: 0 }]);
  });
});

describe("the board model", () => {
  const tiles: Tile[] = [{ id: "t1", rect: { x: 0, y: 0, w: 200, h: 100 } }];

  it("a mixed selection (tile + shape) drags as ONE undo step and moves both", () => {
    const board = new BoardStore<Tile>({ tiles, shapes: [rect("rect:a", 400, 0, 100, 100)] });
    const camera = new BoardCameraStore({ x: 0, y: 0, z: 1 });
    camera.registerItem("t1", tiles[0].rect);
    camera.registerItem("rect:a", shapeBounds(board.shapes[0]), { mark: true });
    const set = groupMoveSet(["t1", "rect:a"], camera.getItems());
    expect(set.size).toBe(2);
    for (let i = 1; i <= 5; i++) board.dragMany(shiftMoves(set, i * 10, 0));
    expect(board.getTile("t1")!.rect.x).toBe(50);
    expect(shapeBounds(board.shapes[0]).x).toBe(450);
    board.undo();
    expect(board.getTile("t1")!.rect.x).toBe(0);
    expect(shapeBounds(board.shapes[0]).x).toBe(400);
    expect(board.canUndo).toBe(false);
  });

  it("delete of a mixed selection is one step", () => {
    const board = new BoardStore<Tile>({ tiles, shapes: [rect("rect:a", 400, 0, 100, 100)] });
    board.removeMany(["t1", "rect:a"]);
    expect(board.read().tiles).toHaveLength(0);
    expect(board.shapes).toHaveLength(0);
    board.undo();
    expect(board.read().tiles).toHaveLength(1);
    expect(board.shapes).toHaveLength(1);
  });

  it("an arrow bound to a tile follows the tile; deleting the tile leaves the arrow where it was", () => {
    const arrow: BoardShape = {
      id: "arrow:a",
      kind: "arrow",
      points: [{ x: 600, y: 50 }, { x: 100, y: 50 }],
      bind: { end: "t1" },
    };
    const board = new BoardStore<Tile>({ tiles, shapes: [arrow] });
    const before = connectorEnds(board.shapes[0], board.targetOf);
    expect(before[1].x).toBeGreaterThan(200); // clipped to the tile's right edge, not its centre
    expect(before[1].x).toBeLessThan(220);
    board.moveTile("t1", 0, 300);
    const after = connectorEnds(board.shapes[0], board.targetOf);
    expect(after[1].y).toBeGreaterThan(250); // it followed the tile down (was 50)
    board.removeTile("t1");
    expect(board.shapes[0].bind?.end).toBeUndefined();
    expect(board.shapes[0].points[1]).toEqual(after[1]);
  });

  it("restyling several shapes is one step; bring forward reorders", () => {
    const board = new BoardStore<Tile>({ tiles: [], shapes: [rect("rect:a", 0, 0, 10, 10), rect("rect:b", 0, 0, 10, 10)] });
    board.restyleShapes(["rect:a", "rect:b"], { stroke: "rose", dash: "dashed" });
    expect(styleOf(board.shapes[0]).stroke).toBe("rose");
    expect(styleOf(board.shapes[1]).dash).toBe("dashed");
    board.undo();
    expect(styleOf(board.shapes[0]).stroke).toBe("ink");
    board.reorderShapes(["rect:a"], "front");
    expect(board.shapes.map((s) => s.id)).toEqual(["rect:b", "rect:a"]);
  });

  it("duplicate copies shapes with fresh ids, offset, as one step", () => {
    const board = new BoardStore<Tile>({ tiles: [], shapes: [rect("rect:a", 0, 0, 10, 10, { text: "Hi" })] });
    const ids = board.duplicateShapes(["rect:a"]);
    expect(ids).toHaveLength(1);
    expect(ids[0]).not.toBe("rect:a");
    expect(board.shapes).toHaveLength(2);
    expect(board.shapes[1].text).toBe("Hi");
    expect(shapeBounds(board.shapes[1]).x).toBeGreaterThan(0);
  });
});

describe("save and load", () => {
  it("style, text and bindings round-trip; an old shape row still parses", () => {
    const doc: BoardDocument = {
      camera: { x: 0, y: 0, z: 1 },
      nodes: [],
      groups: [],
      edges: [],
      shapes: [
        rect("rect:a", 0, 0, 10, 10, {
          style: { stroke: "blue", fill: "amber", size: "l", dash: "dotted", opacity: 0.5, textSize: "xl", textAlign: "start" },
          text: "Launch",
        }),
        { id: "arrow:a", kind: "arrow", points: [{ x: 0, y: 0 }, { x: 5, y: 5 }], bind: { start: "rect:a" } },
      ],
    };
    const stored = JSON.parse(JSON.stringify(serializeBoardDocument(doc)));
    const back = parseBoardDocument(stored);
    expect(back.problems).toEqual([]);
    expect(back.doc.shapes).toEqual(doc.shapes);

    const old = parseBoardDocument({
      camera: { x: 0, y: 0, z: 1 },
      nodes: [{ id: "pen:1", kind: "pen", points: [{ x: 0, y: 0 }, { x: 1, y: 1 }], shape: true }],
      edges: [],
    });
    expect(old.problems).toEqual([]);
    expect(old.doc.shapes[0]).toEqual({ id: "pen:1", kind: "pen", points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] });
    expect(styleOf(old.doc.shapes[0]).stroke).toBe("ink");
  });

  it("a malformed style field is dropped and reported, never the shape", () => {
    const { shape, problems } = parseShape({ id: "rect:x", kind: "rect", points: [{ x: 0, y: 0 }, { x: 1, y: 1 }], style: { stroke: "plaid", size: "m" } });
    expect(shape?.style).toEqual({ size: "m" });
    expect(problems.length).toBe(1);
  });
});

describe("the camera store", () => {
  it("Fit everything includes shapes, and marks never join the tile life budget or reading order", () => {
    const camera = new BoardCameraStore({ x: 0, y: 0, z: 1 });
    camera.setSize({ w: 1000, h: 800 });
    camera.registerItem("t1", { x: 0, y: 0, w: 100, h: 100 });
    camera.registerItem("rect:far", { x: 5000, y: 5000, w: 100, h: 100 }, { mark: true });
    const spy = jest.spyOn(camera, "flyTo").mockImplementation(() => {});
    camera.fitAll();
    const target = spy.mock.calls[0][0];
    // the far shape is inside the fitted view
    expect(-target.x / target.z + 1000 / target.z).toBeGreaterThan(5000);
    expect(camera.readingOrder()).toEqual(["t1"]);
    expect(camera.isMark("rect:far")).toBe(true);
    camera.focus("rect:far");
    expect(camera.getFocused()).toBeNull();
  });
});
