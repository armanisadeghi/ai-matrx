/**
 * Spatial view — camera math (pure; no React, no DOM).
 *
 * One world plane, one camera. The world is drawn by applying ONE transform
 * to ONE container: `translate(x, y) scale(z)`. A world point `w` lands on
 * screen at `w * z + (x, y)`. Every item lives in world coordinates and never
 * learns about the camera — which is what lets 300 live tiles pan and zoom
 * at compositor speed (tldraw / Excalidraw / Heptabase all do the same).
 */

export interface Camera {
  /** Screen-space offset of the world origin, in CSS px. */
  x: number;
  y: number;
  /** Scale: 1 = 100%. */
  z: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Size {
  w: number;
  h: number;
}

export const MIN_ZOOM = 0.05;
export const MAX_ZOOM = 4;

export function clampZoom(z: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
}

export function screenToWorld(cam: Camera, sx: number, sy: number) {
  return { x: (sx - cam.x) / cam.z, y: (sy - cam.y) / cam.z };
}

export function worldToScreen(cam: Camera, wx: number, wy: number) {
  return { x: wx * cam.z + cam.x, y: wy * cam.z + cam.y };
}

/** Zoom to `nextZ` keeping the world point under screen (sx, sy) fixed —
 * the Figma convention: the thing under your cursor stays under your cursor. */
export function zoomAt(cam: Camera, sx: number, sy: number, nextZ: number): Camera {
  const z = clampZoom(nextZ);
  const w = screenToWorld(cam, sx, sy);
  return { x: sx - w.x * z, y: sy - w.y * z, z };
}

export function panBy(cam: Camera, dx: number, dy: number): Camera {
  return { x: cam.x + dx, y: cam.y + dy, z: cam.z };
}

/** The world rect currently visible through a viewport of `size`. */
export function visibleWorldRect(cam: Camera, size: Size): Rect {
  const tl = screenToWorld(cam, 0, 0);
  return { x: tl.x, y: tl.y, w: size.w / cam.z, h: size.h / cam.z };
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function inflateRect(r: Rect, by: number): Rect {
  return { x: r.x - by, y: r.y - by, w: r.w + by * 2, h: r.h + by * 2 };
}

export function unionRects(rects: readonly Rect[]): Rect | null {
  if (rects.length === 0) return null;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const r of rects) {
    x0 = Math.min(x0, r.x);
    y0 = Math.min(y0, r.y);
    x1 = Math.max(x1, r.x + r.w);
    y1 = Math.max(y1, r.y + r.h);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** The camera that centres `target` in a viewport of `size` with `padding`
 * screen px on every side, never zooming past `maxZ` (fitting one small tile
 * should not blow it up to 400%). */
export function fitRect(target: Rect, size: Size, padding = 48, maxZ = 1): Camera {
  const availW = Math.max(1, size.w - padding * 2);
  const availH = Math.max(1, size.h - padding * 2);
  const z = clampZoom(Math.min(availW / target.w, availH / target.h, maxZ));
  return {
    z,
    x: size.w / 2 - (target.x + target.w / 2) * z,
    y: size.h / 2 - (target.y + target.h / 2) * z,
  };
}

/** Interpolate cameras for a fly-to. Zoom interpolates in log space so a
 * 0.1 → 1 flight feels even (linear zoom lerp lurches at the far end), and
 * the position is derived from the interpolated view centre so the target
 * never drifts sideways mid-flight. */
export function lerpCamera(a: Camera, b: Camera, t: number, size: Size): Camera {
  const z = Math.exp(Math.log(a.z) + (Math.log(b.z) - Math.log(a.z)) * t);
  const ca = screenToWorld(a, size.w / 2, size.h / 2);
  const cb = screenToWorld(b, size.w / 2, size.h / 2);
  const cx = ca.x + (cb.x - ca.x) * t;
  const cy = ca.y + (cb.y - ca.y) * t;
  return { z, x: size.w / 2 - cx * z, y: size.h / 2 - cy * z };
}

export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

/** Wheel delta → zoom factor. Trackpad pinch arrives as ctrl+wheel with small
 * deltas; a mouse wheel notch arrives as ~100px — both must feel right, so the
 * factor is exponential in the delta and the delta is clamped. */
export function wheelZoomFactor(deltaY: number, deltaMode: number): number {
  const px = deltaMode === 1 ? deltaY * 16 : deltaMode === 2 ? deltaY * 400 : deltaY;
  const clamped = Math.max(-60, Math.min(60, px));
  return Math.exp(-clamped * 0.01);
}

/** Serialise / parse a camera for deep links (`#cam=x,y,z`). */
export function cameraToHash(cam: Camera): string {
  return `cam=${Math.round(cam.x)},${Math.round(cam.y)},${cam.z.toFixed(3)}`;
}

export function cameraFromHash(hash: string): Camera | null {
  const m = /cam=(-?[\d.]+),(-?[\d.]+),([\d.]+)/.exec(hash);
  if (!m) return null;
  const cam = { x: Number(m[1]), y: Number(m[2]), z: clampZoom(Number(m[3])) };
  return Number.isFinite(cam.x) && Number.isFinite(cam.y) && Number.isFinite(cam.z)
    ? cam
    : null;
}
