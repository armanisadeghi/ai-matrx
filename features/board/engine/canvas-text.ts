/**
 * Board — words ON the canvas (pure): sticky notes and plain text.
 *
 * Champions: FigJam / Miro stickies, tldraw / Figma text.
 *  - A sticky is a coloured square card with no header: you type straight on
 *    it, the words shrink to fit, Tab makes the next one beside it (Miro).
 *  - Plain text is words with no box at all: it grows with what you type and
 *    wraps once you give it a width (tldraw).
 *
 * Both are SHAPES (`engine/shapes.ts`, kinds "sticky" / "text"): one selection,
 * move, resize, delete, undo, snap, marquee and toolbar model with drawings.
 * A sticky's words are a real Note (`board/sticky-notes.ts`); plain text lives
 * in the board document only.
 */

import type { Rect } from "./camera";
import { type BoardShape, type ShapeStyle, STICKY_SIZE, TEXT_SIZES, boundsOfPoints } from "./shapes";

/** World px between a sticky and the next one Tab makes. */
export const STICKY_GAP = 24;

const newId = (kind: string) => `${kind}:${Math.random().toString(36).slice(2, 10)}`;

/** A new, empty sticky centred on a world point. */
export function makeSticky(at: { x: number; y: number }, opts: { style?: Partial<ShapeStyle>; size?: number; text?: string; id?: string } = {}): BoardShape {
  const side = opts.size ?? STICKY_SIZE;
  const x = at.x - side / 2;
  const y = at.y - side / 2;
  return {
    id: opts.id ?? newId("sticky"),
    kind: "sticky",
    points: [
      { x, y },
      { x: x + side, y: y + side },
    ],
    ...(opts.style && Object.keys(opts.style).length ? { style: opts.style } : {}),
    ...(opts.text ? { text: opts.text } : {}),
  };
}

/** Tab while typing on a sticky: the next one to its right, same size and colour, empty (Miro). */
export function nextStickyBeside(sticky: BoardShape): BoardShape {
  const box = boundsOfPoints(sticky.points);
  const x = box.x + box.w + STICKY_GAP;
  return {
    id: newId("sticky"),
    kind: "sticky",
    points: [
      { x, y: box.y },
      { x: x + box.w, y: box.y + box.h },
    ],
    ...(sticky.style?.sticky ? { style: { sticky: sticky.style.sticky } } : {}),
  };
}

/**
 * New plain text at a world point (its top-left sits a little up-left of the
 * click so the caret lands where you clicked). It starts one line tall and as
 * wide as its words; the layer measures it as you type.
 */
export function makeText(at: { x: number; y: number }, opts: { text?: string; style?: Partial<ShapeStyle>; width?: number; id?: string } = {}): BoardShape {
  const size = TEXT_SIZES[opts.style?.textSize ?? "m"];
  const h = Math.round(size * 1.4);
  const w = opts.width ?? Math.max(size, 8);
  const x = at.x - 4;
  const y = at.y - h / 2;
  return {
    id: opts.id ?? newId("text"),
    kind: "text",
    points: [
      { x, y },
      { x: x + w, y: y + h },
    ],
    // Plain text reads left to right unless the person centres it.
    style: { textAlign: "start", ...opts.style },
    ...(opts.text ? { text: opts.text } : {}),
    ...(opts.width !== undefined ? { wrap: true } : {}),
  };
}

/**
 * A saved "label" tile (the retired Text tool tile) as plain text — the same
 * id, words and place, its width kept so the words wrap as they did. Its old
 * look (large, semibold) maps to size L, bold. Lossless and one-time: the next
 * save writes the text object, and no label node is ever written again.
 */
export function labelToText(node: { id: string; rect: Rect; text: string }): BoardShape {
  return {
    id: node.id,
    kind: "text",
    points: [
      { x: node.rect.x, y: node.rect.y },
      { x: node.rect.x + node.rect.w, y: node.rect.y + node.rect.h },
    ],
    style: { textSize: "l", textWeight: "bold", textAlign: "start" },
    ...(node.text ? { text: node.text } : {}),
    wrap: true,
  };
}

/** A Note's label for a sticky: its first line, short. */
export function stickyNoteLabel(text: string): string {
  const first = text.trim().split("\n")[0]?.trim() ?? "";
  if (!first) return "Sticky note";
  return first.length > 60 ? `${first.slice(0, 57)}…` : first;
}
