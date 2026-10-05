import { BoardStore } from "../board/board-store";
import { BoardCameraStore } from "../engine/camera-store";
import { beginSnap, nearbyRects } from "../engine/snap-gesture";
import {
  DEFAULT_SNAP_SETTINGS,
  SMART_GUIDES_KEY,
  SNAP_GRID_KEY,
  loadSnapSettings,
  saveSnapSettings,
} from "../engine/snap-preference";
import { isSnapBypass, snapMove } from "../engine/snapping";

type T = { id: string; rect: { x: number; y: number; w: number; h: number }; title: string };
const tile = (id: string, x: number, y = 0): T => ({ id, rect: { x, y, w: 200, h: 120 }, title: id });

function memoryStorage(seed: Record<string, string> = {}) {
  const m = new Map(Object.entries(seed));
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
}

describe("snap preference (per viewer, matrx.board.*)", () => {
  it("defaults: smart guides on, grid off", () => {
    expect(loadSnapSettings(memoryStorage())).toEqual({ smartGuides: true, grid: false });
    expect(DEFAULT_SNAP_SETTINGS).toEqual({ smartGuides: true, grid: false });
  });
  it("round-trips through the matrx.board.* keys", () => {
    const s = memoryStorage();
    saveSnapSettings({ smartGuides: false, grid: true }, s);
    expect(s.m.get(SNAP_GRID_KEY)).toBe("1");
    expect(s.m.get(SMART_GUIDES_KEY)).toBe("0");
    expect(loadSnapSettings(s)).toEqual({ smartGuides: false, grid: true });
  });
  it("blocked storage falls back to the defaults", () => {
    const blocked = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(loadSnapSettings(blocked)).toEqual(DEFAULT_SNAP_SETTINGS);
    expect(() => saveSnapSettings({ smartGuides: true, grid: true }, blocked)).not.toThrow();
  });
});

describe("snap modifiers", () => {
  it("⌘, Ctrl or Alt suspend snapping; Shift alone does not", () => {
    expect(isSnapBypass({ metaKey: true })).toBe(true);
    expect(isSnapBypass({ ctrlKey: true })).toBe(true);
    expect(isSnapBypass({ altKey: true })).toBe(true);
    expect(isSnapBypass({})).toBe(false);
    expect(isSnapBypass({ metaKey: false })).toBe(false);
  });
});

describe("a snap session over the camera store", () => {
  function setup() {
    const camera = new BoardCameraStore({ x: 0, y: 0, z: 1 });
    camera.setSize({ w: 1000, h: 800 });
    camera.registerItem("a", { x: 0, y: 0, w: 200, h: 120 });
    camera.registerItem("b", { x: 500, y: 300, w: 200, h: 120 });
    camera.registerItem("far", { x: 90000, y: 90000, w: 200, h: 120 });
    camera.registerItem("frame:f", { x: 503, y: 0, w: 900, h: 900 });
    return camera;
  }
  it("candidates are the tiles near the viewport: not itself, not far ones, not frames", () => {
    const camera = setup();
    expect(nearbyRects(camera, "a")).toEqual([{ x: 500, y: 300, w: 200, h: 120 }]);
  });
  it("a move snaps to a neighbour, draws the guide, and clears on end", () => {
    const camera = setup();
    const s = beginSnap(camera, "a");
    const r = s.move({ x: 503, y: 40, w: 200, h: 120 }, {});
    expect(r.x).toBe(500);
    expect(camera.getSnapOverlay()?.lines.length).toBeGreaterThan(0);
    s.end();
    expect(camera.getSnapOverlay()).toBeNull();
  });
  it("Alt held: no snap, no guide", () => {
    const camera = setup();
    const r = beginSnap(camera, "a").move({ x: 503, y: 40, w: 200, h: 120 }, { altKey: true });
    expect(r.x).toBe(503);
    expect(camera.getSnapOverlay()).toBeNull();
  });
  it("the grid setting rounds, and turning smart guides off clears the overlay", () => {
    const camera = setup();
    camera.setSnapSettings({ grid: true });
    expect(beginSnap(camera, "a").move({ x: 37, y: 61, w: 200, h: 120 }, {}).x).toBe(48);
    camera.setSnapSettings({ grid: false, smartGuides: false });
    expect(camera.getSnapOverlay()).toBeNull();
    expect(beginSnap(camera, "a").move({ x: 503, y: 40, w: 200, h: 120 }, {}).x).toBe(503);
  });
});

describe("a snapped drag is still ONE undo step", () => {
  it("many snapped moves coalesce into a single undo", () => {
    const board = new BoardStore<T>([tile("a", 0), tile("b", 500, 300)]);
    const camera = new BoardCameraStore({ x: 0, y: 0, z: 1 });
    camera.setSize({ w: 1000, h: 800 });
    camera.registerItem("a", board.getTile("a")!.rect);
    camera.registerItem("b", board.getTile("b")!.rect);
    const snap = beginSnap(camera, "a");
    for (let x = 480; x <= 503; x += 3) {
      const at = snap.move({ x, y: 40, w: 200, h: 120 }, {});
      board.moveTile("a", at.x, at.y);
    }
    snap.end();
    expect(board.getTile("a")!.rect.x).toBe(500);
    board.undo();
    expect(board.getTile("a")!.rect).toEqual({ x: 0, y: 0, w: 200, h: 120 });
  });
});

describe("cost on a busy board", () => {
  it("a snap over 400 nearby tiles stays well under a frame", () => {
    const others = Array.from({ length: 400 }, (_, i) => ({ x: (i % 20) * 260, y: Math.floor(i / 20) * 180, w: 200, h: 120 }));
    const opts = { z: 1, smartGuides: true, grid: false, bypass: false };
    snapMove({ x: 1003, y: 403, w: 200, h: 120 }, others, opts); // warm
    const t0 = performance.now();
    for (let i = 0; i < 100; i++) snapMove({ x: 1003 + i, y: 403, w: 200, h: 120 }, others, opts);
    const per = (performance.now() - t0) / 100;
    expect(per).toBeLessThan(4);
  });
});
