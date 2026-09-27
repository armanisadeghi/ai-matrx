/**
 * Spatial view — where a NEW tile goes (pure).
 *
 * A result that arrives while you watch must land where you are looking,
 * never on top of something else (Miro, FigJam and Heptabase all place new
 * cards in the nearest free space to the viewport centre). We search outward
 * from the preferred point on a grid, ring by ring, and take the first spot
 * whose rect — grown by `gap` — touches nothing.
 */

import { type Rect, rectsIntersect } from "./camera";

const GRID = 40;
const MAX_RINGS = 60;

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
  const free = (r: Rect) => {
    const grown = { x: r.x - gap, y: r.y - gap, w: r.w + gap * 2, h: r.h + gap * 2 };
    return occupied.every((o) => !rectsIntersect(grown, o));
  };
  const first = at(near.x, near.y);
  if (free(first)) return first;
  for (let ring = 1; ring <= MAX_RINGS; ring++) {
    const d = ring * GRID;
    // Walk the ring's perimeter; prefer right, then below (reading order).
    for (let i = -ring; i <= ring; i++) {
      for (const [ox, oy] of [
        [d, i * GRID],
        [i * GRID, d],
        [-d, i * GRID],
        [i * GRID, -d],
      ] as const) {
        const r = at(near.x + ox, near.y + oy);
        if (free(r)) return r;
      }
    }
  }
  // Everything near is taken: go below everything.
  const bottom = occupied.reduce((m, o) => Math.max(m, o.y + o.h), near.y);
  return at(near.x, bottom + gap + size.h / 2);
}
