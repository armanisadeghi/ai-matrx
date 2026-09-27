// features/war-room/components/board/boardLayout.ts
//
// The Board view's remembered arrangement — where each thread's tile sits and
// where the camera was — stored on the room row at
// `workspace.war_rooms.metadata.spatial_layout`. Pure: parse, place, serialise.
//
// A tile's rect is kept even while its thread is parked (hidden), so restoring
// a thread puts it back exactly where it was; rects of threads that no longer
// belong to the room are pruned on the next save.

import type { Camera, Rect } from "@/features/spatial/engine/camera";
import { findFreeSpot } from "@/features/spatial/engine/placement";
import type { Json } from "@/types/database.types";

export const BOARD_LAYOUT_KEY = "spatial_layout";

/** A thread card is tuned for a ~720px column; below that its tabs wrap. */
export const BOARD_TILE_W = 720;
export const BOARD_TILE_H = 620;
const GAP = 48;
const MAX_COLS = 4;

export interface BoardLayout {
  v: 1;
  tiles: Record<string, Rect>;
  camera: Camera | null;
}

export function emptyBoardLayout(): BoardLayout {
  return { v: 1, tiles: {}, camera: null };
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

/** Read the saved layout off a room's `metadata`; anything malformed is dropped. */
export function parseBoardLayout(metadata: Json | null | undefined): BoardLayout {
  const out = emptyBoardLayout();
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return out;
  const raw = (metadata as Record<string, unknown>)[BOARD_LAYOUT_KEY];
  if (!raw || typeof raw !== "object") return out;
  const layout = raw as Record<string, unknown>;
  if (layout.tiles && typeof layout.tiles === "object") {
    for (const [id, r] of Object.entries(layout.tiles as Record<string, unknown>)) {
      const rect = asRect(r);
      if (rect) out.tiles[id] = rect;
    }
  }
  out.camera = asCamera(layout.camera);
  return out;
}

const round = (n: number) => Math.round(n * 100) / 100;

/** The jsonb value written back — only threads still in the room, rounded. */
export function serializeBoardLayout(layout: BoardLayout, roomThreadIds: readonly string[]): Json {
  const keep = new Set(roomThreadIds);
  const tiles: Record<string, Json> = {};
  for (const [id, r] of Object.entries(layout.tiles)) {
    if (!keep.has(id)) continue;
    tiles[id] = { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h) };
  }
  return {
    v: 1,
    tiles,
    camera: layout.camera
      ? { x: round(layout.camera.x), y: round(layout.camera.y), z: round(layout.camera.z * 100) / 100 }
      : null,
  };
}

/**
 * Where every thread goes on first open. Remembered rects win. The rest: on a
 * board with nothing remembered, a tidy reading-order grid; otherwise the
 * nearest free space to the remembered tiles' centre (never on top of one).
 */
export function initialBoardRects(
  ids: readonly string[],
  layout: BoardLayout,
): Array<{ id: string; rect: Rect }> {
  const placed: Array<{ id: string; rect: Rect }> = [];
  const unplaced: string[] = [];
  for (const id of ids) {
    const r = layout.tiles[id];
    if (r) placed.push({ id, rect: r });
    else unplaced.push(id);
  }
  if (placed.length === 0) {
    const cols = Math.min(MAX_COLS, Math.max(1, Math.ceil(Math.sqrt(unplaced.length))));
    return unplaced.map((id, i) => ({
      id,
      rect: {
        x: (i % cols) * (BOARD_TILE_W + GAP),
        y: Math.floor(i / cols) * (BOARD_TILE_H + GAP),
        w: BOARD_TILE_W,
        h: BOARD_TILE_H,
      },
    }));
  }
  const occupied = placed.map((p) => p.rect);
  const near = centreOf(occupied);
  for (const id of unplaced) {
    const rect = findFreeSpot(occupied, { w: BOARD_TILE_W, h: BOARD_TILE_H }, near, GAP);
    occupied.push(rect);
    placed.push({ id, rect });
  }
  // Keep the room's order (pinned first, then position) for reading order.
  const byId = new Map(placed.map((p) => [p.id, p]));
  return ids.flatMap((id) => {
    const p = byId.get(id);
    return p ? [p] : [];
  });
}

/** Place newcomers one by one, each avoiding the tiles already down. */
export function placeNewcomers(
  occupied: readonly Rect[],
  ids: readonly string[],
  near: { x: number; y: number },
): Array<{ id: string; rect: Rect }> {
  const taken = [...occupied];
  return ids.map((id) => {
    const rect = findFreeSpot(taken, { w: BOARD_TILE_W, h: BOARD_TILE_H }, near, GAP);
    taken.push(rect);
    return { id, rect };
  });
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
