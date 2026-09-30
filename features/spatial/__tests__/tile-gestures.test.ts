import {
  MIN_TILE_SIZE,
  RESIZE_HANDLES,
  doubleClickAction,
  resizeHandleWorldPx,
  resizeRect,
} from "../engine/tile-gestures";
import { routeWheel } from "../engine/wheel-input";

const start = { x: 100, y: 200, w: 400, h: 300 };

describe("tile resize math", () => {
  it("offers all four edges and all four corners", () => {
    expect([...RESIZE_HANDLES].sort()).toEqual(["e", "n", "ne", "nw", "s", "se", "sw", "w"]);
  });

  it("grows from the bottom-right corner without moving the origin", () => {
    expect(resizeRect(start, "se", 50, 20, { z: 1 })).toEqual({ x: 100, y: 200, w: 450, h: 320 });
  });

  it("dragging the LEFT edge moves the origin and keeps the right edge fixed", () => {
    const r = resizeRect(start, "w", 60, 999, { z: 1 });
    expect(r).toEqual({ x: 160, y: 200, w: 340, h: 300 });
    expect(r.x + r.w).toBe(start.x + start.w);
  });

  it("dragging the TOP edge moves the origin and keeps the bottom edge fixed", () => {
    const r = resizeRect(start, "n", 999, -40, { z: 1 });
    expect(r).toEqual({ x: 100, y: 160, w: 400, h: 340 });
    expect(r.y + r.h).toBe(start.y + start.h);
  });

  it("the top-left corner moves both origin axes", () => {
    expect(resizeRect(start, "nw", -20, -10, { z: 1 })).toEqual({ x: 80, y: 190, w: 420, h: 310 });
  });

  it("compensates for the camera scale: screen px become world px", () => {
    // At 50% zoom a 50px screen drag is 100 world px.
    expect(resizeRect(start, "e", 50, 0, { z: 0.5 })).toEqual({ x: 100, y: 200, w: 500, h: 300 });
    // At 200% zoom it is 25 world px, and the left edge still anchors right.
    expect(resizeRect(start, "w", 50, 0, { z: 2 })).toEqual({ x: 125, y: 200, w: 375, h: 300 });
  });

  it("never goes below the minimum size, and a left/top shrink pins at the far edge", () => {
    const r = resizeRect(start, "nw", 5000, 5000, { z: 1 });
    expect(r.w).toBe(MIN_TILE_SIZE.w);
    expect(r.h).toBe(MIN_TILE_SIZE.h);
    expect(r.x + r.w).toBe(start.x + start.w);
    expect(r.y + r.h).toBe(start.y + start.h);
    const s = resizeRect(start, "se", -5000, -5000, { z: 1 });
    expect(s).toEqual({ x: 100, y: 200, w: MIN_TILE_SIZE.w, h: MIN_TILE_SIZE.h });
  });

  it("Shift keeps the aspect ratio on a corner (dominant axis wins)", () => {
    const r = resizeRect(start, "se", 200, 10, { z: 1, keepAspect: true });
    expect(r.w).toBe(600);
    expect(r.h).toBeCloseTo(450, 6);
    expect(r.w / r.h).toBeCloseTo(start.w / start.h, 6);
  });

  it("Shift on a left edge scales the height about the centre and keeps the right edge", () => {
    const r = resizeRect(start, "w", -100, 0, { z: 1, keepAspect: true });
    expect(r.w).toBe(500);
    expect(r.h).toBeCloseTo(375, 6);
    expect(r.x + r.w).toBe(start.x + start.w);
    expect(r.y + r.h / 2).toBeCloseTo(start.y + start.h / 2, 6);
  });

  it("Shift + min size still keeps the ratio", () => {
    const r = resizeRect(start, "se", -5000, -5000, { z: 1, keepAspect: true });
    expect(r.w).toBeGreaterThanOrEqual(MIN_TILE_SIZE.w);
    expect(r.h).toBeGreaterThanOrEqual(MIN_TILE_SIZE.h);
    expect(r.w / r.h).toBeCloseTo(start.w / start.h, 6);
  });

  it("the handle hit area is a constant screen size at any zoom", () => {
    expect(resizeHandleWorldPx(1) * 1).toBeGreaterThanOrEqual(8);
    expect(resizeHandleWorldPx(0.25) * 0.25).toBeCloseTo(resizeHandleWorldPx(1), 6);
    expect(resizeHandleWorldPx(3) * 3).toBeCloseTo(resizeHandleWorldPx(1), 6);
  });
});

describe("wheel routing", () => {
  const base = { overTile: false, overChrome: false, zoomGesture: false, innerCanScroll: false };

  it("empty space moves the camera", () => {
    expect(routeWheel(base)).toBe("camera");
  });

  it("over a tile a plain wheel NEVER moves the camera", () => {
    expect(routeWheel({ ...base, overTile: true, innerCanScroll: true })).toBe("native");
    // Content that cannot scroll simply does not — and the scroll does not chain out.
    expect(routeWheel({ ...base, overTile: true, innerCanScroll: false })).toBe("block");
  });

  it("pinch / ctrl-wheel over a tile zooms the canvas (Figma)", () => {
    expect(routeWheel({ ...base, overTile: true, zoomGesture: true, innerCanScroll: true })).toBe("camera");
  });

  it("chrome and the focus layer own their scrolling", () => {
    expect(routeWheel({ ...base, overChrome: true })).toBe("ignore");
    expect(routeWheel({ ...base, overChrome: true, zoomGesture: true })).toBe("ignore");
  });
});

describe("double-click rule", () => {
  const base = { focused: false, inHeader: false, onControl: false, interacting: false };

  it("the header / chrome always flies to the tile and makes it live", () => {
    expect(doubleClickAction({ ...base, inHeader: true })).toBe("fly");
    expect(doubleClickAction({ ...base, inHeader: true, interacting: true })).toBe("fly");
  });

  it("the body of a tile you are not working in flies and starts interacting", () => {
    expect(doubleClickAction(base)).toBe("fly-and-interact");
  });

  it("inside content you are working in, double-click stays native (word select, cell edit)", () => {
    expect(doubleClickAction({ ...base, interacting: true })).toBe("native");
    expect(doubleClickAction({ ...base, onControl: true })).toBe("native");
    expect(doubleClickAction({ ...base, inHeader: true, onControl: true })).toBe("native");
  });

  it("a focused (full-screen) tile keeps native double-click", () => {
    expect(doubleClickAction({ ...base, focused: true, inHeader: true })).toBe("native");
  });
});
