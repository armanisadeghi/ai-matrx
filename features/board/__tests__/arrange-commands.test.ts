/**
 * The people's Arrange commands (Board menu → Arrange, and their keys).
 *
 * SUT: `arrangeByType`, `planArrange` (`engine/arrange.ts`) and
 * `arrangeCommandForKey` (`board/arrange-board.ts`).
 * Breaks it catches: types interleaved instead of grouped; groups out of the
 * catalog order; a frame broken up (its tiles left behind, or arranged as
 * loose tiles); "frames by type" framing tiles that already sit in a frame;
 * an ⌥ shortcut that misses on a Mac (where ⌥A types "å", so `key` is useless).
 */
import { FRAME_GROUP, arrangeByType, planArrange, type TypedPlaced } from "../engine/arrange";
import { arrangeCommandForKey } from "../board/arrange-board";

const t = (id: string, group: string, x: number, y: number, w = 300, h = 200): TypedPlaced => ({
  id,
  group,
  rect: { x, y, w, h },
});

const overlaps = (a: { x: number; y: number; w: number; h: number }, b: typeof a) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe("arrangeByType", () => {
  // Reading order: n1 c1 n2 / t1 c2 n3
  const items = [
    t("n1", "note", 0, 0),
    t("c1", "chat", 400, 0),
    t("n2", "note", 800, 0),
    t("t1", "task", 0, 400),
    t("c2", "chat", 400, 400),
    t("n3", "note", 800, 400),
  ];

  it("groups each type together, in the catalog order, each in reading order", () => {
    const { placed, blocks } = arrangeByType(items, ["chat", "note", "task"]);
    expect(blocks.map((b) => b.group)).toEqual(["chat", "note", "task"]);
    expect(blocks.map((b) => b.ids)).toEqual([["c1", "c2"], ["n1", "n2", "n3"], ["t1"]]);
    // Every block sits wholly below the one before it.
    for (let i = 1; i < blocks.length; i++) {
      expect(blocks[i].rect.y).toBeGreaterThan(blocks[i - 1].rect.y + blocks[i - 1].rect.h);
    }
    // Nothing overlaps, and sizes never change.
    for (const a of placed) for (const b of placed) if (a.id !== b.id) expect(overlaps(a.rect, b.rect)).toBe(false);
    for (const p of placed) expect(p.rect.w).toBe(300);
  });

  it("starts where the group already was", () => {
    const shifted = items.map((i) => ({ ...i, rect: { ...i.rect, x: i.rect.x + 1000, y: i.rect.y - 50 } }));
    const { placed } = arrangeByType(shifted, ["chat", "note", "task"]);
    expect(Math.min(...placed.map((p) => p.rect.x))).toBe(1000);
    expect(Math.min(...placed.map((p) => p.rect.y))).toBe(-50);
  });

  it("puts frames first and types it does not know last, by name", () => {
    const { blocks } = arrangeByType(
      [t("z", "zebra", 0, 0), t("a", "alpha", 400, 0), t("c", "chat", 800, 0), t("f", FRAME_GROUP, 0, 600, 900, 500)],
      ["chat"],
    );
    expect(blocks.map((b) => b.group)).toEqual([FRAME_GROUP, "chat", "alpha", "zebra"]);
  });
});

describe("planArrange — frames move as units", () => {
  const frame = { id: "frame:a", rect: { x: 0, y: 0, w: 800, h: 400 } };
  const scene = {
    frames: [frame],
    tiles: [
      t("in1", "note", 50, 50), // centre inside the frame
      t("in2", "chat", 450, 50),
      t("out1", "task", 2000, 0),
      t("out2", "note", 2000, 900),
    ],
  };

  it("a board-wide tidy moves the frame and carries its tiles by the same offset", () => {
    const { moves } = planArrange(scene, { kind: "layout", layout: "row" });
    const at = new Map(moves.map((m) => [m.id, m]));
    const f = at.get("frame:a") ?? { x: 0, y: 0 };
    const dx = f.x - frame.rect.x;
    const dy = f.y - frame.rect.y;
    const in1 = at.get("in1") ?? { x: 50, y: 50 };
    const in2 = at.get("in2") ?? { x: 450, y: 50 };
    expect([in1.x - 50, in1.y - 50]).toEqual([dx, dy]);
    expect([in2.x - 450, in2.y - 50]).toEqual([dx, dy]);
    // The loose tiles line up after the frame, in one row.
    expect(at.get("out1")!.y).toBe(at.get("out2")!.y);
  });

  it("frames by type frames only the loose tiles, one frame per type, none overlapping", () => {
    const { moves, frames } = planArrange(scene, { kind: "frames-by-type" }, ["chat", "note", "task"]);
    expect(frames.map((f) => f.group)).toEqual(["note", "task"]);
    const final = new Map(scene.tiles.map((x) => [x.id, { ...x.rect }]));
    for (const m of moves) if (final.has(m.id)) Object.assign(final.get(m.id)!, { x: m.x, y: m.y });
    const inside = (r: { x: number; y: number; w: number; h: number }, f: typeof r) =>
      r.x >= f.x && r.y >= f.y && r.x + r.w <= f.x + f.w && r.y + r.h <= f.y + f.h;
    expect(inside(final.get("out2")!, frames[0].rect)).toBe(true);
    expect(inside(final.get("out1")!, frames[1].rect)).toBe(true);
    expect(overlaps(frames[0].rect, frames[1].rect)).toBe(false);
  });

  it("an already-arranged board plans no moves", () => {
    const row = { frames: [], tiles: [t("a", "note", 0, 0), t("b", "note", 348, 0)] };
    expect(planArrange(row, { kind: "layout", layout: "row" }).moves).toEqual([]);
  });
});

describe("arrange shortcuts", () => {
  const key = (code: string, mods: Partial<{ altKey: boolean; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }>) =>
    arrangeCommandForKey({ code, altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, ...mods });

  it("reads the physical key, so ⌥ on a Mac still matches", () => {
    expect(key("KeyA", { altKey: true })).toEqual({ kind: "align", edge: "left" });
    expect(key("KeyS", { altKey: true })).toEqual({ kind: "align", edge: "bottom" });
    expect(key("KeyT", { altKey: true, ctrlKey: true })).toEqual({ kind: "layout", layout: "tidy" });
    expect(key("KeyG", { altKey: true, ctrlKey: true })).toEqual({ kind: "by-type" });
    expect(key("KeyV", { altKey: true, ctrlKey: true })).toEqual({ kind: "distribute", axis: "vertical" });
  });

  it("leaves everything else alone", () => {
    expect(key("KeyA", {})).toBeNull();
    expect(key("KeyA", { altKey: true, metaKey: true })).toBeNull();
    expect(key("KeyZ", { altKey: true })).toBeNull();
  });
});

describe("arrange by type: tight packing and clear of unselected content", () => {
  it("a narrow tile beside a wide one of ANOTHER type is not pushed out to the wide width", () => {
    const items = [t("s1", "sticky", 0, 0, 130, 130), t("s2", "sticky", 200, 0, 130, 130), t("n1", "note", 0, 400, 560, 620)];
    const { placed } = arrangeByType(items, ["note", "sticky"], { columns: 2 });
    const at = new Map(placed.map((p) => [p.id, p.rect]));
    // Two stickies in one row: the gap between them is the standard gap, not a note's width.
    expect(at.get("s2")!.x - (at.get("s1")!.x + 130)).toBeLessThanOrEqual(48);
  });

  it("arranging a selection never lands it on content that was not selected", () => {
    const tiles = [
      t("a", "note", 0, 0),
      t("b", "chat", 400, 0),
      t("keep", "task", 0, 260, 700, 400), // unselected, right under the selection
    ];
    const plan = planArrange({ tiles, frames: [] }, { kind: "by-type" }, ["note", "chat", "task"], ["a", "b"]);
    const final = new Map(tiles.map((x) => [x.id, { ...x.rect }]));
    for (const m of plan.moves) final.set(m.id, { ...final.get(m.id)!, x: m.x, y: m.y });
    for (const id of ["a", "b"]) expect(overlaps(final.get(id)!, final.get("keep")!)).toBe(false);
  });
});
