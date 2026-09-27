"use client";

/**
 * useBoardAgentTools — executes the board's agent tools (`board-tools.ts`)
 * against a mounted board. Host-agnostic: it drives the board MODEL
 * (`useBoard`) and the camera STORE; a host only says how to MAKE and EDIT its
 * own kinds of tile (`createTile`, `editTile`), because only the host knows
 * what a "note" or an "html" tile is on its board.
 *
 * Every handler returns a small JSON result (never throws — errors come back
 * as `{ ok: false, error }` with a remedy), and every change goes through the
 * board's one path, so it is on the ⌘Z stack like a person's change.
 */

import { toast } from "@/lib/toast";
import { useSurfaceClientTools } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import type { Board, BoardTileBase } from "../board/useBoard";
import { screenToWorld, visibleWorldRect, rectsIntersect, type Rect } from "../engine/camera";
import { align, arrange, distribute, enclosingFrame, type AlignEdge, type ArrangeLayout, type DistributeAxis } from "../engine/arrange";
import type { SpatialStore } from "../engine/spatial-store";
import { boundBoardContext, type RawBoardTile } from "../chat/board-context";
import type { BoardTileKindInput } from "./board-tools";

export interface AddTileInput {
  kind: BoardTileKindInput;
  title?: string;
  text?: string;
  html?: string;
  url?: string;
  width?: number;
  height?: number;
}

export interface EditTileInput {
  title?: string;
  text?: string;
  html?: string;
}

type Failure = { ok: false; error: string };

export interface BoardToolHost<T extends BoardTileBase & { title: string }> {
  board: Board<T>;
  store: SpatialStore | null;
  boardTitle: string;
  /** Build a tile of `input.kind` with this id and size (position is decided here). */
  createTile: (id: string, input: AddTileInput, size: { w: number; h: number }) => T | Failure;
  /** A patch for a tile's content, or a failure saying why it cannot change. */
  editTile?: (tile: T, input: EditTileInput) => Partial<T> | Failure;
  /** "note", "markdown", a kind label… and a status word, for board_read. */
  describe: (tile: T) => { kind: string; status?: string | null };
}

const DEFAULT_SIZE: Record<BoardTileKindInput, { w: number; h: number }> = {
  note: { w: 380, h: 300 },
  markdown: { w: 640, h: 720 },
  text: { w: 520, h: 120 },
  html: { w: 800, h: 560 },
  image: { w: 560, h: 400 },
};

const fail = (error: string): Failure => ({ ok: false, error });
const isFailure = (v: unknown): v is Failure =>
  typeof v === "object" && v !== null && (v as Failure).ok === false;

function record(input: unknown): Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
}
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v : undefined);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

/** The rendered text of a tile, from its body in the DOM (what the person sees). */
function tileText(id: string): string {
  const card = document.querySelector<HTMLElement>(`[data-spatial-card="${CSS.escape(id)}"]`);
  return card?.querySelector<HTMLElement>("[data-spatial-body]")?.innerText ?? "";
}

export function useBoardAgentTools<T extends BoardTileBase & { title: string }>(
  surfaceName: string | null,
  host: BoardToolHost<T>,
): void {
  const { board, store } = host;
  const allTiles = () => {
    const v = board.read();
    return [...v.tiles, ...v.parked];
  };
  const find = (id: unknown) => allTiles().find((t) => t.id === id);
  const missing = (id: unknown) =>
    fail(`No tile with id "${String(id)}" is on this board. Call board_read for the current ids.`);

  const viewCentre = (): { x: number; y: number } => {
    if (!store) return { x: 0, y: 0 };
    const { w, h } = store.getSize();
    return screenToWorld(store.getCamera(), w / 2, h / 2);
  };

  const read = (input: unknown) => {
    const withText = record(input).include_text !== false;
    const view = store ? visibleWorldRect(store.getCamera(), store.getSize()) : null;
    const now = board.read();
    const parkedIds = new Set(now.parked.map((t) => t.id));
    const selected = store?.getSelected() ?? null;
    const focused = store?.getFocused() ?? null;
    const raw: RawBoardTile[] = allTiles().map((t) => {
      const d = host.describe(t);
      return {
        id: t.id,
        title: t.title,
        kind: d.kind,
        status: d.status ?? null,
        text: withText ? tileText(t.id) : "",
        inView: !!view && !parkedIds.has(t.id) && rectsIntersect(view, t.rect),
        selected: selected === t.id,
        focused: focused === t.id,
      };
    });
    const bounded = boundBoardContext(host.boardTitle, raw);
    const round = (r: Rect) => ({ x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h) });
    const rectOf = new Map(allTiles().map((t) => [t.id, t.rect]));
    return {
      ok: true,
      board: {
        ...bounded,
        tiles: bounded.tiles.map((t) => ({
          ...t,
          rect: round(rectOf.get(t.id) ?? { x: 0, y: 0, w: 0, h: 0 }),
          parked: parkedIds.has(t.id),
        })),
        frames: now.frames.map((f) => ({ id: f.id, title: f.title, rect: round(f.rect) })),
        connections: now.connections.map((c) => ({ id: c.id, from_id: c.from, to_id: c.to })),
        drawn_mark_count: board.shapes.length,
        view: view ? round(view) : null,
      },
    };
  };

  const add = (input: unknown) => {
    const a = record(input);
    const kind = str(a.kind) as BoardTileKindInput | undefined;
    if (!kind || !(kind in DEFAULT_SIZE)) return fail(`kind must be one of ${Object.keys(DEFAULT_SIZE).join(", ")}.`);
    const size = { w: num(a.width) ?? DEFAULT_SIZE[kind].w, h: num(a.height) ?? DEFAULT_SIZE[kind].h };
    const id = `${kind}:${crypto.randomUUID().slice(0, 8)}`;
    const made = host.createTile(
      id,
      { kind, title: str(a.title), text: typeof a.text === "string" ? a.text : undefined, html: str(a.html), url: str(a.url), width: size.w, height: size.h },
      size,
    );
    if (isFailure(made)) return made;
    const x = num(a.x);
    const y = num(a.y);
    const beside = str(a.near_tile_id) ? find(a.near_tile_id) : undefined;
    if (str(a.near_tile_id) && !beside) return missing(a.near_tile_id);
    let rect: Rect;
    if (x !== undefined && y !== undefined) {
      rect = board.addTile({ ...made, rect: { x, y, w: size.w, h: size.h } });
    } else {
      const near = beside
        ? { x: beside.rect.x + beside.rect.w + 48 + size.w / 2, y: beside.rect.y + size.h / 2 }
        : viewCentre();
      // Beside a tile inside a frame, it may join that frame's group.
      const within = beside
        ? board.read().frames.find(
            (f) =>
              beside.rect.x >= f.rect.x &&
              beside.rect.y >= f.rect.y &&
              beside.rect.x + beside.rect.w <= f.rect.x + f.rect.w &&
              beside.rect.y + beside.rect.h <= f.rect.y + f.rect.h,
          )?.id
        : undefined;
      rect = board.addTile({ ...made, rect: { x: 0, y: 0, w: size.w, h: size.h } }, near, { within });
    }
    // Show it without moving the person's view (never yank the camera).
    requestAnimationFrame(() => store?.select(id));
    return { ok: true, id, rect };
  };

  const update = (input: unknown) => {
    const a = record(input);
    const tile = find(a.id);
    if (!tile) return missing(a.id);
    let patch: Partial<T> = {};
    const title = str(a.title);
    if (title) patch = { ...patch, title };
    if (typeof a.text === "string" || str(a.html)) {
      if (!host.editTile) return fail("This board's tiles cannot have their content edited; only their title and size.");
      const edit = host.editTile(tile, { text: typeof a.text === "string" ? a.text : undefined, html: str(a.html) });
      if (isFailure(edit)) return edit;
      patch = { ...patch, ...edit };
    }
    const w = num(a.width);
    const h = num(a.height);
    if (w !== undefined || h !== undefined) {
      patch = { ...patch, rect: { ...tile.rect, w: w ?? tile.rect.w, h: h ?? tile.rect.h } };
    }
    if (Object.keys(patch).length === 0) return fail("Nothing to change: pass title, text, html, width or height.");
    board.updateTile(tile.id, patch);
    return { ok: true, id: tile.id, rect: patch.rect ?? tile.rect };
  };

  const remove = (input: unknown) => {
    const a = record(input);
    const tile = find(a.id);
    if (!tile) return missing(a.id);
    const putBack = board.removeTile(tile.id);
    toast(`The assistant removed "${tile.title}" from the board`, { action: { label: "Undo", onClick: putBack } });
    return { ok: true, id: tile.id, note: "The person can undo this." };
  };

  const moveTiles = (input: unknown) => {
    const moves = Array.isArray(record(input).moves) ? (record(input).moves as unknown[]) : [];
    const valid: { id: string; x: number; y: number }[] = [];
    for (const m of moves) {
      const r = record(m);
      const id = str(r.id);
      const x = num(r.x);
      const y = num(r.y);
      if (!id || x === undefined || y === undefined) return fail("Each move needs id, x and y.");
      if (!find(id) && !board.read().frames.some((f) => f.id === id)) return missing(id);
      valid.push({ id, x, y });
    }
    if (valid.length === 0) return fail("Pass at least one move.");
    board.moveMany(valid);
    return { ok: true, moved: valid };
  };

  const arrangeTool = (input: unknown) => {
    const a = record(input);
    const ids = Array.isArray(a.ids) ? (a.ids as unknown[]).filter((v): v is string => typeof v === "string") : null;
    const pool = board.read().tiles.filter((t) => !ids || ids.includes(t.id));
    if (ids && pool.length !== ids.length) {
      const known = new Set(pool.map((t) => t.id));
      return missing(ids.find((id) => !known.has(id)));
    }
    if (pool.length === 0) return fail("There are no tiles to arrange.");
    const items = pool.map((t) => ({ id: t.id, rect: t.rect }));
    const layout = str(a.layout);
    let placed;
    if (layout === "align") {
      const edge = str(a.edge) as AlignEdge | undefined;
      if (!edge) return fail("align needs an edge: left, center, right, top, middle or bottom.");
      placed = align(items, edge);
    } else if (layout === "distribute") {
      const axis = str(a.axis) as DistributeAxis | undefined;
      if (!axis) return fail("distribute needs an axis: horizontal or vertical.");
      placed = distribute(items, axis);
    } else if (layout === "grid" || layout === "tidy" || layout === "row" || layout === "column") {
      const x = num(a.x);
      const y = num(a.y);
      placed = arrange(items, layout as ArrangeLayout, {
        columns: num(a.columns),
        gap: num(a.gap),
        at: x !== undefined && y !== undefined ? { x, y } : undefined,
      });
    } else return fail("layout must be grid, tidy, row, column, align or distribute.");
    board.moveMany(placed.map((p) => ({ id: p.id, x: p.rect.x, y: p.rect.y })));
    return { ok: true, tiles: placed };
  };

  const group = (input: unknown) => {
    const a = record(input);
    const title = str(a.title);
    const ids = Array.isArray(a.ids) ? (a.ids as unknown[]).filter((v): v is string => typeof v === "string") : [];
    if (!title || ids.length === 0) return fail("Pass the tile ids to group and a title.");
    const tiles = ids.flatMap((id) => find(id) ?? []);
    const lost = ids.find((id) => !tiles.some((t) => t.id === id));
    if (lost) return missing(lost);
    let items = tiles.map((t) => ({ id: t.id, rect: t.rect }));
    if (a.tidy === true) {
      items = arrange(items, "tidy");
      board.moveMany(items.map((p) => ({ id: p.id, x: p.rect.x, y: p.rect.y })));
    }
    const frameId = `frame:${crypto.randomUUID().slice(0, 8)}`;
    const rect = enclosingFrame(items);
    board.addFrame({ id: frameId, rect, title });
    return { ok: true, frame_id: frameId, rect };
  };

  const connectTool = (input: unknown) => {
    const a = record(input);
    if (!find(a.from_id)) return missing(a.from_id);
    if (!find(a.to_id)) return missing(a.to_id);
    const id = `link:${crypto.randomUUID().slice(0, 8)}`;
    board.connect({ id, from: String(a.from_id), to: String(a.to_id) });
    return { ok: true, id };
  };

  const focusTool = (input: unknown) => {
    const a = record(input);
    const tile = find(a.id);
    if (!tile) return missing(a.id);
    if (!store) return fail("The board is not ready yet.");
    if (board.read().parked.some((t) => t.id === tile.id)) board.unparkTile(tile.id);
    if (a.mode === "focus") store.focus(tile.id);
    else store.fitItem(tile.id);
    return { ok: true, id: tile.id };
  };

  const park = (input: unknown) => {
    const a = record(input);
    const tile = find(a.id);
    if (!tile) return missing(a.id);
    if (a.parked === false) board.unparkTile(tile.id);
    else board.parkTile(tile.id);
    return { ok: true, id: tile.id, parked: a.parked !== false };
  };

  const undo = () => {
    if (!board.canUndo) return fail("There is nothing to undo on this board.");
    board.undo();
    return { ok: true };
  };

  useSurfaceClientTools(surfaceName, {
    board_read: read,
    board_add_tile: add,
    board_update_tile: update,
    board_remove_tile: remove,
    board_move_tiles: moveTiles,
    board_arrange: arrangeTool,
    board_group: group,
    board_connect: connectTool,
    board_focus: focusTool,
    board_park: park,
    board_undo: undo,
  });
}
