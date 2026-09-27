// features/war-room/components/board/boardLayout.ts
//
// The Board view's arrangement — pure: sizes, placement, parse, serialise.
//
// Every THREAD is a frame; every PART of a thread (task, notes, audio, chat,
// resources, one per attached entity type — the tabs `useThreadTabs` derives,
// minus the stacked "All" view) is its own tile inside that frame, so a
// person can have notes, files, audio and chat all out at once, nothing on top
// of anything.
//
// Remembered on the room row at `workspace.war_rooms.metadata.spatial_layout`:
//   { v: 2, parts: { "<threadId>:<tab>": {x,y,w,h} }, parked: [key], removed: [key], camera }
// A frame is never stored — it is the bounding box of its thread's part rects
// plus padding and the header band, so it moves when its parts move. A parked
// or removed part keeps its rect (its space stays reserved in the frame, and
// restoring puts it back exactly there). The v1 per-thread `tiles` map is
// ignored (pre-launch — no shim).

import { type Camera, type Rect, rectsIntersect } from "@/features/spatial/engine/camera";
import type { ThreadTab } from "@/features/war-room/types";
import type { Json } from "@/types/database.types";

export const BOARD_LAYOUT_KEY = "spatial_layout";

// ── sizes ────────────────────────────────────────────────────────────────
export const PART_W = 600;
export const PART_H = 560;
/** Chat and Notes are read and written at length — they get the tall tile. */
export const PART_TALL_H = 760;
export const PART_GAP = 48;
export const PART_COLS = 3;
/** Inside a frame, around its parts. */
export const FRAME_PAD = 72;
/** The frame's header band (thread controls) above the first row of parts. */
export const FRAME_HEADER_H = 56;
/** Between frames, side by side. */
export const FRAME_GAP_X = 160;
/** Between frame rows — a little more, the frame's title sits above it. */
export const FRAME_GAP_Y = 200;
const MAX_FRAME_COLS = 3;

/** The tabs a thread shows on the board: every derived tab except "All". */
export function boardPartTabs(tabs: readonly ThreadTab[]): ThreadTab[] {
  return tabs.filter((t) => t !== "combined");
}

export function partSize(tab: ThreadTab): { w: number; h: number } {
  return tab === "agent" || tab === "notes"
    ? { w: PART_W, h: PART_TALL_H }
    : { w: PART_W, h: PART_H };
}

export function partKey(threadId: string, tab: ThreadTab): string {
  return `${threadId}:${tab}`;
}

/** Split a part key. Thread ids are UUIDs (no colon); a tab may hold one (`entity:x`). */
export function parsePartKey(key: string): { threadId: string; tab: ThreadTab } | null {
  const i = key.indexOf(":");
  if (i <= 0 || i === key.length - 1) return null;
  return { threadId: key.slice(0, i), tab: key.slice(i + 1) as ThreadTab };
}

export function isPartKey(id: string): boolean {
  return id.includes(":");
}

// ── the stored shape ─────────────────────────────────────────────────────
export interface BoardLayout {
  v: 2;
  parts: Record<string, Rect>;
  /** Parts on the shelf (throw right). Board-local — never touches thread data. */
  parked: string[];
  /** Parts taken off the board (throw down); restored from the frame's Parts menu. */
  removed: string[];
  camera: Camera | null;
}

export function emptyBoardLayout(): BoardLayout {
  return { v: 2, parts: {}, parked: [], removed: [], camera: null };
}

function isNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function asRect(v: unknown): Rect | null {
  if (!v || typeof v !== "object") return null;
  const r = v as Record<string, unknown>;
  if (!isNum(r.x) || !isNum(r.y) || !isNum(r.w) || !isNum(r.h)) return null;
  if (r.w <= 0 || r.h <= 0) return null;
  return { x: r.x, y: r.y, w: r.w, h: r.h };
}

function asCamera(v: unknown): Camera | null {
  if (!v || typeof v !== "object") return null;
  const c = v as Record<string, unknown>;
  if (!isNum(c.x) || !isNum(c.y) || !isNum(c.z) || c.z <= 0) return null;
  return { x: c.x, y: c.y, z: c.z };
}

function asKeyList(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((k): k is string => typeof k === "string" && isPartKey(k)) : [];
}

/** Read the saved layout off a room's `metadata`; anything malformed (or v1) is dropped. */
export function parseBoardLayout(metadata: Json | null | undefined): BoardLayout {
  const out = emptyBoardLayout();
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return out;
  const raw = (metadata as Record<string, unknown>)[BOARD_LAYOUT_KEY];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  const layout = raw as Record<string, unknown>;
  // The camera is still valid across versions; per-thread v1 rects are not.
  out.camera = asCamera(layout.camera);
  if (layout.v !== 2) return out;
  if (layout.parts && typeof layout.parts === "object") {
    for (const [key, r] of Object.entries(layout.parts as Record<string, unknown>)) {
      const rect = asRect(r);
      if (rect && isPartKey(key)) out.parts[key] = rect;
    }
  }
  out.parked = asKeyList(layout.parked);
  out.removed = asKeyList(layout.removed);
  return out;
}

const round = (n: number) => Math.round(n * 100) / 100;

/** The jsonb written back — only parts of threads still in the room, rounded. */
export function serializeBoardLayout(layout: BoardLayout, roomThreadIds: readonly string[]): Json {
  const keep = new Set(roomThreadIds);
  const inRoom = (key: string) => {
    const p = parsePartKey(key);
    return !!p && keep.has(p.threadId);
  };
  const parts: Record<string, Json> = {};
  for (const [key, r] of Object.entries(layout.parts)) {
    if (!inRoom(key)) continue;
    parts[key] = { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h) };
  }
  return {
    v: 2,
    parts,
    parked: layout.parked.filter(inRoom),
    removed: layout.removed.filter(inRoom),
    camera: layout.camera
      ? { x: round(layout.camera.x), y: round(layout.camera.y), z: round(layout.camera.z) }
      : null,
  };
}

// ── geometry ─────────────────────────────────────────────────────────────
export interface ThreadParts {
  threadId: string;
  /** The board tabs of this thread, in the thread's own order. */
  tabs: readonly ThreadTab[];
}

/** Parts in a grid, the first one's top-left at `origin`. */
export function gridParts(
  tabs: readonly ThreadTab[],
  origin: { x: number; y: number },
): Array<{ tab: ThreadTab; rect: Rect }> {
  const out: Array<{ tab: ThreadTab; rect: Rect }> = [];
  let y = origin.y;
  for (let row = 0; row * PART_COLS < tabs.length; row++) {
    const rowTabs = tabs.slice(row * PART_COLS, row * PART_COLS + PART_COLS);
    let rowH = 0;
    rowTabs.forEach((tab, col) => {
      const size = partSize(tab);
      out.push({ tab, rect: { x: origin.x + col * (PART_W + PART_GAP), y, w: size.w, h: size.h } });
      rowH = Math.max(rowH, size.h);
    });
    y += rowH + PART_GAP;
  }
  return out;
}

/** The frame around a set of part rects: padding all round, the header band on top. */
export function frameAround(partRects: readonly Rect[]): Rect | null {
  if (partRects.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const r of partRects) {
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.w);
    maxY = Math.max(maxY, r.y + r.h);
  }
  return {
    x: minX - FRAME_PAD,
    y: minY - FRAME_PAD - FRAME_HEADER_H,
    w: maxX - minX + FRAME_PAD * 2,
    h: maxY - minY + FRAME_PAD * 2 + FRAME_HEADER_H,
  };
}

/** Where the first part sits relative to its frame's top-left. */
const PART_OFFSET = { x: FRAME_PAD, y: FRAME_PAD + FRAME_HEADER_H };

/** Size of a fresh frame for these tabs. */
export function frameSizeFor(tabs: readonly ThreadTab[]): { w: number; h: number } {
  const rect = frameAround(gridParts(tabs.length ? tabs : ["task"], PART_OFFSET).map((p) => p.rect));
  return rect ? { w: rect.w, h: rect.h } : { w: 0, h: 0 };
}

/** A thread's frame from the layout: every remembered rect of its current tabs. */
export function threadFrame(
  threadId: string,
  tabs: readonly ThreadTab[],
  parts: Readonly<Record<string, Rect>>,
): Rect | null {
  const rects = tabs.flatMap((tab) => {
    const r = parts[partKey(threadId, tab)];
    return r ? [r] : [];
  });
  return frameAround(rects);
}

function grow(r: Rect, by: number): Rect {
  return { x: r.x - by, y: r.y - by, w: r.w + by * 2, h: r.h + by * 2 };
}

/**
 * Where a new frame goes: the free slot beside or below an existing frame
 * nearest to `near` (reading order breaks ties); never within the frame gap of
 * another frame. With no frames, the origin.
 */
export function nextFrameSlot(
  frames: readonly Rect[],
  size: { w: number; h: number },
  near: { x: number; y: number },
): { x: number; y: number } {
  if (frames.length === 0) return { x: 0, y: 0 };
  const fits = (x: number, y: number) => {
    const r = { x, y, w: size.w, h: size.h };
    return frames.every(
      (f) =>
        !rectsIntersect(r, {
          x: f.x - FRAME_GAP_X,
          y: f.y - FRAME_GAP_Y,
          w: f.w + FRAME_GAP_X * 2,
          h: f.h + FRAME_GAP_Y * 2,
        }),
    );
  };
  const candidates: Array<{ x: number; y: number }> = [];
  for (const f of frames) {
    candidates.push({ x: f.x + f.w + FRAME_GAP_X, y: f.y });
    candidates.push({ x: f.x, y: f.y + f.h + FRAME_GAP_Y });
  }
  const dist = (c: { x: number; y: number }) =>
    Math.hypot(c.x + size.w / 2 - near.x, c.y + size.h / 2 - near.y);
  candidates.sort((a, b) => dist(a) - dist(b) || a.y - b.y || a.x - b.x);
  for (const c of candidates) if (fits(c.x, c.y)) return c;
  // Everything near is taken: a new row below everything.
  const minX = Math.min(...frames.map((f) => f.x));
  const bottom = Math.max(...frames.map((f) => f.y + f.h));
  return { x: minX, y: bottom + FRAME_GAP_Y };
}

/**
 * Give every part that has no rect one — the ONE placement rule, used on first
 * open and whenever the room changes.
 *
 *  • A thread with nothing remembered gets a whole new frame: on a board with
 *    no frames yet, a tidy reading-order grid of frames; otherwise the next
 *    free frame slot nearest to `near` (where you are looking).
 *  • A thread that already has a frame and gains a part (a new attachment
 *    tab): the part lands in the free cell of its frame's grid that grows the
 *    frame least, never bringing the frame within the gap of another frame.
 *
 * Returns only the NEW rects, keyed by part key. Pure and deterministic.
 */
export function placeMissingParts(
  threads: readonly ThreadParts[],
  parts: Readonly<Record<string, Rect>>,
  near?: { x: number; y: number },
): Record<string, Rect> {
  const placed: Record<string, Rect> = {};
  const all = (): Record<string, Rect> => ({ ...parts, ...placed });

  const framesExcept = (threadId: string | null): Rect[] =>
    threads.flatMap((t) => {
      if (t.threadId === threadId) return [];
      const f = threadFrame(t.threadId, t.tabs, all());
      return f ? [f] : [];
    });

  const fresh = threads.filter((t) => !threadFrame(t.threadId, t.tabs, parts));
  const known = threads.filter((t) => threadFrame(t.threadId, t.tabs, parts));

  // 1. Threads that already have a frame, gaining parts.
  for (const t of known) {
    for (const tab of t.tabs) {
      if (parts[partKey(t.threadId, tab)]) continue;
      placed[partKey(t.threadId, tab)] = placePartInFrame(
        t.tabs.flatMap((x) => {
          const r = all()[partKey(t.threadId, x)];
          return r ? [r] : [];
        }),
        partSize(tab),
        framesExcept(t.threadId),
      );
    }
  }

  // 2. Threads with no frame yet.
  if (fresh.length === 0) return placed;
  const existing = framesExcept(null);
  if (existing.length === 0) {
    // Nothing on the board: a reading-order grid of frames.
    const cols = Math.min(MAX_FRAME_COLS, Math.max(1, Math.ceil(Math.sqrt(fresh.length))));
    let y = 0;
    for (let row = 0; row * cols < fresh.length; row++) {
      const rowThreads = fresh.slice(row * cols, row * cols + cols);
      let x = 0;
      let rowH = 0;
      for (const t of rowThreads) {
        const size = frameSizeFor(t.tabs);
        for (const p of gridParts(t.tabs, { x: x + PART_OFFSET.x, y: y + PART_OFFSET.y }))
          placed[partKey(t.threadId, p.tab)] = p.rect;
        x += size.w + FRAME_GAP_X;
        rowH = Math.max(rowH, size.h);
      }
      y += rowH + FRAME_GAP_Y;
    }
    return placed;
  }
  const frames = [...existing];
  const target = near ?? centreOf(frames);
  for (const t of fresh) {
    if (t.tabs.length === 0) continue;
    const size = frameSizeFor(t.tabs);
    const at = nextFrameSlot(frames, size, target);
    for (const p of gridParts(t.tabs, { x: at.x + PART_OFFSET.x, y: at.y + PART_OFFSET.y }))
      placed[partKey(t.threadId, p.tab)] = p.rect;
    frames.push({ x: at.x, y: at.y, w: size.w, h: size.h });
  }
  return placed;
}

/**
 * A new part for an existing frame. Candidates are the cells of the frame's
 * part grid (and a few beyond it, right and below). A cell is allowed when it
 * touches none of the frame's parts AND the frame it would grow into still
 * keeps the frame gap to every other frame; the one that grows the frame least
 * wins (reading order breaks ties). A frame boxed in on every side takes the
 * first cell clear of its own parts.
 */
function placePartInFrame(
  own: readonly Rect[],
  size: { w: number; h: number },
  otherFrames: readonly Rect[],
): Rect {
  const origin = { x: Math.min(...own.map((r) => r.x)), y: Math.min(...own.map((r) => r.y)) };
  const bottom = Math.max(...own.map((r) => r.y + r.h));
  const rows = Math.ceil((bottom - origin.y) / (PART_H + PART_GAP)) + 2;
  const clearOfParts = (r: Rect) => own.every((o) => !rectsIntersect(grow(r, PART_GAP), o));
  const clearOfFrames = (frame: Rect) =>
    otherFrames.every(
      (f) =>
        !rectsIntersect(frame, {
          x: f.x - FRAME_GAP_X,
          y: f.y - FRAME_GAP_Y,
          w: f.w + FRAME_GAP_X * 2,
          h: f.h + FRAME_GAP_Y * 2,
        }),
    );
  let best: { rect: Rect; area: number } | null = null;
  let fallback: Rect | null = null;
  for (let row = 0; row <= rows; row++) {
    for (let col = 0; col < PART_COLS + 2; col++) {
      const rect = {
        x: origin.x + col * (PART_W + PART_GAP),
        y: origin.y + row * (PART_H + PART_GAP),
        w: size.w,
        h: size.h,
      };
      if (!clearOfParts(rect)) continue;
      if (!fallback && col < PART_COLS) fallback = rect;
      const frame = frameAround([...own, rect]);
      if (!frame || !clearOfFrames(frame)) continue;
      const area = frame.w * frame.h;
      if (!best || area < best.area) best = { rect, area };
    }
  }
  return best?.rect ?? fallback ?? { x: origin.x, y: bottom + PART_GAP, w: size.w, h: size.h };
}

function centreOf(rects: readonly Rect[]): { x: number; y: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const r of rects) {
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.w);
    maxY = Math.max(maxY, r.y + r.h);
  }
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
}
