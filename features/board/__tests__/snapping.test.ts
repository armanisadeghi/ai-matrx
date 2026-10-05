import { GRID_SIZE, snapMove, snapResize, type SnapOptions } from "../engine/snapping";

const base: SnapOptions = { z: 1, smartGuides: true, grid: false, bypass: false };
const R = (x: number, y: number, w = 200, h = 120) => ({ x, y, w, h });

describe("smart guides — moving", () => {
  it("snaps the left edge to another tile's left edge within the threshold", () => {
    const other = R(500, 0);
    const out = snapMove(R(503, 300), [other], base);
    expect(out.rect.x).toBe(500);
    expect(out.overlay?.lines.some((l) => l.axis === "x" && l.at === 500)).toBe(true);
  });

  it("snaps right edge to left edge, and centre to centre", () => {
    expect(snapMove(R(296, 300), [R(500, 0)], base).rect.x).toBe(300); // right 496 -> 500
    expect(snapMove(R(548, 300, 100, 120), [R(500, 0, 200, 120)], base).rect.x).toBe(550); // centre 598 -> 600
  });

  it("snaps vertically: top, middle, bottom", () => {
    expect(snapMove(R(0, 197, 200, 50), [R(500, 200)], base).rect.y).toBe(200); // top to top
    expect(snapMove(R(0, 232, 200, 60), [R(500, 200, 200, 120)], base).rect.y).toBe(230); // middle 262 -> 260
    expect(snapMove(R(0, 103, 200, 100), [R(500, 200, 200, 120)], base).rect.y).toBe(100); // bottom 203 -> 200
  });

  it("does not snap beyond the threshold", () => {
    const out = snapMove(R(520, 300), [R(500, 0)], base);
    expect(out.rect).toEqual(R(520, 300));
    expect(out.overlay).toBeNull();
  });

  it("the threshold is in SCREEN px: 6px is 3 world px at 200% and 60 at 10%", () => {
    const other = R(500, 0);
    expect(snapMove(R(504, 300), [other], { ...base, z: 2 }).rect.x).toBe(504); // 4 world = 8 screen px
    expect(snapMove(R(502, 300), [other], { ...base, z: 2 }).rect.x).toBe(500); // 2 world = 4 screen px
    expect(snapMove(R(550, 300), [other], { ...base, z: 0.1 }).rect.x).toBe(500); // 50 world = 5 screen px
    expect(snapMove(R(770, 300), [other], { ...base, z: 0.1 }).rect.x).toBe(770); // 70 world = 7 screen px
  });

  it("bypass (a held modifier) moves freely and draws nothing", () => {
    const out = snapMove(R(503, 300), [R(500, 0)], { ...base, bypass: true });
    expect(out.rect).toEqual(R(503, 300));
    expect(out.overlay).toBeNull();
  });

  it("smart guides off: nothing snaps", () => {
    expect(snapMove(R(503, 300), [R(500, 0)], { ...base, smartGuides: false }).rect.x).toBe(503);
  });

  it("the guide line spans both aligned tiles", () => {
    const out = snapMove(R(502, 400), [R(500, 0)], base);
    const line = out.overlay!.lines.find((l) => l.axis === "x" && l.at === 500)!;
    expect(line.from).toBe(0);
    expect(line.to).toBe(520);
  });
});

describe("equal spacing", () => {
  it("snaps between two tiles to equal gaps and marks both gaps", () => {
    const a = R(0, 0, 100, 100);
    const b = R(400, 0, 100, 100);
    // free span 100..400 = 300, tile 100 wide -> x = 200 for gaps of 100
    const out = snapMove(R(203, 0, 100, 100), [a, b], { ...base, smartGuides: true });
    expect(out.rect.x).toBe(200);
    expect(out.overlay!.gaps).toHaveLength(2);
    const g = out.overlay!.gaps.map((m) => [m.from, m.to]).sort((p, q) => p[0] - q[0]);
    expect(g).toEqual([
      [100, 200],
      [300, 400],
    ]);
  });

  it("snaps to the same gap as a neighbouring pair when extending a row", () => {
    const a = R(0, 0, 100, 100);
    const b = R(160, 0, 100, 100); // gap 60
    const out = snapMove(R(324, 0, 100, 100), [a, b], base); // b.right 260 + 60 = 320
    expect(out.rect.x).toBe(320);
    expect(out.overlay!.gaps).toHaveLength(2);
  });

  it("ignores tiles that do not overlap on the cross axis", () => {
    const a = R(0, 0, 100, 100);
    const b = R(400, 600, 100, 100); // far below
    const out = snapMove(R(203, 0, 100, 100), [a, b], base);
    expect(out.rect.x).toBe(203);
  });
});

describe("snap to grid", () => {
  const grid = { ...base, grid: true };
  it("rounds a move to the 24 px grid", () => {
    expect(GRID_SIZE).toBe(24);
    const out = snapMove(R(37, 61), [], grid);
    expect(out.rect.x).toBe(48);
    expect(out.rect.y).toBe(72);
    expect(out.rect.w).toBe(200);
  });
  it("grid beats smart guides for position, bypass beats grid", () => {
    expect(snapMove(R(37, 61), [R(40, 0)], grid).rect.x).toBe(48);
    expect(snapMove(R(37, 61), [], { ...grid, bypass: true }).rect).toEqual(R(37, 61));
  });
  it("rounds a resize edge, keeping the opposite edge", () => {
    // dragging the east edge: right edge 100+250=350 -> 360
    const out = snapResize(R(100, 100, 250, 150), "e", [], grid);
    expect(out.rect).toEqual(R(100, 100, 260, 150));
  });
  it("a west edge drag moves the origin to the grid, right edge stays", () => {
    const out = snapResize(R(101, 100, 249, 150), "w", [], grid); // right = 350
    expect(out.rect.x).toBe(96);
    expect(out.rect.x + out.rect.w).toBe(350);
  });
});

describe("smart guides — resizing", () => {
  it("snaps the moving east edge to another tile's left edge", () => {
    const out = snapResize(R(0, 0, 497, 120), "e", [R(500, 300)], base);
    expect(out.rect.w).toBe(500);
    expect(out.overlay!.lines.some((l) => l.axis === "x" && l.at === 500)).toBe(true);
  });
  it("snaps the moving west edge and keeps the opposite edge fixed", () => {
    const out = snapResize(R(303, 0, 297, 120), "w", [R(300, 300)], base); // right = 600
    expect(out.rect.x).toBe(300);
    expect(out.rect.x + out.rect.w).toBe(600);
  });
  it("never snaps below the minimum size", () => {
    const out = snapResize(R(0, 0, 162, 120), "e", [R(158, 300)], { ...base, min: { w: 160, h: 96 } });
    expect(out.rect.w).toBe(162);
  });
  it("bypass resizes freely", () => {
    expect(snapResize(R(0, 0, 497, 120), "e", [R(500, 300)], { ...base, bypass: true }).rect.w).toBe(497);
  });
});
