/**
 * MULTI-SELECT + DRAGGABLE FRAMES (Figma / tldraw / Miro selection model).
 *
 * Pins, on the real board model and camera store (no stand-ins):
 *  - a marquee selects every tile it touches, and a frame only when the drag
 *    did not start inside it;
 *  - a lone selection is "the selected tile"; several selected have none, and
 *    keep nothing awake;
 *  - a group drag (and a frame carrying its tiles) is ONE undo step;
 *  - Delete on several is ONE undo step, a frame alone keeps its tiles;
 *  - Arrange on a selection moves only the selection (a selected frame carries
 *    its tiles) and leaves the rest of the board;
 *  - by type, single-tile types share rows instead of a tall single column;
 *  - the "agent working" marker nests and clears.
 */

import { BoardStore } from "../board/board-store";
import { BoardCameraStore } from "../engine/camera-store";
import {
  FRAME_TITLE_BAND,
  allSelectable,
  frameKey,
  groupMoveSet,
  marqueeHits,
  rectFromCorners,
  shiftMoves,
} from "../engine/selection";
import { arrangeByType, planArrange, type TypedPlaced } from "../engine/arrange";

type Tile = { id: string; rect: { x: number; y: number; w: number; h: number } };

const r = (x: number, y: number, w = 100, h = 80) => ({ x, y, w, h });

/** A camera store with tiles and frames registered the way BoardTile / BoardFrameView do. */
function cameraWith(tiles: Tile[], frames: Tile[] = []) {
  const camera = new BoardCameraStore({ x: 0, y: 0, z: 1 });
  for (const t of tiles) camera.registerItem(t.id, t.rect);
  for (const f of frames)
    camera.registerItem(frameKey(f.id), { ...f.rect, y: f.rect.y - FRAME_TITLE_BAND, h: f.rect.h + FRAME_TITLE_BAND });
  return camera;
}

describe("marquee hit test", () => {
  const tiles: Tile[] = [
    { id: "a", rect: r(0, 0) },
    { id: "b", rect: r(200, 0) },
    { id: "c", rect: r(400, 0) },
    { id: "far", rect: r(2000, 2000) },
  ];
  const frames: Tile[] = [{ id: "frame:f", rect: r(-50, -50, 700, 300) }];

  it("selects every tile the marquee touches, and a frame it crosses from outside", () => {
    const camera = cameraWith(tiles, frames);
    const start = { x: -100, y: -100 };
    const hits = marqueeHits(rectFromCorners(start, { x: 210, y: 40 }), camera.getItems(), start);
    expect(hits.sort()).toEqual(["a", "b", "frame:f"]);
  });

  it("a marquee that starts INSIDE a frame selects its tiles, never the frame", () => {
    const camera = cameraWith(tiles, frames);
    const start = { x: 150, y: 100 };
    const hits = marqueeHits(rectFromCorners(start, { x: 450, y: 10 }), camera.getItems(), start);
    expect(hits.sort()).toEqual(["b", "c"]);
  });

  it("⌘A names every tile and frame by its selection id", () => {
    const camera = cameraWith(tiles, frames);
    expect(allSelectable(camera.getItems()).sort()).toEqual(["a", "b", "c", "far", "frame:f"]);
  });
});

describe("the selection set", () => {
  it("one selected is THE selected tile; several have none and keep nothing awake", () => {
    const camera = cameraWith([
      { id: "a", rect: r(0, 0) },
      { id: "b", rect: r(200, 0) },
    ]);
    camera.select("a");
    expect(camera.getSelected()).toBe("a");
    camera.toggleSelected("b");
    expect(camera.getSelection()).toEqual(["a", "b"]);
    expect(camera.getSelected()).toBeNull();
    expect(camera.isSelected("a") && camera.isSelected("b")).toBe(true);
    camera.toggleSelected("a");
    expect(camera.getSelected()).toBe("b");
  });

  it("working in a tile narrows the selection to it", () => {
    const camera = cameraWith([
      { id: "a", rect: r(0, 0) },
      { id: "b", rect: r(200, 0) },
    ]);
    camera.setSelection(["a", "b"]);
    camera.setEditing("b");
    expect(camera.getSelection()).toEqual(["b"]);
  });
});

describe("group moves", () => {
  it("dragging several tiles is ONE undo step", () => {
    const board = new BoardStore<Tile>([
      { id: "a", rect: r(0, 0) },
      { id: "b", rect: r(200, 0) },
      { id: "c", rect: r(400, 0) },
    ]);
    const camera = cameraWith(board.read().tiles);
    const set = groupMoveSet(["a", "b"], camera.getItems());
    for (const d of [5, 20, 60]) board.dragMany(shiftMoves(set, d, d));
    expect(board.getTile("a")!.rect).toMatchObject({ x: 60, y: 60 });
    expect(board.getTile("b")!.rect).toMatchObject({ x: 260, y: 60 });
    expect(board.getTile("c")!.rect).toMatchObject({ x: 400, y: 0 });
    board.undo();
    expect(board.getTile("a")!.rect).toMatchObject({ x: 0, y: 0 });
    expect(board.getTile("b")!.rect).toMatchObject({ x: 200, y: 0 });
    expect(board.canUndo).toBe(false);
  });

  it("dragging a frame carries every tile inside it, as ONE undo step; resizing it moves no tile", () => {
    const board = new BoardStore<Tile>({
      tiles: [
        { id: "in1", rect: r(20, 20) },
        { id: "in2", rect: r(300, 20) },
        { id: "out", rect: r(900, 20) },
      ],
      frames: [{ id: "frame:f", rect: r(0, 0, 500, 200), title: "Topic" }],
    });
    const camera = cameraWith(board.read().tiles, board.read().frames);
    const set = groupMoveSet(["frame:f"], camera.getItems());
    expect([...set.keys()].sort()).toEqual(["frame:f", "in1", "in2"]);
    expect(set.get("frame:f")).toEqual(r(0, 0, 500, 200));
    board.dragMany(shiftMoves(set, 10, 0));
    board.dragMany(shiftMoves(set, 100, 50));
    expect(board.frames[0].rect).toMatchObject({ x: 100, y: 50 });
    expect(board.getTile("in1")!.rect).toMatchObject({ x: 120, y: 70 });
    expect(board.getTile("in2")!.rect).toMatchObject({ x: 400, y: 70 });
    expect(board.getTile("out")!.rect).toMatchObject({ x: 900, y: 20 });
    board.undo();
    expect(board.frames[0].rect).toMatchObject({ x: 0, y: 0 });
    expect(board.getTile("in1")!.rect).toMatchObject({ x: 20, y: 20 });

    board.resizeTile("frame:f", r(0, 0, 900, 400));
    expect(board.frames[0].rect).toEqual(r(0, 0, 900, 400));
    expect(board.getTile("in1")!.rect).toMatchObject({ x: 20, y: 20 });
  });
});

describe("Delete on a selection", () => {
  it("removes every selected thing as ONE undo step; a frame alone keeps its tiles", () => {
    const board = new BoardStore<Tile>({
      tiles: [
        { id: "a", rect: r(20, 20) },
        { id: "b", rect: r(300, 20) },
        { id: "c", rect: r(900, 20) },
      ],
      frames: [{ id: "frame:f", rect: r(0, 0, 500, 200), title: "Topic" }],
      connections: [{ id: "e", from: "a", to: "c" }],
    });
    board.removeMany(["b", "c", "frame:f"]);
    expect(board.read().tiles.map((t) => t.id)).toEqual(["a"]);
    expect(board.frames).toEqual([]);
    expect(board.connections).toEqual([]);
    board.undo();
    expect(board.read().tiles.map((t) => t.id)).toEqual(["a", "b", "c"]);
    expect(board.frames.map((f) => f.id)).toEqual(["frame:f"]);
    expect(board.connections.map((c) => c.id)).toEqual(["e"]);
    expect(board.canUndo).toBe(false);
  });
});

describe("Arrange on a selection", () => {
  const scene = {
    tiles: [
      { id: "a", rect: r(0, 0), group: "note" },
      { id: "b", rect: r(300, 200), group: "note" },
      { id: "c", rect: r(900, 500), group: "note" },
      { id: "in", rect: r(1520, 20), group: "note" },
    ] as TypedPlaced[],
    frames: [{ id: "frame:f", rect: r(1500, 0, 300, 200) }],
  };

  it("align left moves only the selected tiles", () => {
    const { moves } = planArrange(scene, { kind: "align", edge: "left" }, [], ["b", "c"]);
    expect(moves).toEqual([{ id: "c", x: 300, y: 500 }]);
  });

  it("a selected frame carries its tiles; unselected tiles stay", () => {
    const { moves } = planArrange(scene, { kind: "align", edge: "top" }, [], ["c", "frame:f"]);
    const byId = Object.fromEntries(moves.map((m) => [m.id, m]));
    expect(byId.c).toEqual({ id: "c", x: 900, y: 0 });
    expect(byId["frame:f"]).toBeUndefined(); // already the top edge
    expect(byId.a).toBeUndefined();
    expect(byId.b).toBeUndefined();
    const down = planArrange(scene, { kind: "align", edge: "bottom" }, [], ["c", "frame:f"]);
    const at = Object.fromEntries(down.moves.map((m) => [m.id, m]));
    expect(at["frame:f"]).toEqual({ id: "frame:f", x: 1500, y: 380 });
    expect(at.in).toEqual({ id: "in", x: 1520, y: 400 });
    expect(at.a).toBeUndefined();
  });
});

describe("Arrange by type", () => {
  it("single-tile types share rows instead of stacking into one tall column", () => {
    const types = ["note", "chat", "table", "file", "task", "image"];
    const items: TypedPlaced[] = types.map((group, i) => ({ id: group, rect: r(i * 37, i * 53, 200, 100), group }));
    const { placed, blocks } = arrangeByType(items, types);
    const rows = new Set(placed.map((p) => p.rect.y));
    // Six singletons, three columns: two rows, never six.
    expect(rows.size).toBe(2);
    expect(blocks).toHaveLength(6);
    const xs = new Set(placed.map((p) => p.rect.x));
    expect(xs.size).toBe(3);
  });

  it("a type with many tiles still wraps in rows of the shared column width, after the singletons", () => {
    const items: TypedPlaced[] = [
      { id: "n1", rect: r(0, 0, 200, 100), group: "note" },
      { id: "c1", rect: r(500, 0, 200, 100), group: "chat" },
      ...["t1", "t2", "t3", "t4", "t5", "t6", "t7"].map((id, i) => ({ id, rect: r(i * 10, 900, 200, 100), group: "table" })),
    ];
    const { placed } = arrangeByType(items, ["note", "chat", "table"]);
    const at = Object.fromEntries(placed.map((p) => [p.id, p.rect]));
    // note and chat share the first shelf.
    expect(at.n1.y).toBe(at.c1.y);
    // tables: 3 per row (⌈√9⌉), below the first shelf.
    expect(at.t1.y).toBeGreaterThan(at.n1.y);
    expect(at.t1.y).toBe(at.t3.y);
    expect(at.t4.y).toBeGreaterThan(at.t1.y);
  });
});

describe("the agent-working marker", () => {
  it("is set while a call acts on an item, nests, and clears", () => {
    const camera = new BoardCameraStore({ x: 0, y: 0, z: 1 });
    const seen: boolean[] = [];
    camera.subscribeAgentWork("a", () => seen.push(camera.isAgentWorking("a")));
    const one = camera.beginAgentWork("a");
    const two = camera.beginAgentWork("a");
    one();
    one(); // idempotent
    expect(camera.isAgentWorking("a")).toBe(true);
    two();
    expect(camera.isAgentWorking("a")).toBe(false);
    expect(seen).toEqual([true, true, true, false]);
    expect(camera.isAgentWorking("b")).toBe(false);
  });
});
