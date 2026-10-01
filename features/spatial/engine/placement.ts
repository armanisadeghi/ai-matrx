/**
 * Spatial view — where a NEW tile goes (pure).
 *
 * A result that arrives while you watch must land where you are looking,
 * never on top of something else (Miro, FigJam and Heptabase all place new
 * cards in the nearest free space to the viewport centre).
 *
 * Two rules:
 *   - `findFreeSpot(near)` — ONE tile at a point (a drop, an agent's add): the
 *     point itself if free, else the nearest free spot, searched ring by ring;
 *     inside a ring the nearest-to-axis spots come first, right, then below,
 *     then left, then above (reading order).
 *   - `placeInFlow(flow)` — a RUN of adds (the Add menu used again and again):
 *     the tiles fill a block across the view in reading order, left to right,
 *     then the next row down, like text. Searching from each new tile's own
 *     centre made 15 adds a diagonal staircase 7,000 units tall: the camera
 *     flew to each new tile, so the next search started on top of it and the
 *     ring's first free spot was up and to the right, every time.
 */

import { type Rect, rectsIntersect } from "./camera";

const GRID = 40;
const MAX_RINGS = 60;
/** How far below its top a flow searches before giving up (rows of GRID). */
const MAX_FLOW_ROWS = 600;

/** Ring offsets in search order: nearest the axes first; right, below, left, above. */
function ringOffsets(ring: number): [number, number][] {
  const out: [number, number][] = [];
  const d = ring * GRID;
  for (let k = 0; k <= ring; k++) {
    for (const i of k === 0 ? [0] : [k, -k]) {
      const o = i * GRID;
      out.push([d, o], [o, d], [-d, o], [o, -d]);
    }
  }
  return out;
}

/** The first occupied rect `r` (grown by `gap`) touches, or null when it is free. */
function hit(occupied: readonly Rect[], r: Rect, gap: number): Rect | null {
  const grown = { x: r.x - gap, y: r.y - gap, w: r.w + gap * 2, h: r.h + gap * 2 };
  return occupied.find((o) => rectsIntersect(grown, o)) ?? null;
}

function isFree(occupied: readonly Rect[], r: Rect, gap: number): boolean {
  return hit(occupied, r, gap) === null;
}

function below(occupied: readonly Rect[], x: number, top: number, size: { w: number; h: number }, gap: number): Rect {
  const bottom = occupied.reduce((m, o) => Math.max(m, o.y + o.h), top - gap);
  return { x: Math.round(x), y: Math.round(bottom + gap), w: size.w, h: size.h };
}

export function findFreeSpot(
  occupied: readonly Rect[],
  size: { w: number; h: number },
  /** World point the new tile should be centred on, if free. */
  near: { x: number; y: number },
  gap = 40,
): Rect {
  const at = (cx: number, cy: number): Rect => ({
    x: Math.round(cx - size.w / 2),
    y: Math.round(cy - size.h / 2),
    w: size.w,
    h: size.h,
  });
  const first = at(near.x, near.y);
  if (isFree(occupied, first, gap)) return first;
  for (let ring = 1; ring <= MAX_RINGS; ring++) {
    for (const [ox, oy] of ringOffsets(ring)) {
      const r = at(near.x + ox, near.y + oy);
      if (isFree(occupied, r, gap)) return r;
    }
  }
  // Everything near is taken: go below everything.
  return below(occupied, near.x - size.w / 2, near.y - size.h / 2, size, gap);
}

/** A block new tiles fill in reading order: rows start at `y`, span `x … x + w`. */
export interface PlacementFlow {
  x: number;
  y: number;
  w: number;
}

/**
 * The flow a run of adds fills: the visible board area (`view`, world px, the
 * chrome already taken off), with rows starting on the view centre's line so
 * the first tile of a run sits where the person is looking.
 */
export function flowForView(view: Rect, size: { w: number; h: number }, margin = 40): PlacementFlow {
  const w = Math.max(size.w, view.w - margin * 2);
  return {
    x: Math.round(view.x + (view.w - w) / 2),
    y: Math.round(view.y + view.h / 2 - size.h / 2),
    w: Math.round(w),
  };
}

/**
 * The first free spot in the flow in reading order: along each row left to
 * right, rows top to bottom (GRID steps), never wider than the flow (a tile
 * wider than the flow takes a row's start). When `near` is given and that
 * centred spot is free and inside the flow, it wins (a run's first tile lands
 * centred, as `findFreeSpot` would put it).
 */
export function placeInFlow(
  occupied: readonly Rect[],
  size: { w: number; h: number },
  flow: PlacementFlow,
  near?: { x: number; y: number },
  gap = 40,
): Rect {
  if (near) {
    const centred = { x: Math.round(near.x - size.w / 2), y: Math.round(near.y - size.h / 2), w: size.w, h: size.h };
    const inside = centred.x >= flow.x && centred.x + size.w <= flow.x + Math.max(flow.w, size.w);
    if (inside && centred.y >= flow.y && isFree(occupied, centred, gap)) return centred;
  }
  const span = Math.max(flow.w, size.w);
  for (let row = 0; row < MAX_FLOW_ROWS; row++) {
    const y = flow.y + row * GRID;
    for (let x = flow.x; x + size.w <= flow.x + span; ) {
      const r = { x: Math.round(x), y: Math.round(y), w: size.w, h: size.h };
      const blocker = hit(occupied, r, gap);
      if (!blocker) return r;
      // Skip past what is in the way (a step of GRID at least).
      x = Math.max(x + GRID, blocker.x + blocker.w + gap);
    }
  }
  return below(occupied, flow.x, flow.y, size, gap);
}
