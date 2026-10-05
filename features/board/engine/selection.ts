/**
 * Board — selection maths (pure). The marquee's hit test and what a group move
 * carries. Reads the camera store's item map (`getItems()`): a tile is keyed
 * by its id; a frame by `frame:<frame id>`, its rect grown upward by its title
 * band (`FRAME_TITLE_BAND`, so a fly-to shows the name). Selections hold the
 * plain ids of both.
 *
 * Champions: Figma / tldraw / Miro — a marquee selects what it touches; a
 * marquee that STARTS inside a frame selects inside it, never the frame; a
 * moved frame carries everything inside it.
 */

import type { Rect } from "./camera";

/** World px above a frame kept in view with it (its label at fit zoom). */
export const FRAME_TITLE_BAND = 110;

const FRAME_KEY = "frame:";

export function isFrameKey(key: string): boolean {
  return key.startsWith(FRAME_KEY);
}

/** The camera store's key for a frame id. */
export function frameKey(frameId: string): string {
  return `${FRAME_KEY}${frameId}`;
}

/** A frame's own rect from its registered rect (which carries the title band). */
export function frameBody(registered: Rect): Rect {
  return { x: registered.x, y: registered.y + FRAME_TITLE_BAND, w: registered.w, h: Math.max(0, registered.h - FRAME_TITLE_BAND) };
}

/** The rect two corners span, in either order. */
export function rectFromCorners(a: { x: number; y: number }, b: { x: number; y: number }): Rect {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
}

function intersects(a: Rect, b: Rect): boolean {
  return a.x <= b.x + b.w && b.x <= a.x + a.w && a.y <= b.y + b.h && b.y <= a.y + a.h;
}

function contains(outer: Rect, p: { x: number; y: number }): boolean {
  return p.x >= outer.x && p.x <= outer.x + outer.w && p.y >= outer.y && p.y <= outer.y + outer.h;
}

function inside(inner: Rect, outer: Rect): boolean {
  return inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h;
}

/**
 * What a marquee from `start` covering `marquee` (world rects) selects: every
 * tile it touches, and every frame it touches unless the drag began inside
 * that frame (then the person is selecting the frame's tiles, not the frame).
 * Ids in the camera store's order.
 */
export function marqueeHits(
  marquee: Rect,
  items: ReadonlyMap<string, Rect>,
  start: { x: number; y: number },
): string[] {
  const out: string[] = [];
  for (const [key, rect] of items) {
    if (isFrameKey(key)) {
      const body = frameBody(rect);
      if (intersects(marquee, body) && !contains(body, start)) out.push(key.slice(FRAME_KEY.length));
    } else if (intersects(marquee, rect)) out.push(key);
  }
  return out;
}

/** Every item on the board, by selection id (⌘A). */
export function allSelectable(items: ReadonlyMap<string, Rect>): string[] {
  return [...items.keys()].map((key) => (isFrameKey(key) ? key.slice(FRAME_KEY.length) : key));
}

/**
 * What moving `selection` moves, with each item's rect now (a frame's own
 * rect, band excluded): the selected tiles, and each selected frame with
 * every tile whose centre it holds and every frame wholly inside it — a frame
 * carries its contents (Figma). Ids absent from the board are ignored.
 */
export function groupMoveSet(selection: readonly string[], items: ReadonlyMap<string, Rect>): Map<string, Rect> {
  const out = new Map<string, Rect>();
  for (const id of selection) {
    const tile = isFrameKey(id) ? undefined : items.get(id);
    if (tile) {
      out.set(id, tile);
      continue;
    }
    const registered = items.get(frameKey(id));
    if (!registered) continue;
    const body = frameBody(registered);
    out.set(id, body);
    for (const [key, rect] of items) {
      if (isFrameKey(key)) {
        const other = key.slice(FRAME_KEY.length);
        if (other === id) continue;
        const otherBody = frameBody(rect);
        if (inside(otherBody, body)) out.set(other, otherBody);
      } else if (contains(body, { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 })) out.set(key, rect);
    }
  }
  return out;
}

/** The box around rects (null for none). */
export function boundsOf(rects: Iterable<Rect>): Rect | null {
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
  return x0 === Infinity ? null : { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** The moves that shift every item of a move set by (dx, dy) from where it started. */
export function shiftMoves(start: ReadonlyMap<string, Rect>, dx: number, dy: number): { id: string; x: number; y: number }[] {
  return [...start].map(([id, r]) => ({ id, x: r.x + dx, y: r.y + dy }));
}
