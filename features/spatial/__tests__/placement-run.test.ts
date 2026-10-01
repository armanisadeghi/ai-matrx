// Sequential adds fill the view in reading order (Miro, FigJam) — the Add
// menu used 15 times in a row once built a diagonal staircase 7,000 units
// tall: the camera flew to each new tile, so the next add searched from the
// centre of the last one, and the nearest free spot was always up and right.
// Real BoardStore; `placeTiles` is the exact function UserBoard's `place()`
// calls; after each add the camera goes where that add sent it.

import { BoardStore } from "../board/board-store";
import type { Camera, Rect } from "../engine/camera";
import { findFreeSpot } from "../engine/placement";
import { type PlacementRun, type PlacementView, clearView, placeTiles } from "../home/place-run";

type Tile = { id: string; rect: { x: number; y: number; w: number; h: number } };

const INSETS = { top: 72, right: 0, bottom: 56, left: 0 };
const SIZE = { w: 1400, h: 900 };

function addFifteen(start: Camera) {
  const board = new BoardStore<Tile>([]);
  let camera = start;
  let run: PlacementRun | null = null;
  const rects: Rect[] = [];
  for (let i = 0; i < 15; i++) {
    const view: PlacementView = { camera, size: SIZE, insets: INSETS };
    const placed: ReturnType<typeof placeTiles> = placeTiles(
      board,
      [{ id: `t${i}`, rect: { x: 0, y: 0, w: 480, h: 360 } }],
      view,
      run,
    );
    rects.push(placed.rects[0]);
    run = placed.run;
    if (placed.reveal) camera = placed.reveal; // the flight ends there
  }
  return { rects, board, camera };
}

describe("placing a run of adds", () => {
  it("15 adds in a row fill the view in rows — no staircase", () => {
    const start = { x: 0, y: 0, z: 0.6 };
    const { rects } = addFifteen(start);
    const top = Math.min(...rects.map((r) => r.y));
    const bottom = Math.max(...rects.map((r) => r.y + r.h));
    const left = Math.min(...rects.map((r) => r.x));
    const right = Math.max(...rects.map((r) => r.x + r.w));
    const view = clearView({ camera: start, size: SIZE, insets: INSETS });
    // Rows as wide as the view, so 15 tiles of 480×360 take a handful of rows.
    expect(right - left).toBeLessThanOrEqual(view.w);
    expect(bottom - top).toBeLessThan(3000);
    // Never above the first tile: the run reads down, never up and right.
    expect(top).toBe(rects[0].y);
    // Reading order: each tile is to the right of the previous one in its row,
    // or starts a lower row.
    for (let i = 1; i < rects.length; i++) {
      const a = rects[i - 1];
      const b = rects[i];
      const sameRow = b.y === a.y;
      expect(sameRow ? b.x > a.x || b.x < rects[0].x : b.y > a.y).toBe(true);
    }
    // No two overlap.
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i];
        const b = rects[j];
        const overlap = a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
        expect(overlap).toBe(false);
      }
    }
  });

  it("the first add of a run lands centred where the person is looking", () => {
    const start = { x: 0, y: 0, z: 0.6 };
    const { rects } = addFifteen(start);
    const view = clearView({ camera: start, size: SIZE, insets: INSETS });
    expect(rects[0].x + rects[0].w / 2).toBeCloseTo(view.x + view.w / 2, -1);
    expect(rects[0].y + rects[0].h / 2).toBeCloseTo(view.y + view.h / 2, -1);
  });

  it("the camera only pans to reveal a tile below the view — it never zooms", () => {
    const start = { x: 0, y: 0, z: 0.6 };
    const { camera } = addFifteen(start);
    expect(camera.z).toBe(0.6);
    expect(camera.x).toBe(0);
  });

  it("a pan between adds starts a new run where the person now looks", () => {
    const board = new BoardStore<Tile>([]);
    const view: PlacementView = { camera: { x: 0, y: 0, z: 1 }, size: SIZE, insets: INSETS };
    const first = placeTiles(board, [{ id: "a", rect: { x: 0, y: 0, w: 400, h: 300 } }], view, null);
    const moved: PlacementView = { ...view, camera: { x: -5000, y: 0, z: 1 } };
    const second = placeTiles(board, [{ id: "b", rect: { x: 0, y: 0, w: 400, h: 300 } }], moved, first.run);
    const area = clearView(moved);
    expect(second.rects[0].x + 200).toBeCloseTo(area.x + area.w / 2, -1);
  });
});

describe("findFreeSpot — one tile at a point", () => {
  it("the nearest free spot prefers right, then below — never the up-right corner first", () => {
    const occupied = [{ x: -240, y: -180, w: 480, h: 360 }];
    const r = findFreeSpot(occupied, { w: 480, h: 360 }, { x: 0, y: 0 });
    expect(r.y).toBeGreaterThanOrEqual(-180); // not above the tile in the way
  });
});
