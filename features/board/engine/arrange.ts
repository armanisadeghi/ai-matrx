/**
 * Spatial view — arranging tiles (pure). What the "Arrange" commands and the
 * board's agent tools use: every function takes rects and returns new
 * positions; nothing here touches the board. Sizes never change — arranging
 * moves things, it does not resize them.
 */

import type { Rect } from "./camera";

export type ArrangeLayout = "grid" | "row" | "column" | "tidy";
export type AlignEdge = "left" | "center" | "right" | "top" | "middle" | "bottom";
export type DistributeAxis = "horizontal" | "vertical";

export interface Placed {
  id: string;
  rect: Rect;
}

const DEFAULT_GAP = 48;

/** The top-left of the group's bounding box — arrangements start where the group already is. */
function origin(items: readonly Placed[]): { x: number; y: number } {
  return {
    x: Math.min(...items.map((i) => i.rect.x)),
    y: Math.min(...items.map((i) => i.rect.y)),
  };
}

/** Reading order: rows by top edge (with slop), then left to right. */
export function readingOrder(items: readonly Placed[], slop = 80): Placed[] {
  return [...items].sort((a, b) =>
    Math.abs(a.rect.y - b.rect.y) <= slop ? a.rect.x - b.rect.x : a.rect.y - b.rect.y,
  );
}

/**
 * Lay items out. Order is reading order, so an arrangement keeps the sequence
 * people already see.
 *  - row / column: one line, `gap` apart.
 *  - grid: `columns` per row (default ⌈√n⌉), each row as tall as its tallest item.
 *  - tidy: a grid whose columns share the widest item's width, so uneven
 *    tiles line up in clean columns.
 */
export function arrange(
  items: readonly Placed[],
  layout: ArrangeLayout,
  opts: { gap?: number; columns?: number; at?: { x: number; y: number } } = {},
): Placed[] {
  if (items.length === 0) return [];
  const gap = opts.gap ?? DEFAULT_GAP;
  const start = opts.at ?? origin(items);
  const ordered = readingOrder(items);
  const place = (item: Placed, x: number, y: number): Placed => ({ id: item.id, rect: { ...item.rect, x, y } });

  if (layout === "row") {
    let x = start.x;
    return ordered.map((i) => {
      const p = place(i, x, start.y);
      x += i.rect.w + gap;
      return p;
    });
  }
  if (layout === "column") {
    let y = start.y;
    return ordered.map((i) => {
      const p = place(i, start.x, y);
      y += i.rect.h + gap;
      return p;
    });
  }

  const columns = Math.max(1, Math.round(opts.columns ?? Math.ceil(Math.sqrt(ordered.length))));
  const cellW = Math.max(...ordered.map((i) => i.rect.w));
  const out: Placed[] = [];
  let y = start.y;
  for (let r = 0; r * columns < ordered.length; r++) {
    const row = ordered.slice(r * columns, r * columns + columns);
    let x = start.x;
    for (const i of row) {
      out.push(place(i, x, y));
      x += (layout === "tidy" ? cellW : i.rect.w) + gap;
    }
    y += Math.max(...row.map((i) => i.rect.h)) + gap;
  }
  return out;
}

/** Line items up on one edge (or centre line) of the group's bounding box. */
export function align(items: readonly Placed[], edge: AlignEdge): Placed[] {
  if (items.length === 0) return [];
  const x0 = Math.min(...items.map((i) => i.rect.x));
  const y0 = Math.min(...items.map((i) => i.rect.y));
  const x1 = Math.max(...items.map((i) => i.rect.x + i.rect.w));
  const y1 = Math.max(...items.map((i) => i.rect.y + i.rect.h));
  return items.map(({ id, rect }) => {
    const r = { ...rect };
    if (edge === "left") r.x = x0;
    if (edge === "right") r.x = x1 - r.w;
    if (edge === "center") r.x = (x0 + x1) / 2 - r.w / 2;
    if (edge === "top") r.y = y0;
    if (edge === "bottom") r.y = y1 - r.h;
    if (edge === "middle") r.y = (y0 + y1) / 2 - r.h / 2;
    return { id, rect: r };
  });
}

/** Even spacing between items along an axis; the two outermost stay put. */
export function distribute(items: readonly Placed[], axis: DistributeAxis): Placed[] {
  if (items.length < 3) return items.map((i) => ({ id: i.id, rect: { ...i.rect } }));
  const horizontal = axis === "horizontal";
  const sorted = [...items].sort((a, b) => (horizontal ? a.rect.x - b.rect.x : a.rect.y - b.rect.y));
  const first = sorted[0].rect;
  const last = sorted[sorted.length - 1].rect;
  const span = horizontal ? last.x + last.w - first.x : last.y + last.h - first.y;
  const occupied = sorted.reduce((s, i) => s + (horizontal ? i.rect.w : i.rect.h), 0);
  const gap = (span - occupied) / (sorted.length - 1);
  let at = horizontal ? first.x : first.y;
  return sorted.map(({ id, rect }) => {
    const r = { ...rect };
    if (horizontal) r.x = at;
    else r.y = at;
    at += (horizontal ? r.w : r.h) + gap;
    return { id, rect: r };
  });
}

/** The frame rect that encloses items with `padding` around them (and room for its label). */
export function enclosingFrame(items: readonly Placed[], padding = 64): Rect {
  const x0 = Math.min(...items.map((i) => i.rect.x));
  const y0 = Math.min(...items.map((i) => i.rect.y));
  const x1 = Math.max(...items.map((i) => i.rect.x + i.rect.w));
  const y1 = Math.max(...items.map((i) => i.rect.y + i.rect.h));
  return { x: x0 - padding, y: y0 - padding, w: x1 - x0 + padding * 2, h: y1 - y0 + padding * 2 };
}
