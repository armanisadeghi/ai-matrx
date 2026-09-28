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
 *
 * The handlers depend on a NARROW `BoardToolTarget`, not the whole `useBoard`
 * model: `Board<T>` satisfies it structurally, and a host that keeps its own
 * layout model (the War Room board) supplies an adapter. An operation the
 * target does not offer is refused with the target's own remedy.
 */

import { toast } from "@/lib/toast";
import {
  useSurfaceClientTools,
  type SurfaceToolCall,
} from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import type { BoardConnection, BoardFrame, BoardTileBase, BoardView } from "../board/useBoard";
import { screenToWorld, visibleWorldRect, rectsIntersect, type Rect } from "../engine/camera";
import { align, arrange, distribute, enclosingFrame, type AlignEdge, type ArrangeLayout, type DistributeAxis } from "../engine/arrange";
import type { SpatialStore } from "../engine/spatial-store";
import { boundBoardContext, type RawBoardTile } from "./board-snapshot";
import type { BoardTileKindInput } from "./board-tools";
import {
  actOnItem,
  ITEM_MOUNT_TIMEOUT_MS,
  openItemSurface,
  type ItemSurfaceIndex,
} from "./item-surfaces";

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

export type Failure = { ok: false; error: string };

/** What `board_read` sees: a board's view, plus tiles taken off it but restorable. */
export interface BoardToolView<T extends BoardTileBase> extends BoardView<T> {
  /** Off the board but restorable (`board_park` with `parked:false` brings one back). */
  removed?: T[];
}

/** The tools that a board may not support; each refusal names the remedy. */
export interface BoardToolRefusals {
  /** Renaming or resizing a tile. */
  update?: string;
  group?: string;
  connect?: string;
  undo?: string;
}

/**
 * The board the tools act on — ONLY what the handlers call. `Board<T>` from
 * `useBoard` satisfies it as-is; the optional operations are the ones a board
 * with its own layout model may not have (absent = refused, with
 * `refusals[...]` as the answer).
 */
export interface BoardToolTarget<T extends BoardTileBase> {
  /** The board as of the LAST change (sequences of tool calls in one tick). */
  read: () => BoardToolView<T>;
  /** Drawn marks, counted by board_read. */
  shapes?: readonly unknown[];
  /** Move tiles (and frames) as one step. A failure refuses the whole move. */
  moveMany: (moves: { id: string; x: number; y: number }[]) => void | Failure;
  /** Take a tile off the board; returns a function that puts it back. */
  removeTile: (id: string) => () => void;
  parkTile: (id: string) => unknown;
  /** Bring back a parked (or removed) tile. */
  unparkTile: (id: string) => void;
  addTile?: (tile: T, near?: { x: number; y: number }, opts?: { within?: string }) => Rect;
  updateTile?: (id: string, patch: Partial<T>) => void;
  addFrame?: (frame: BoardFrame) => void;
  connect?: (connection: BoardConnection) => void;
  undo?: () => void;
  canUndo?: boolean;
  /** Refuse an arrangement of these tiles (they would break the host's layout rules). */
  checkArrange?: (ids: string[]) => Failure | null;
  refusals?: BoardToolRefusals;
}

export interface BoardToolHost<T extends BoardTileBase & { title: string }> {
  board: BoardToolTarget<T>;
  store: SpatialStore | null;
  boardTitle: string;
  /** Build a tile of `input.kind` with this id and size (position is decided here). */
  createTile: (id: string, input: AddTileInput, size: { w: number; h: number }) => T | Failure;
  /** A patch for a tile's content, or a failure saying why it cannot change. An
   * empty patch means the host applied the content itself (e.g. into a record). */
  editTile?: (tile: T, input: EditTileInput) => Partial<T> | Failure;
  /** "note", "markdown", a kind label… a status word, and the agent surface
   * the tile's feature publishes while the tile is live, for board_read. */
  describe: (tile: T) => { kind: string; status?: string | null; surface?: string | null };
  /**
   * Each tile's own surface capture (`item-surfaces.ts`), live or dormant —
   * what `board_open_item` / `board_item_act` and the `board_items` value read.
   * Absent on a board whose tiles carry no feature surface.
   */
  itemSurfaces?: ItemSurfaceIndex;
}

const DEFAULT_SIZE: Record<BoardTileKindInput, { w: number; h: number }> = {
  note: { w: 560, h: 620 }, // the notes core (modes, tools, editor, metadata)
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
    return [...v.tiles, ...v.parked, ...(v.removed ?? [])];
  };
  const refused = (key: keyof BoardToolRefusals, fallback: string) => fail(board.refusals?.[key] ?? fallback);
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
    const removedIds = new Set((now.removed ?? []).map((t) => t.id));
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
        inView: !!view && !parkedIds.has(t.id) && !removedIds.has(t.id) && rectsIntersect(view, t.rect),
        selected: selected === t.id,
        focused: focused === t.id,
      };
    });
    const bounded = boundBoardContext(host.boardTitle, raw);
    const surfaces = new Map(allTiles().map((t) => [t.id, host.describe(t).surface ?? null]));
    const surfaceOf = (id: string) => {
      const name = surfaces.get(id);
      return name ? { surface: name } : {};
    };
    const round = (r: Rect) => ({ x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h) });
    const rectOf = new Map(allTiles().map((t) => [t.id, t.rect]));
    return {
      ok: true,
      board: {
        ...bounded,
        live_tile_id: selected ?? focused,
        tiles: bounded.tiles.map((t) => ({
          ...t,
          ...surfaceOf(t.id),
          rect: round(rectOf.get(t.id) ?? { x: 0, y: 0, w: 0, h: 0 }),
          parked: parkedIds.has(t.id),
          ...(removedIds.has(t.id) ? { removed: true } : {}),
        })),
        frames: now.frames.map((f) => ({ id: f.id, title: f.title, rect: round(f.rect) })),
        connections: now.connections.map((c) => ({ id: c.id, from_id: c.from, to_id: c.to })),
        drawn_mark_count: board.shapes?.length ?? 0,
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
    if (!board.addTile) return fail("Tiles cannot be added to this board.");
    const addTile = board.addTile;
    const x = num(a.x);
    const y = num(a.y);
    const beside = str(a.near_tile_id) ? find(a.near_tile_id) : undefined;
    if (str(a.near_tile_id) && !beside) return missing(a.near_tile_id);
    let rect: Rect;
    if (x !== undefined && y !== undefined) {
      rect = addTile({ ...made, rect: { x, y, w: size.w, h: size.h } });
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
      rect = addTile({ ...made, rect: { x: 0, y: 0, w: size.w, h: size.h } }, near, { within });
    }
    // Show it without moving the person's view (never yank the camera).
    requestAnimationFrame(() => store?.select(id));
    return { ok: true, id, rect };
  };

  const update = (input: unknown) => {
    const a = record(input);
    const tile = find(a.id);
    if (!tile) return missing(a.id);
    const title = str(a.title);
    const w = num(a.width);
    const h = num(a.height);
    const content = typeof a.text === "string" || !!str(a.html);
    const reshape = !!title || w !== undefined || h !== undefined;
    if (!reshape && !content) return fail("Nothing to change: pass title, text, html, width or height.");
    const updateTile = board.updateTile;
    if (reshape && !updateTile) return refused("update", "This board's tiles cannot be renamed or resized.");
    let patch: Partial<T> = {};
    if (title) patch = { ...patch, title };
    if (w !== undefined || h !== undefined) {
      patch = { ...patch, rect: { ...tile.rect, w: w ?? tile.rect.w, h: h ?? tile.rect.h } };
    }
    if (content) {
      if (!host.editTile) return fail("This board's tiles cannot have their content edited; only their title and size.");
      const edit = host.editTile(tile, { text: typeof a.text === "string" ? a.text : undefined, html: str(a.html) });
      if (isFailure(edit)) return edit;
      patch = { ...patch, ...edit };
    }
    // An empty patch after a content edit: the host wrote it into its record.
    if (Object.keys(patch).length > 0) {
      if (!updateTile) return refused("update", "This board's tiles cannot be changed from here.");
      updateTile(tile.id, patch);
    }
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
    const refusedMove = board.moveMany(valid);
    if (isFailure(refusedMove)) return refusedMove;
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
    const outOfBounds = board.checkArrange?.(pool.map((t) => t.id));
    if (outOfBounds) return outOfBounds;
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
    const refusedMove = board.moveMany(placed.map((p) => ({ id: p.id, x: p.rect.x, y: p.rect.y })));
    if (isFailure(refusedMove)) return refusedMove;
    return { ok: true, tiles: placed };
  };

  const group = (input: unknown) => {
    const a = record(input);
    const title = str(a.title);
    const ids = Array.isArray(a.ids) ? (a.ids as unknown[]).filter((v): v is string => typeof v === "string") : [];
    if (!board.addFrame) return refused("group", "This board cannot draw frames around tiles.");
    const addFrame = board.addFrame;
    if (!title || ids.length === 0) return fail("Pass the tile ids to group and a title.");
    const tiles = ids.flatMap((id) => find(id) ?? []);
    const lost = ids.find((id) => !tiles.some((t) => t.id === id));
    if (lost) return missing(lost);
    let items = tiles.map((t) => ({ id: t.id, rect: t.rect }));
    if (a.tidy === true) {
      items = arrange(items, "tidy");
      const refusedMove = board.moveMany(items.map((p) => ({ id: p.id, x: p.rect.x, y: p.rect.y })));
      if (isFailure(refusedMove)) return refusedMove;
    }
    const frameId = `frame:${crypto.randomUUID().slice(0, 8)}`;
    const rect = enclosingFrame(items);
    addFrame({ id: frameId, rect, title });
    return { ok: true, frame_id: frameId, rect };
  };

  const connectTool = (input: unknown) => {
    const a = record(input);
    if (!board.connect) return refused("connect", "This board cannot draw connections between tiles.");
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
    // Selecting makes the tile LIVE: its feature's own surface (values,
    // write targets, tools) registers, and reaches the agent next turn.
    const show = () => {
      store.select(tile.id);
      if (a.mode === "focus") store.focus(tile.id);
      else store.fitItem(tile.id);
    };
    const now = board.read();
    const hidden = [...now.parked, ...(now.removed ?? [])].some((t) => t.id === tile.id);
    if (hidden) {
      // Back on the board first; the camera can only reach it once it has rendered.
      board.unparkTile(tile.id);
      requestAnimationFrame(() => requestAnimationFrame(show));
    } else show();
    return { ok: true, id: tile.id };
  };

  /** Two frames: a selection or an unpark has rendered and its effects ran. */
  const settle = () =>
    new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

  /**
   * The tile's surface capture, after making it the person's live tile (and
   * bringing it back onto the board if it was parked or removed — only a
   * rendered tile mounts its surface).
   */
  const reachItem = async (id: unknown, show: boolean) => {
    const tile = find(id);
    if (!tile) return missing(id);
    const surface = host.describe(tile).surface ?? null;
    if (!surface) {
      return fail(
        `"${tile.title}" is board-only content with no feature behind it, so it has no surface to open. board_update_tile changes it.`,
      );
    }
    if (!host.itemSurfaces) return fail("This board cannot open its items for you yet.");
    const now = board.read();
    const hidden = [...now.parked, ...(now.removed ?? [])].some((t) => t.id === tile.id);
    if (hidden) board.unparkTile(tile.id);
    if (show && store) {
      if (hidden) await settle();
      store.select(tile.id);
      store.fitItem(tile.id);
    }
    const capture = await host.itemSurfaces.wait(tile.id, ITEM_MOUNT_TIMEOUT_MS);
    if (!capture) {
      return fail(`"${tile.title}" did not mount its ${surface} surface. Nothing was read or changed; try again in a moment.`);
    }
    return { tile, surface, capture };
  };

  const openItem = async (input: unknown) => {
    const reached = await reachItem(record(input).id, true);
    if (isFailure(reached)) return reached;
    await settle();
    const opened = await openItemSurface(reached.capture);
    if (!opened.ok) return opened;
    return {
      id: reached.tile.id,
      title: reached.tile.title,
      kind: host.describe(reached.tile).kind,
      live: true,
      ...opened,
      next: "Act on it with board_item_act: {id, target, value} for a write target, or {id, tool, input} for a tool.",
    };
  };

  const itemAct = async (input: unknown, call?: SurfaceToolCall) => {
    const a = record(input);
    const reached = await reachItem(a.id, false);
    if (isFailure(reached)) return reached;
    const result = await actOnItem(
      reached.capture,
      {
        target: str(a.target),
        value: a.value,
        tool: str(a.tool),
        input: a.input,
      },
      call,
    );
    return { id: reached.tile.id, title: reached.tile.title, ...result };
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
    if (!board.undo) return refused("undo", "This board keeps no undo history.");
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
    board_open_item: openItem,
    board_item_act: itemAct,
    board_park: park,
    board_undo: undo,
  });
}
