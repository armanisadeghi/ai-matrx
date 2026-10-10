/**
 * Board — arranging tiles (pure). What the "Arrange" commands and the
 * board's agent tools use: every function takes rects and returns new
 * positions; nothing here touches the board. Sizes never change — arranging
 * moves things, it does not resize them.
 */

import type { Rect } from "./camera";
import { findFreeSpot } from "./placement";

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

// ── Arranging a whole board: frames move as units, and grouping by type ─────

export interface Scene {
  tiles: readonly Placed[];
  frames: readonly Placed[];
}

/** The frame a tile belongs to: the smallest frame holding its centre. */
export function frameOf(tile: Rect, frames: readonly Placed[]): string | null {
  const cx = tile.x + tile.w / 2;
  const cy = tile.y + tile.h / 2;
  let best: Placed | null = null;
  for (const f of frames) {
    const r = f.rect;
    if (cx < r.x || cx > r.x + r.w || cy < r.y || cy > r.y + r.h) continue;
    if (!best || r.w * r.h < best.rect.w * best.rect.h) best = f;
  }
  return best?.id ?? null;
}

/**
 * The top-level things a board-wide arrangement moves: every frame (its tiles
 * ride along) and every tile outside a frame. A frame is the person's own
 * grouping, so arranging the board never breaks one up.
 */
export function boardUnits(scene: Scene): { units: Placed[]; members: Map<string, string[]> } {
  const members = new Map<string, string[]>(scene.frames.map((f) => [f.id, []]));
  const free: Placed[] = [];
  for (const t of scene.tiles) {
    const f = frameOf(t.rect, scene.frames);
    if (f) members.get(f)!.push(t.id);
    else free.push(t);
  }
  return { units: [...scene.frames, ...free], members };
}

/**
 * Units' new positions → the moves for everything on the board: a moved frame
 * carries its tiles by the same offset. Unmoved things are left out.
 */
export function unitMoves(
  scene: Scene,
  placed: readonly Placed[],
  members: Map<string, string[]>,
): { id: string; x: number; y: number }[] {
  const before = new Map<string, Rect>([...scene.tiles, ...scene.frames].map((p) => [p.id, p.rect]));
  const out: { id: string; x: number; y: number }[] = [];
  for (const p of placed) {
    const was = before.get(p.id);
    if (!was) continue;
    const dx = p.rect.x - was.x;
    const dy = p.rect.y - was.y;
    if (dx === 0 && dy === 0) continue;
    out.push({ id: p.id, x: p.rect.x, y: p.rect.y });
    for (const m of members.get(p.id) ?? []) {
      const r = before.get(m);
      if (r) out.push({ id: m, x: r.x + dx, y: r.y + dy });
    }
  }
  return out;
}

export interface TypedPlaced extends Placed {
  /** The group this item sorts into (its item type's key; frames use FRAME_GROUP). */
  group: string;
}

/** Frames sort before every item type when a board is arranged by type. */
export const FRAME_GROUP = "frame";

export interface TypeBlock {
  group: string;
  ids: string[];
  /** The block's bounding box after arranging. */
  rect: Rect;
}

/**
 * Arrange by type: items of one group sit together, groups in `order` (frames
 * first, unknown groups last by name), each group in rows of a shared column
 * width so every block lines up, in the reading order people already see.
 * Blocks flow like words on shelves: a block goes beside the previous one when
 * it fits the shelf (`columns` cells wide), else starts the next shelf — so a
 * board of many single-item types reads as a few rows, never one tall column
 * of singletons. Frames stay a shelf of their own. `groupGap` is the space
 * between blocks (room for a frame label when the blocks will be framed).
 */
export function arrangeByType(
  items: readonly TypedPlaced[],
  order: readonly string[],
  opts: { gap?: number; groupGap?: number; columns?: number; at?: { x: number; y: number } } = {},
): { placed: Placed[]; blocks: TypeBlock[] } {
  if (items.length === 0) return { placed: [], blocks: [] };
  const gap = opts.gap ?? DEFAULT_GAP;
  const groupGap = opts.groupGap ?? gap * 3;
  const start = opts.at ?? origin(items);
  const rank = (g: string) => (g === FRAME_GROUP ? -1 : order.indexOf(g) === -1 ? order.length : order.indexOf(g));
  const groups = new Map<string, TypedPlaced[]>();
  for (const i of readingOrder(items) as TypedPlaced[]) {
    const list = groups.get(i.group) ?? [];
    list.push(i);
    groups.set(i.group, list);
  }
  const keys = [...groups.keys()].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  const columns = Math.max(1, Math.round(opts.columns ?? Math.ceil(Math.sqrt(items.length))));
  const cellW = Math.max(...items.filter((i) => i.group !== FRAME_GROUP).map((i) => i.rect.w), 0);
  // A shelf holds `columns` single-cell blocks side by side.
  const shelfW = columns * cellW + (columns - 1) * groupGap;

  // Each block laid out at (0, 0) first: its size decides where it goes.
  const laid = keys.map((key) => {
    const list = groups.get(key)!;
    const at: Placed[] = [];
    let y = 0;
    let w = 0;
    // A column is as wide as the widest item IN THAT COLUMN of this block — never as wide as the
    // widest item of the whole board (a sticky beside a 560 px note sat 430 px from its neighbour).
    const colW: number[] = [];
    list.forEach((i, n) => {
      const c = n % columns;
      colW[c] = Math.max(colW[c] ?? 0, i.rect.w);
    });
    for (let r = 0; r * columns < list.length; r++) {
      const row = list.slice(r * columns, r * columns + columns);
      let x = 0;
      row.forEach((i, c) => {
        at.push({ id: i.id, rect: { ...i.rect, x, y } });
        // Frames keep their own width; tiles share their column's width.
        x += (key === FRAME_GROUP ? i.rect.w : colW[c]) + gap;
        w = Math.max(w, x - gap);
      });
      y += Math.max(...row.map((i) => i.rect.h)) + gap;
    }
    return { key, ids: list.map((i) => i.id), at, w, h: y - gap };
  });

  const placed: Placed[] = [];
  const blocks: TypeBlock[] = [];
  let x = start.x;
  let y = start.y;
  let shelfH = 0;
  let prevFrames = false;
  for (const b of laid) {
    const isFrames = b.key === FRAME_GROUP;
    const used = x > start.x;
    if (used && (isFrames || prevFrames || x - start.x + b.w > shelfW)) {
      x = start.x;
      y += shelfH + groupGap;
      shelfH = 0;
    }
    for (const p of b.at) placed.push({ id: p.id, rect: { ...p.rect, x: p.rect.x + x, y: p.rect.y + y } });
    blocks.push({ group: b.key, ids: b.ids, rect: { x, y, w: b.w, h: b.h } });
    x += b.w + groupGap;
    shelfH = Math.max(shelfH, b.h);
    prevFrames = isFrames;
  }
  return { placed, blocks };
}

export type ArrangeCommand =
  | { kind: "layout"; layout: ArrangeLayout }
  | { kind: "align"; edge: AlignEdge }
  | { kind: "distribute"; axis: DistributeAxis }
  | { kind: "by-type" }
  | { kind: "frames-by-type" };

/**
 * The part of a board a selection arrangement works on: the selected frames,
 * every tile inside one of them (it rides along), and the selected tiles.
 */
export function selectionScene<T extends Placed>(
  scene: { tiles: readonly T[]; frames: readonly Placed[] },
  only: readonly string[],
): { tiles: T[]; frames: Placed[] } {
  const chosen = new Set(only);
  const frames = scene.frames.filter((f) => chosen.has(f.id));
  const tiles = scene.tiles.filter((t) => chosen.has(t.id) || (frames.length > 0 && frameOf(t.rect, frames) !== null));
  return { tiles, frames };
}

/** Padding a type frame keeps around its tiles, and the space between framed blocks (label included). */
const TYPE_FRAME_PADDING = 64;
const TYPE_FRAME_GAP = TYPE_FRAME_PADDING * 2 + 180;

/**
 * One people-facing Arrange command over a board (pure): the moves, and for
 * "frames by type" the frames to draw. Board-wide, frames move as units with
 * their tiles; "frames by type" frames only the tiles that are not already in
 * a frame. Applied as ONE undo step by the host.
 */
export function planArrange(
  scene: { tiles: readonly TypedPlaced[]; frames: readonly Placed[] },
  command: ArrangeCommand,
  order: readonly string[] = [],
  /** Arrange only these (a multi-selection): selected frames still carry the tiles inside them. */
  only?: readonly string[],
): { moves: { id: string; x: number; y: number }[]; frames: { group: string; rect: Rect }[] } {
  // What stays where it is: arranged results are placed clear of it.
  let otherRects: Rect[] = [];
  if (only) {
    const inScope = selectionScene(scene, only);
    const ids = new Set([...inScope.tiles, ...inScope.frames].map((p) => p.id));
    otherRects = [...scene.tiles, ...scene.frames].filter((p) => !ids.has(p.id)).map((p) => p.rect);
    scene = inScope;
  }
  const { units, members } = boardUnits(scene);
  if (units.length === 0) return { moves: [], frames: [] };
  const groupOf = new Map(scene.tiles.map((t) => [t.id, t.group]));
  const typed: TypedPlaced[] = units.map((u) => ({ ...u, group: groupOf.get(u.id) ?? FRAME_GROUP }));
  let placed: Placed[];
  const frames: { group: string; rect: Rect }[] = [];
  switch (command.kind) {
    case "layout":
      placed = arrange(units, command.layout);
      break;
    case "align":
      placed = align(units, command.edge);
      break;
    case "distribute":
      placed = distribute(units, command.axis);
      break;
    case "by-type":
      placed = arrangeByType(typed, order).placed;
      break;
    case "frames-by-type": {
      const framed = arrangeByType(typed, order, { groupGap: TYPE_FRAME_GAP });
      placed = framed.placed;
      const at = new Map(placed.map((p) => [p.id, p]));
      for (const b of framed.blocks) {
        if (b.group === FRAME_GROUP) continue;
        frames.push({ group: b.group, rect: enclosingFrame(b.ids.map((id) => at.get(id)!), TYPE_FRAME_PADDING) });
      }
      // A frame grows outward around its tiles: shift everything so the new
      // frames start where the arrangement began instead of up and left of it.
      if (frames.length) {
        const shift = TYPE_FRAME_PADDING;
        placed = placed.map((p) => ({ id: p.id, rect: { ...p.rect, x: p.rect.x + shift, y: p.rect.y + shift } }));
        for (const f of frames) f.rect = { ...f.rect, x: f.rect.x + shift, y: f.rect.y + shift };
      }
      break;
    }
  }
  if (only && (command.kind === "by-type" || command.kind === "frames-by-type")) {
    const dx = clearOfOthers(placed, frames, otherRects);
    if (dx) {
      placed = placed.map((p) => ({ id: p.id, rect: { ...p.rect, x: p.rect.x + dx.x, y: p.rect.y + dx.y } }));
      for (const f of frames) f.rect = { ...f.rect, x: f.rect.x + dx.x, y: f.rect.y + dx.y };
    }
  }
  return { moves: unitMoves(scene, placed, members), frames };
}

/**
 * The shift that puts an arranged result clear of everything NOT being arranged (null when it
 * already is): the nearest free spot of the result's bounding box to where it started.
 */
function clearOfOthers(
  placed: readonly Placed[],
  frames: readonly { rect: Rect }[],
  others: readonly Rect[],
): { x: number; y: number } | null {
  const rects = [...placed.map((p) => p.rect), ...frames.map((f) => f.rect)];
  if (rects.length === 0 || others.length === 0) return null;
  const x0 = Math.min(...rects.map((r) => r.x));
  const y0 = Math.min(...rects.map((r) => r.y));
  const x1 = Math.max(...rects.map((r) => r.x + r.w));
  const y1 = Math.max(...rects.map((r) => r.y + r.h));
  const box = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  const spot = findFreeSpot(others, { w: box.w, h: box.h }, { x: box.x + box.w / 2, y: box.y + box.h / 2 }, DEFAULT_GAP);
  const shift = { x: spot.x - box.x, y: spot.y - box.y };
  return shift.x === 0 && shift.y === 0 ? null : shift;
}
