// Sequential adds fill the view in reading order (Miro, FigJam) — the Add
// menu used 15 times in a row once built a diagonal staircase 7,000 units
// tall: the camera flew to each new tile, so the next add searched from the
// centre of the last one, and the nearest free spot was always up and right.
// Real BoardStore; `placeTiles` is the exact function UserBoard's `place()`
// calls; after each add the camera goes where that add sent it.

import { BoardStore } from "../board/board-store";
import type { Camera, Rect } from "../engine/camera";
import { findFreeSpot } from "../engine/placement";
import { type PlacementRun, type PlacementView, READABLE_ADD_ZOOM, clearView, clearViewCentre, placeTiles } from "../home/place-run";

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

describe("a board of many big tiles stays fit-able", () => {
  // Real tiles are big (a note is 560x620) and the board is often zoomed in beside the chat, so
  // the view holds ONE tile across. Rows as wide as the view then made a single tall column and
  // Fit ended at ~8% zoom. The run's rows now widen with the tile count (a landscape block).
  const BIG = { w: 560, h: 620 };
  const run = (count: number, camera: Camera, size = { w: 900, h: 800 }) => {
    const board = new BoardStore<Tile>([]);
    let cam = camera;
    let current: PlacementRun | null = null;
    const rects: Rect[] = [];
    for (let i = 0; i < count; i++) {
      const placed: ReturnType<typeof placeTiles> = placeTiles(
        board,
        [{ id: `t${i}`, rect: { x: 0, y: 0, ...BIG } }],
        { camera: cam, size, insets: INSETS },
        current,
      );
      rects.push(placed.rects[0]);
      current = placed.run;
      if (placed.reveal) cam = placed.reveal;
    }
    return rects;
  };
  const fitZoom = (rects: Rect[], area = { w: 1400, h: 900 }) => {
    const w = Math.max(...rects.map((r) => r.x + r.w)) - Math.min(...rects.map((r) => r.x));
    const h = Math.max(...rects.map((r) => r.y + r.h)) - Math.min(...rects.map((r) => r.y));
    return Math.min(area.w / w, area.h / h);
  };

  it.each([12, 16, 20])("%i tiles fit at a readable zoom, not one tall column", (count) => {
    const rects = run(count, { x: 0, y: 0, z: 1 });
    expect(fitZoom(rects)).toBeGreaterThan(0.25);
    const xs = new Set(rects.map((r) => r.x));
    expect(xs.size).toBeGreaterThan(2);
  });
});

describe("adding while zoomed out past the readable floor", () => {
  // A person who pressed Fit on 12 tiles sits at ~15%: every tile is a title card. Bringing in a
  // War Room there used to drop it as a 55 px speck in a gap and leave the camera alone
  // ("Add → War Room shows nothing visible", browser walk 2026-10-04).
  const wide: Camera = { x: 100, y: 60, z: 0.1 };
  const tile = { id: "room", rect: { x: 0, y: 0, w: 560, h: 620 } };

  it("flies to a readable zoom with the new tile inside the clear view", () => {
    const board = new BoardStore<Tile>([]);
    const view: PlacementView = { camera: wide, size: SIZE, insets: INSETS };
    const placed = placeTiles(board, [tile], view, null);
    expect(placed.reveal).not.toBeNull();
    expect(placed.reveal!.z).toBeGreaterThanOrEqual(READABLE_ADD_ZOOM);
    const seen = clearView({ camera: placed.reveal!, size: SIZE, insets: INSETS });
    const r = placed.rects[0];
    expect(r.x).toBeGreaterThanOrEqual(seen.x);
    expect(r.y).toBeGreaterThanOrEqual(seen.y);
    expect(r.x + r.w).toBeLessThanOrEqual(seen.x + seen.w);
    expect(r.y + r.h).toBeLessThanOrEqual(seen.y + seen.h);
  });

  it("is placed near where the person was looking, not far across the board", () => {
    const board = new BoardStore<Tile>([]);
    const view: PlacementView = { camera: wide, size: SIZE, insets: INSETS };
    const centre = clearViewCentre(view);
    const r = placeTiles(board, [tile], view, null).rects[0];
    expect(Math.hypot(r.x + r.w / 2 - centre.x, r.y + r.h / 2 - centre.y)).toBeLessThan(200);
  });

  it("leaves a readable view alone (no zoom change)", () => {
    const board = new BoardStore<Tile>([]);
    const camera = { x: 0, y: 0, z: 0.8 };
    const placed = placeTiles(board, [tile], { camera, size: SIZE, insets: INSETS }, null);
    expect(placed.reveal === null || placed.reveal.z === 0.8).toBe(true);
  });
});
