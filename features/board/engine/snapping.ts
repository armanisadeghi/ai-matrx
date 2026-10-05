/**
 * Board — snapping while a tile is dragged or resized (pure; no React, no DOM).
 *
 *   smart guides (default ON) — the dragged rect's left / centre / right and
 *     top / middle / bottom snap to the same stops of nearby tiles, and a gap
 *     snaps to match a neighbouring gap (Figma smart guides, tldraw snapping).
 *     The threshold is in SCREEN px (`SNAP_THRESHOLD_PX / z` world px), so the
 *     feel is the same at 10% and at 400%.
 *   snap to grid (default OFF) — positions and the moving resize edge round to
 *     `GRID_SIZE` world px. When both are on the grid decides position; guides
 *     are still drawn where an edge happens to align.
 *   bypass — a held modifier (⌘ / Ctrl / Alt, see `isSnapBypass`) moves freely.
 *
 * Every function takes the candidate rects it should snap to; choosing them
 * (the tiles near the viewport) is `snap-gesture.ts`'s job.
 */

import type { Rect } from "./camera";
import type { ResizeHandle } from "./tile-gestures";

/** Grid cell, board px — the knob. The dot grid in `BoardViewport` uses it too. */
export const GRID_SIZE = 24;
/** How close an edge must be to snap, SCREEN px. */
export const SNAP_THRESHOLD_PX = 6;
/** A guide is drawn when edges agree within this many SCREEN px. */
const ALIGN_EPS_PX = 0.5;
/** Equal-spacing gaps must be at least this wide (screen px) to be marked. */
const MIN_GAP_PX = 4;

export type Axis = "x" | "y";

/** A line across aligned tiles. axis "x" = a vertical line at x = `at`, spanning y from..to. */
export interface GuideLine {
  axis: Axis;
  at: number;
  from: number;
  to: number;
}

/** An equal-spacing gap. axis "x" = a horizontal segment from x=`from` to x=`to` at y=`at`. */
export interface GapMark {
  axis: Axis;
  from: number;
  to: number;
  at: number;
}

export interface SnapOverlay {
  lines: GuideLine[];
  gaps: GapMark[];
}

export interface SnapOptions {
  /** Camera zoom. */
  z: number;
  smartGuides: boolean;
  grid: boolean;
  bypass: boolean;
  gridSize?: number;
  thresholdPx?: number;
}

export interface SnapResult {
  rect: Rect;
  overlay: SnapOverlay | null;
}

/** The modifiers that suspend snapping while held: ⌘ / Ctrl (Figma, tldraw) and Alt/Option. */
export function isSnapBypass(e: { metaKey?: boolean; ctrlKey?: boolean; altKey?: boolean }): boolean {
  return !!(e.metaKey || e.ctrlKey || e.altKey);
}

const P = { x: "x", y: "y" } as const;
const S = { x: "w", y: "h" } as const;
const cross = (a: Axis): Axis => (a === "x" ? "y" : "x");
const start = (r: Rect, a: Axis) => r[P[a]];
const size = (r: Rect, a: Axis) => r[S[a]];
const end = (r: Rect, a: Axis) => start(r, a) + size(r, a);
const stops = (r: Rect, a: Axis): number[] => [start(r, a), start(r, a) + size(r, a) / 2, end(r, a)];

function withStart(r: Rect, a: Axis, v: number): Rect {
  return a === "x" ? { ...r, x: v } : { ...r, y: v };
}

/** Smallest |other - mine| delta (signed) within `thr`, or null. */
function nearestDelta(mine: readonly number[], theirs: readonly number[], thr: number): number | null {
  let best: number | null = null;
  for (const m of mine) {
    for (const t of theirs) {
      const d = t - m;
      if (Math.abs(d) <= thr && (best === null || Math.abs(d) < Math.abs(best))) best = d;
    }
  }
  return best;
}

const overlaps = (a: Rect, b: Rect, axis: Axis) => start(a, axis) < end(b, axis) && end(a, axis) > start(b, axis);

/** The mid-point of two rects' shared span on `axis`. */
function sharedMid(a: Rect, b: Rect, axis: Axis): number {
  return (Math.max(start(a, axis), start(b, axis)) + Math.min(end(a, axis), end(b, axis))) / 2;
}

interface Row {
  /** Nearest rect before the dragged one, and the one before THAT. */
  left: Rect | null;
  left2: Rect | null;
  right: Rect | null;
  right2: Rect | null;
}

/** The tiles sharing a row (along `axis`) with `d`: its two nearest neighbours each way. */
function rowAround(d: Rect, others: readonly Rect[], axis: Axis): Row {
  const c = cross(axis);
  const mid = start(d, axis) + size(d, axis) / 2;
  const before: Rect[] = [];
  const after: Rect[] = [];
  for (const o of others) {
    if (!overlaps(o, d, c)) continue;
    (start(o, axis) + size(o, axis) / 2 < mid ? before : after).push(o);
  }
  before.sort((a, b) => end(b, axis) - end(a, axis));
  after.sort((a, b) => start(a, axis) - start(b, axis));
  return { left: before[0] ?? null, left2: before[1] ?? null, right: after[0] ?? null, right2: after[1] ?? null };
}

/** Start positions of `d` along `axis` that make a gap equal to a neighbouring gap. */
function spacingTargets(d: Rect, others: readonly Rect[], axis: Axis): number[] {
  const { left, left2, right, right2 } = rowAround(d, others, axis);
  const s = size(d, axis);
  const out: number[] = [];
  if (left && right && start(right, axis) - end(left, axis) >= s) out.push((end(left, axis) + start(right, axis) - s) / 2);
  if (left && left2) {
    const g = start(left, axis) - end(left2, axis);
    if (g >= 0) out.push(end(left, axis) + g);
  }
  if (right && right2) {
    const g = start(right2, axis) - end(right, axis);
    if (g >= 0) out.push(start(right, axis) - g - s);
  }
  return out;
}

/** Everything aligned or equally spaced at the rect's FINAL position. */
export function describe(d: Rect, others: readonly Rect[], z: number): SnapOverlay | null {
  const eps = ALIGN_EPS_PX / z;
  const lines = new Map<string, GuideLine>();
  for (const axis of ["x", "y"] as const) {
    const c = cross(axis);
    const mine = stops(d, axis);
    for (const o of others) {
      for (const m of mine) {
        for (const t of stops(o, axis)) {
          if (Math.abs(t - m) > eps) continue;
          const key = `${axis}:${Math.round(t * 100)}`;
          const from = Math.min(start(d, c), start(o, c));
          const to = Math.max(end(d, c), end(o, c));
          const line = lines.get(key);
          if (line) {
            line.from = Math.min(line.from, from);
            line.to = Math.max(line.to, to);
          } else lines.set(key, { axis, at: t, from, to });
        }
      }
    }
  }
  const gaps: GapMark[] = [];
  const minGap = MIN_GAP_PX / z;
  for (const axis of ["x", "y"] as const) {
    const { left, left2, right, right2 } = rowAround(d, others, axis);
    const mark = (a: Rect, b: Rect) =>
      gaps.push({ axis, from: end(a, axis), to: start(b, axis), at: sharedMid(a, b, cross(axis)) });
    const gl = left ? start(d, axis) - end(left, axis) : -1;
    const gr = right ? start(right, axis) - end(d, axis) : -1;
    if (left && right && gl >= minGap && Math.abs(gl - gr) <= eps) {
      mark(left, d);
      mark(d, right);
    }
    if (left && left2 && gl >= minGap && Math.abs(gl - (start(left, axis) - end(left2, axis))) <= eps) {
      mark(left2, left);
      mark(left, d);
    }
    if (right && right2 && gr >= minGap && Math.abs(gr - (start(right2, axis) - end(right, axis))) <= eps) {
      mark(d, right);
      mark(right, right2);
    }
  }
  const out = [...lines.values()];
  return out.length || gaps.length ? { lines: out, gaps } : null;
}

const roundTo = (v: number, g: number) => Math.round(v / g) * g;

/** The rect a drag should take: `raw` is where the pointer put it. */
export function snapMove(raw: Rect, others: readonly Rect[], o: SnapOptions): SnapResult {
  if (o.bypass) return { rect: raw, overlay: null };
  const thr = (o.thresholdPx ?? SNAP_THRESHOLD_PX) / o.z;
  let rect = raw;
  if (o.grid) {
    const g = o.gridSize ?? GRID_SIZE;
    rect = { ...raw, x: roundTo(raw.x, g), y: roundTo(raw.y, g) };
  } else if (o.smartGuides && others.length) {
    for (const axis of ["x", "y"] as const) {
      let best = nearestDelta(stops(rect, axis), others.flatMap((r) => stops(r, axis)), thr);
      for (const t of spacingTargets(rect, others, axis)) {
        const d = t - start(rect, axis);
        if (Math.abs(d) <= thr && (best === null || Math.abs(d) < Math.abs(best))) best = d;
      }
      if (best !== null) rect = withStart(rect, axis, start(rect, axis) + best);
    }
  }
  return { rect, overlay: o.smartGuides ? describe(rect, others, o.z) : null };
}

/**
 * The rect a resize should take: `raw` is `resizeRect`'s answer. Only the
 * edges the handle moves snap; the opposite edge stays put. Shift (aspect
 * lock) resizes are left exactly as the ratio made them.
 */
export function snapResize(
  raw: Rect,
  handle: ResizeHandle,
  others: readonly Rect[],
  o: SnapOptions & { min?: { w: number; h: number }; keepAspect?: boolean },
): SnapResult {
  if (o.bypass || o.keepAspect) return { rect: raw, overlay: null };
  const thr = (o.thresholdPx ?? SNAP_THRESHOLD_PX) / o.z;
  const g = o.gridSize ?? GRID_SIZE;
  let rect = raw;
  const edges: { axis: Axis; side: "start" | "end" }[] = [];
  if (handle.includes("w")) edges.push({ axis: "x", side: "start" });
  if (handle.includes("e")) edges.push({ axis: "x", side: "end" });
  if (handle.includes("n")) edges.push({ axis: "y", side: "start" });
  if (handle.includes("s")) edges.push({ axis: "y", side: "end" });
  for (const { axis, side } of edges) {
    const at = side === "start" ? start(rect, axis) : end(rect, axis);
    let delta: number | null = null;
    if (o.grid) delta = roundTo(at, g) - at;
    else if (o.smartGuides && others.length) delta = nearestDelta([at], others.flatMap((r) => stops(r, axis)), thr);
    if (delta === null || delta === 0) continue;
    const next =
      side === "start"
        ? { ...rect, [P[axis]]: start(rect, axis) + delta, [S[axis]]: size(rect, axis) - delta }
        : { ...rect, [S[axis]]: size(rect, axis) + delta };
    const min = o.min ?? { w: 0, h: 0 };
    if (next.w < min.w || next.h < min.h) continue; // never snap below the minimum
    rect = next as Rect;
  }
  return { rect, overlay: o.smartGuides ? describe(rect, others, o.z) : null };
}
