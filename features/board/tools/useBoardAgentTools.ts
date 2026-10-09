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
 * board's one path, so it is on the ⌘Z stack like a person's change — tagged
 * as the agent's (`runAs("agent")`), so `board_undo` takes back only the
 * agent's own changes, never the person's.
 *
 * The person's view and selection are theirs while they work: when a tile is
 * being worked in (interacting) or is full screen, no tool moves the camera,
 * selects, or ends their typing. Tools still read and act on any item — a
 * sleeping tile is held awake (`holdAwake`) for the call instead of selected.
 *
 * The handlers depend on a NARROW `BoardToolTarget`, not the whole `useBoard`
 * model: `Board<T>` satisfies it structurally, and a host that keeps its own
 * layout model (the War Room board) supplies an adapter. An operation the
 * target does not offer is refused with the target's own remedy.
 */

import { useEffect, useRef } from "react";
import { toast } from "@/lib/toast";
import {
  useSurfaceClientTools,
  waitForCapturedRuntime,
  type SurfaceToolCall,
} from "@ai-matrx/chat/surfaces/runtime/SurfaceRuntimeContext";
import { registerAgentWriteSource } from "@ai-matrx/chat/surfaces/runtime/agent-write-sources";
import { listAgentWritableTargets } from "@ai-matrx/chat/surfaces/runtime/surface-writeback";
import type {
  ActorUndoResult,
  BoardActor,
  BoardConnection,
  BoardFrame,
  BoardTileBase,
  BoardView,
} from "../board/useBoard";
import { screenToWorld, visibleWorldRect, rectsIntersect, type Rect } from "../engine/camera";
import { align, arrange, distribute, enclosingFrame, type AlignEdge, type ArrangeLayout, type DistributeAxis } from "../engine/arrange";
import type { BoardCameraStore } from "../engine/camera-store";
import {
  type BindTarget,
  type BoardShape,
  type ShapeStyle,
  isBoxKind,
  isBoxed,
  STICKY_SIZE,
  isConnector,
  parseShapeStyle,
  resizeShapeTo,
  shapeBounds,
  styleOf,
} from "../engine/shapes";
import { boundBoardContext, type RawBoardTile } from "./board-snapshot";
import type { BoardTileKindInput } from "./board-tools";
import {
  actOnItem,
  ITEM_MOUNT_TIMEOUT_MS,
  openItemSurface,
  type ItemSurfaceIndex,
  type StoredBasics,
} from "./item-surfaces";
import { settleFrames } from "./settle-frames";
import { makeText } from "../engine/canvas-text";
import type { BoardItemType, PlacedItem } from "../items/types";
import { findBoardRecords, resolveAddEntry } from "./board-records";
import { BOARD_ADD_ITEMS_MAX } from "./board-tools";
import { searchItemsAsPerson } from "./search-items";

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
  /** Drawn shapes, listed by board_read. */
  shapes?: readonly BoardShape[];
  /** board_shape: add shapes as ONE step; absent = drawing refused. */
  addShapes?: (shapes: BoardShape[]) => void;
  updateShape?: (id: string, patch: Partial<Omit<BoardShape, "id">>) => void;
  /** Remove tiles, frames and shapes as ONE step. */
  removeMany?: (ids: readonly string[]) => void;
  /** What a line / arrow end binds to (a tile or a box shape). */
  targetOf?: (id: string) => BindTarget | undefined;
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
  /** Run changes as an actor, so the agent's are told apart from the person's. */
  runAs?: <R>(actor: BoardActor, fn: () => R) => R;
  /** Run several changes as ONE undoable step. */
  batch?: <R>(fn: () => R) => R;
  /** Take back only the agent's own latest change (absent = board_undo refused). */
  undoActor?: (actor: BoardActor) => ActorUndoResult;
  canUndoActor?: (actor: BoardActor) => boolean;
  /** Refuse an arrangement of these tiles (they would break the host's layout rules). */
  checkArrange?: (ids: string[]) => Failure | null;
  refusals?: BoardToolRefusals;
}

export interface BoardToolHost<T extends BoardTileBase & { title: string }> {
  board: BoardToolTarget<T>;
  store: BoardCameraStore | null;
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
  /**
   * A tile's last-known basics as the saved board keeps them, for `board_items` when the tile is
   * asleep or has never been awake. Absent = an asleep item carries only its type and name.
   */
  storedBasics?: (tile: T) => StoredBasics | null;
  /**
   * The item catalog this board places from (`items/catalog.ts`), for
   * `board_add_items` / `board_find_records`. Absent = those tools are refused.
   */
  itemTypes?: readonly BoardItemType[];
  /**
   * Places records through the host's ONE placement path (UserBoard `place()`):
   * `at` is a world point to land nearest to, else the items fill the view.
   * Returns per item the tile that shows it (`already`: it was on the board
   * before), or null for a record named twice in one call.
   */
  placeItems?: (
    batch: { item: PlacedItem; at?: { x: number; y: number } }[],
  ) => ({ id: string; already: boolean } | null)[];
}

const DEFAULT_SIZE: Record<BoardTileKindInput, { w: number; h: number }> = {
  note: { w: 560, h: 620 }, // the notes core (modes, tools, editor, metadata)
  markdown: { w: 640, h: 720 },
  text: { w: 520, h: 120 },
  html: { w: 800, h: 560 },
  image: { w: 560, h: 400 },
};

const fail = (error: string): Failure => ({ ok: false, error });

/** Most shapes board_read lists (a big sketch keeps its count in drawn_mark_count). */
const SHAPES_READ_MAX = 200;

/** How long a tile an agent reached stays awake after the call, so its result can be read. */
const AGENT_HOLD_MS = 2000;
/**
 * How long an item the agent opened (or acted on) stays HANDED to it: its
 * `apply_surface_write` edits land on that item's own copy even after another
 * tile became the live one. Longer than any one agent turn.
 */
const HANDED_ITEM_MS = 15 * 60_000;
const isFailure = (v: unknown): v is Failure =>
  typeof v === "object" && v !== null && (v as Failure).ok === false;

function record(input: unknown): Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
}
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v : undefined);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

/** The rendered text of a tile, from its body in the DOM (what the person sees). */
function tileText(id: string): string {
  const card = document.querySelector<HTMLElement>(`[data-board-card="${CSS.escape(id)}"]`);
  return card?.querySelector<HTMLElement>("[data-board-body]")?.innerText ?? "";
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
  /** Every board change a tool makes is the agent's. */
  const asAgent = <R,>(fn: () => R): R => (board.runAs ? board.runAs("agent", fn) : fn());
  /** The tile the person is working in (interacting or full screen), if any:
   * while there is one, the view and the selection are theirs. */
  const personBusyIn = (): string | null => store?.getEditing() ?? store?.getFocused() ?? null;

  /**
   * THE HANDED ITEMS — what `board_open_item` / `board_item_act` gave the
   * agent, by tile id, with when and for which conversation; and when the
   * PERSON last picked a tile (a selection the tools did not make). Read only
   * inside callbacks and effects.
   */
  const handedRef = useRef<{
    items: Map<string, { at: number; conversationId?: string }>;
    personPickedAt: number;
    agentSelecting: boolean;
  } | null>(null);
  const handed = () => (handedRef.current ??= { items: new Map(), personPickedAt: 0, agentSelecting: false });
  const hand = (id: string, call?: SurfaceToolCall) => {
    const state = handed();
    const now = Date.now();
    for (const [key, entry] of state.items) if (now - entry.at >= HANDED_ITEM_MS) state.items.delete(key);
    state.items.set(id, { at: now, ...(call?.conversationId ? { conversationId: call.conversationId } : {}) });
  };
  /** A selection the agent's tools make — never counted as the person's pick. */
  const agentSelect = (id: string) => {
    const state = handed();
    state.agentSelecting = true;
    try {
      store?.select(id);
    } finally {
      state.agentSelecting = false;
    }
  };

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
    const selection = new Set(store?.getSelection() ?? []);
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
        selected: selection.has(t.id),
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
        shapes: (board.shapes ?? []).slice(0, SHAPES_READ_MAX).map((sh) => ({
          id: sh.id,
          kind: sh.kind,
          rect: round(shapeBounds(sh, board.targetOf)),
          style: styleOf(sh),
          ...(sh.text ? { text: sh.text } : {}),
          ...(sh.kind === "sticky" && sh.note ? { note_id: sh.note } : {}),
          ...(sh.bind?.start ? { from_id: sh.bind.start } : {}),
          ...(sh.bind?.end ? { to_id: sh.bind.end } : {}),
        })),
        view: view ? round(view) : null,
      },
    };
  };

  const add = (input: unknown) => {
    const a = record(input);
    const kind = str(a.kind) as BoardTileKindInput | undefined;
    if (!kind || !(kind in DEFAULT_SIZE)) return fail(`kind must be one of ${Object.keys(DEFAULT_SIZE).join(", ")}.`);
    // Plain text sits on the canvas itself (no tile): a text object, like the Text tool makes.
    if (kind === "text" && board.addShapes) {
      const addShapes = board.addShapes;
      const words = typeof a.text === "string" ? a.text : (str(a.title) ?? "");
      if (!words.trim()) return fail("Plain text needs `text`.");
      const beside = str(a.near_tile_id) ? find(a.near_tile_id) : undefined;
      if (str(a.near_tile_id) && !beside) return missing(a.near_tile_id);
      const x = num(a.x);
      const y = num(a.y);
      const at = x !== undefined && y !== undefined ? { x: x + 4, y } : beside ? { x: beside.rect.x + 4, y: beside.rect.y - 48 } : viewCentre();
      const shape = makeText(at, { text: words, ...(num(a.width) !== undefined ? { width: num(a.width) } : {}) });
      asAgent(() => addShapes([shape]));
      return { ok: true, id: shape.id, kind: "text", rect: shapeBounds(shape) };
    }
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
      rect = asAgent(() => addTile({ ...made, rect: { x, y, w: size.w, h: size.h } }));
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
      rect = asAgent(() => addTile({ ...made, rect: { x: 0, y: 0, w: size.w, h: size.h } }, near, { within }));
    }
    // Show it without moving the person's view (never yank the camera) — and
    // never take the selection from a tile they are working in.
    requestAnimationFrame(() => {
      if (!personBusyIn()) agentSelect(id);
    });
    return { ok: true, id, rect };
  };

  /** board_add_items — the person's real records (or new ones) as tiles, one undoable step. */
  const addItems = (input: unknown) => {
    const types = host.itemTypes;
    const placeItems = host.placeItems;
    if (!types || !placeItems) {
      return fail("This board shows its own feature's parts only; records cannot be added to it. board_add_tile adds notes and write-ups.");
    }
    const entries = Array.isArray(record(input).items) ? (record(input).items as unknown[]).map(record) : [];
    if (entries.length === 0) return fail("Pass `items`: [{type, id} or {type, new: true}, …].");
    if (entries.length > BOARD_ADD_ITEMS_MAX) return fail(`At most ${BOARD_ADD_ITEMS_MAX} items per call; send the rest in another call.`);
    const results: Record<string, unknown>[] = entries.map((e) => ({ type: e.type, ...(str(e.id) ? { id: e.id } : {}) }));
    const batch: { item: PlacedItem; at?: { x: number; y: number }; index: number }[] = [];
    entries.forEach((e, index) => {
      const resolved = resolveAddEntry(e, types);
      if (!resolved.ok) {
        Object.assign(results[index], { status: resolved.status, error: resolved.error });
        return;
      }
      const { w, h } = resolved.item.size;
      const x = num(e.x);
      const y = num(e.y);
      const beside = str(e.near_tile_id) ? find(e.near_tile_id) : undefined;
      if (str(e.near_tile_id) && !beside) {
        Object.assign(results[index], { status: "refused", error: `No tile with id "${String(e.near_tile_id)}" is on this board.` });
        return;
      }
      const at =
        x !== undefined && y !== undefined
          ? { x: x + w / 2, y: y + h / 2 }
          : beside
            ? { x: beside.rect.x + beside.rect.w + 48 + w / 2, y: beside.rect.y + h / 2 }
            : undefined;
      batch.push({ item: resolved.item, ...(at ? { at } : {}), index });
    });
    if (batch.length > 0) {
      const run = () => asAgent(() => placeItems(batch.map(({ item, at }) => (at ? { item, at } : { item }))));
      const placed = board.batch ? board.batch(run) : run();
      batch.forEach(({ item, index }, k) => {
        const p = placed[k];
        if (!p) Object.assign(results[index], { status: "duplicate", error: "Named twice in this call; placed once." });
        else {
          const tile = find(p.id);
          Object.assign(results[index], {
            status: p.already ? "already_on_board" : "added",
            tile_id: p.id,
            title: tile?.title ?? item.title,
            ...(tile ? { rect: tile.rect } : {}),
          });
        }
      });
    }
    const added = results.filter((r) => r.status === "added").length;
    return {
      ok: added > 0 || results.some((r) => r.status === "already_on_board"),
      added,
      results,
      ...(added > 0 ? { next: "Group them with board_group (title = the topic, tidy: true), or arrange with board_arrange." } : {}),
    };
  };

  /** board_find_records — candidates for board_add_items across the person's records. */
  const findRecords = async (input: unknown, call?: SurfaceToolCall) => {
    if (!host.itemTypes) return fail("This board cannot take records, so there is nothing to find for it.");
    // The conversation asking is never a candidate: it is already open beside the board.
    return findBoardRecords(record(input), host.itemTypes, searchItemsAsPerson, {
      exclude: call?.conversationId ? [{ type: "chat", id: call.conversationId }] : [],
    });
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
      asAgent(() => updateTile(tile.id, patch));
    }
    return { ok: true, id: tile.id, rect: patch.rect ?? tile.rect };
  };

  const remove = (input: unknown) => {
    const a = record(input);
    const tile = find(a.id);
    if (!tile) return missing(a.id);
    const putBack = asAgent(() => board.removeTile(tile.id));
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
    const refusedMove = asAgent(() => board.moveMany(valid));
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
    const refusedMove = asAgent(() => board.moveMany(placed.map((p) => ({ id: p.id, x: p.rect.x, y: p.rect.y }))));
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
      const refusedMove = asAgent(() => board.moveMany(items.map((p) => ({ id: p.id, x: p.rect.x, y: p.rect.y }))));
      if (isFailure(refusedMove)) return refusedMove;
    }
    const frameId = `frame:${crypto.randomUUID().slice(0, 8)}`;
    const rect = enclosingFrame(items);
    asAgent(() => addFrame({ id: frameId, rect, title }));
    return { ok: true, frame_id: frameId, rect };
  };

  const connectTool = (input: unknown) => {
    const a = record(input);
    if (!board.connect) return refused("connect", "This board cannot draw connections between tiles.");
    if (!find(a.from_id)) return missing(a.from_id);
    if (!find(a.to_id)) return missing(a.to_id);
    const id = `link:${crypto.randomUUID().slice(0, 8)}`;
    const connect = board.connect;
    asAgent(() => connect({ id, from: String(a.from_id), to: String(a.to_id) }));
    return { ok: true, id };
  };

  /** board_shape: draw, change or erase shapes (one undoable step per call). */
  const shapeTool = (input: unknown) => {
    const a = record(input);
    const { addShapes, updateShape, removeMany, targetOf } = board;
    if (!addShapes || !updateShape || !removeMany) return fail("This board cannot hold drawings.");
    const lookup = targetOf ?? (() => undefined);
    const shapeIds = new Set((board.shapes ?? []).map((sh) => sh.id));
    const isTarget = (id: string) => !!find(id) || shapeIds.has(id);
    const warnings: string[] = [];
    const styleFrom = (e: Record<string, unknown>, label: string): Partial<ShapeStyle> | undefined =>
      parseShapeStyle(
        Object.fromEntries(
          Object.entries({
            stroke: e.stroke,
            fill: e.fill,
            size: e.size,
            dash: e.dash,
            opacity: e.opacity,
            textSize: e.text_size,
            textAlign: e.text_align,
            textWeight: e.text_weight,
            sticky: e.color,
          }).filter(([, v]) => v !== undefined),
        ),
        warnings,
        label,
      );
    const pointOf = (v: unknown) => {
      const r = record(v);
      const x = num(r.x);
      const y = num(r.y);
      return x !== undefined && y !== undefined ? { x, y } : undefined;
    };
    const entries = Array.isArray(a.shapes) ? a.shapes.map(record) : [];

    if (a.action === "delete") {
      const ids = (Array.isArray(a.ids) ? a.ids : []).filter((id): id is string => typeof id === "string");
      const gone = ids.filter((id) => shapeIds.has(id));
      if (gone.length === 0) return fail("No shape with those ids is on this board. Call board_read for the current ids.");
      asAgent(() => removeMany(gone));
      return { ok: true, deleted: gone, ...(gone.length < ids.length ? { not_found: ids.filter((id) => !shapeIds.has(id)) } : {}) };
    }

    if (a.action === "create") {
      if (entries.length === 0) return fail("Pass `shapes`: one entry per shape to draw.");
      const refs = new Map<string, string>();
      const made: BoardShape[] = [];
      const links: { from: string; to: string }[] = [];
      const centre = viewCentre();
      const resolve = (v: unknown) => (typeof v === "string" ? (refs.get(v) ?? v) : undefined);
      const madeBox = (id: string): BindTarget | undefined => {
        const sh = made.find((m) => m.id === id);
        return sh && isBoxed(sh.kind) ? { rect: shapeBounds(sh), outline: sh.kind === "oval" ? "oval" : "rect" } : undefined;
      };
      const rectOf = (id: string) => madeBox(id)?.rect ?? lookup(id)?.rect;
      for (const [i, e] of entries.entries()) {
        const kind = typeof e.kind === "string" ? e.kind : "";
        const id = `${kind}:${crypto.randomUUID().slice(0, 8)}`;
        const label = `shape ${i}`;
        const style = styleFrom(e, label);
        const extra = { ...(style ? { style } : {}) };
        if (kind === "rect" || kind === "oval") {
          const w = num(e.w) ?? 240;
          const h = num(e.h) ?? 160;
          const x = num(e.x) ?? centre.x - w / 2;
          const y = num(e.y) ?? centre.y - h / 2;
          made.push({ id, kind, points: [{ x, y }, { x: x + w, y: y + h }], ...extra, ...(str(e.text) ? { text: String(e.text) } : {}) });
        } else if (kind === "line" || kind === "arrow") {
          const fromId = resolve(e.from_id);
          const toId = resolve(e.to_id);
          for (const ref of [fromId, toId]) {
            if (ref && !isTarget(ref) && !made.some((m) => m.id === ref)) return fail(`${label}: no tile or shape "${ref}". Call board_read for the current ids.`);
          }
          if (kind === "arrow" && fromId && toId && find(fromId) && find(toId) && board.connect) {
            links.push({ from: fromId, to: toId });
            continue;
          }
          const fromRect = fromId ? rectOf(fromId) : undefined;
          const toRect = toId ? rectOf(toId) : undefined;
          const mid = (r: Rect) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
          const p0 = pointOf(e.from) ?? (fromRect ? mid(fromRect) : undefined);
          const p1 = pointOf(e.to) ?? (toRect ? mid(toRect) : undefined);
          if (!p0 || !p1) return fail(`${label}: a ${kind} needs from_id or from {x,y}, and to_id or to {x,y}.`);
          const bind = { ...(fromId ? { start: fromId } : {}), ...(toId ? { end: toId } : {}) };
          made.push({ id, kind, points: [p0, p1], ...extra, ...(fromId || toId ? { bind } : {}) });
        } else if (kind === "pen") {
          const points = (Array.isArray(e.points) ? e.points : []).map(pointOf).filter((p): p is { x: number; y: number } => !!p);
          if (points.length < 2) return fail(`${label}: a pen stroke needs at least two points.`);
          made.push({ id, kind, points, ...extra });
        } else if (kind === "sticky") {
          // A sticky note: its words become a Note in the person's Sticky notes folder (board/sticky-notes.ts).
          const side = num(e.w) ?? STICKY_SIZE;
          const h = num(e.h) ?? side;
          const x = num(e.x) ?? centre.x - side / 2;
          const y = num(e.y) ?? centre.y - h / 2;
          made.push({ id, kind, points: [{ x, y }, { x: x + side, y: y + h }], ...extra, ...(str(e.text) ? { text: String(e.text) } : {}) });
        } else if (kind === "text") {
          if (!str(e.text)) return fail(`${label}: plain text needs \`text\`.`);
          const x = num(e.x);
          const y = num(e.y);
          const base = makeText(x !== undefined && y !== undefined ? { x: x + 4, y } : centre, {
            text: String(e.text),
            style,
            ...(num(e.w) !== undefined ? { width: num(e.w) } : {}),
          });
          made.push({ ...base, id });
        } else return fail(`${label}: kind must be rect, oval, line, arrow, pen, sticky or text.`);
        if (typeof e.ref === "string") refs.set(e.ref, id);
      }
      const connections: string[] = [];
      const connect = board.connect;
      asAgent(() => {
        const run = () => {
          if (made.length) addShapes(made);
          for (const l of links) {
            const cid = `link:${crypto.randomUUID().slice(0, 8)}`;
            connect?.({ id: cid, from: l.from, to: l.to });
            connections.push(cid);
          }
        };
        if (board.batch) board.batch(run);
        else run();
      });
      return {
        ok: true,
        ids: made.map((m) => m.id),
        ...(refs.size ? { refs: Object.fromEntries(refs) } : {}),
        ...(connections.length ? { connection_ids: connections } : {}),
        ...(warnings.length ? { warnings } : {}),
      };
    }

    if (a.action === "update") {
      if (entries.length === 0) return fail("Pass `shapes`: one entry per shape to change, each with its `id`.");
      const current = new Map((board.shapes ?? []).map((sh) => [sh.id, sh]));
      const patches: { id: string; patch: Partial<Omit<BoardShape, "id">> }[] = [];
      for (const [i, e] of entries.entries()) {
        const id = typeof e.id === "string" ? e.id : "";
        const sh = current.get(id);
        if (!sh) return fail(`shape ${i}: no shape "${id}". Call board_read for the current ids.`);
        const style = styleFrom(e, `shape ${i}`);
        let next: BoardShape = style ? { ...sh, style: { ...sh.style, ...style } } : sh;
        const box = shapeBounds(next, lookup);
        const x = num(e.x);
        const y = num(e.y);
        const w = num(e.w);
        const h = num(e.h);
        if (x !== undefined || y !== undefined || w !== undefined || h !== undefined) {
          next = resizeShapeTo(next, { x: x ?? box.x, y: y ?? box.y, w: w ?? box.w, h: h ?? box.h });
        }
        if (typeof e.text === "string") next = { ...next, text: e.text };
        if (isConnector(sh.kind) && (typeof e.from_id === "string" || typeof e.to_id === "string")) {
          for (const ref of [e.from_id, e.to_id]) {
            if (typeof ref === "string" && ref && !isTarget(ref)) return fail(`shape ${i}: no tile or shape "${ref}".`);
          }
          const bind = {
            ...(typeof e.from_id === "string" ? (e.from_id ? { start: e.from_id } : {}) : sh.bind?.start ? { start: sh.bind.start } : {}),
            ...(typeof e.to_id === "string" ? (e.to_id ? { end: e.to_id } : {}) : sh.bind?.end ? { end: sh.bind.end } : {}),
          };
          next = { ...next, bind };
        }
        const { id: _id, ...patch } = next;
        void _id;
        patches.push({ id, patch });
      }
      asAgent(() => {
        const run = () => patches.forEach((p) => updateShape(p.id, p.patch));
        if (board.batch) board.batch(run);
        else run();
      });
      return { ok: true, ids: patches.map((p) => p.id), ...(warnings.length ? { warnings } : {}) };
    }
    return fail('action must be "create", "update" or "delete".');
  };

  const focusTool = (input: unknown) => {
    const a = record(input);
    const tile = find(a.id);
    if (!tile) return missing(a.id);
    if (!store) return fail("The board is not ready yet.");
    const busy = personBusyIn();
    if (busy) {
      const title = find(busy)?.title ?? "a tile";
      return fail(
        `The person is working in "${title}", so the view and selection stay theirs. board_open_item and board_item_act still read and act on "${tile.title}" without moving anything; try board_focus again once they finish.`,
      );
    }
    // Selecting makes the tile LIVE: its feature's own surface (values,
    // write targets, tools) registers, and reaches the agent next turn.
    const show = () => {
      agentSelect(tile.id);
      if (a.mode === "focus") store.focus(tile.id);
      else store.fitItem(tile.id);
    };
    const now = board.read();
    const hidden = [...now.parked, ...(now.removed ?? [])].some((t) => t.id === tile.id);
    if (hidden) {
      // Back on the board first; the camera can only reach it once it has rendered.
      asAgent(() => board.unparkTile(tile.id));
      requestAnimationFrame(() => requestAnimationFrame(show));
    } else show();
    return { ok: true, id: tile.id };
  };

  /**
   * Two frames: a selection or an unpark has rendered and its effects ran. A
   * background tab pauses animation frames, so a timer settles it too — an
   * agent's tool call never waits on the person looking at this tab.
   */
  const settle = () => settleFrames();

  /**
   * The tile's surface capture, held awake for the call (a sleeping tile's body
   * and capture are unmounted until needed) and brought back onto the board if
   * it was parked or removed (only a rendered tile mounts its surface). With
   * `show`, it also becomes the person's live tile — unless they are working
   * in a tile, whose selection and typing are never taken from them. The
   * caller hands `release` to `releaseLater` once the action is done.
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
    if (hidden) asAgent(() => board.unparkTile(tile.id));
    const release = store?.holdAwake(tile.id) ?? (() => {});
    let shown = false;
    if (show && store && !personBusyIn()) {
      if (hidden) await settle();
      if (!personBusyIn()) {
        agentSelect(tile.id);
        store.fitItem(tile.id);
        shown = true;
      }
    }
    const capture = await host.itemSurfaces.wait(tile.id, ITEM_MOUNT_TIMEOUT_MS);
    if (!capture) {
      release();
      return fail(`"${tile.title}" did not mount its ${surface} surface. Nothing was read or changed; try again in a moment.`);
    }
    return { tile, surface, capture, shown, release };
  };

  /** Let a reached tile sleep again a moment after the call, once its result is read. */
  const releaseLater = (release: () => void) => setTimeout(release, AGENT_HOLD_MS);

  /** The tile's "Agent working" chip while this call acts on it (`beginAgentWork`). */
  const working = (id: unknown): (() => void) => {
    const tile = find(id);
    return tile && store ? store.beginAgentWork(tile.id) : () => {};
  };

  const openItem = async (input: unknown, call?: SurfaceToolCall) => {
    const done = working(record(input).id);
    try {
      return await openItemNow(input, call);
    } finally {
      done();
    }
  };

  const openItemNow = async (input: unknown, call?: SurfaceToolCall) => {
    const reached = await reachItem(record(input).id, true);
    if (isFailure(reached)) return reached;
    try {
      await settle();
      const opened = await openItemSurface(reached.capture);
      if (!opened.ok) return opened;
      hand(reached.tile.id, call);
      return {
        id: reached.tile.id,
        title: reached.tile.title,
        kind: host.describe(reached.tile).kind,
        live: reached.shown,
        ...(reached.shown ? {} : { not_selected: "The person is working in another tile, so it was opened without selecting it." }),
        ...opened,
        next: "Act on it with board_item_act: {id, target, value} for a write target, or {id, tool, input} for a tool.",
      };
    } finally {
      releaseLater(reached.release);
    }
  };

  const itemAct = async (input: unknown, call?: SurfaceToolCall) => {
    const done = working(record(input).id);
    try {
      return await itemActNow(input, call);
    } finally {
      done();
    }
  };

  const itemActNow = async (input: unknown, call?: SurfaceToolCall) => {
    const a = record(input);
    const reached = await reachItem(a.id, false);
    if (isFailure(reached)) return reached;
    try {
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
      hand(reached.tile.id, call);
      return { id: reached.tile.id, title: reached.tile.title, ...result };
    } finally {
      releaseLater(reached.release);
    }
  };

  const park = (input: unknown) => {
    const a = record(input);
    const tile = find(a.id);
    if (!tile) return missing(a.id);
    if (a.parked === false) asAgent(() => board.unparkTile(tile.id));
    else asAgent(() => board.parkTile(tile.id));
    return { ok: true, id: tile.id, parked: a.parked !== false };
  };

  /** Takes back the agent's OWN latest change — never the person's. */
  const undo = () => {
    if (!board.undoActor) return refused("undo", "This board keeps no undo history.");
    if (!board.canUndoActor?.("agent")) {
      return fail("Nothing you changed on this board is left to undo. Changes the person made are theirs to undo.");
    }
    const { kept } = board.undoActor("agent");
    if (kept.length === 0) return { ok: true };
    const names = kept.map((id) => find(id)?.title ?? id).join(", ");
    return {
      ok: true,
      kept,
      note: `The person has changed ${names} since, so those were left as they are.`,
    };
  };

  // The person picking a tile is newer than anything handed before it.
  useEffect(() => {
    if (!store) return;
    return store.subscribeSelection(() => {
      const state = handed();
      if (!state.agentSelecting) state.personPickedAt = Date.now();
    });
  }, [store]);

  /**
   * A HANDED ITEM TAKES ITS OWN WRITES (`agent-write-sources.ts`). The agent
   * opened a note, then in the same turn sent `apply_surface_write` edits
   * beside a `board_add_tile`; the add selected the new tile, the note left
   * the global stack, and both edits failed for a target the agent had just
   * been handed (real test, 2026-10-02). An agent write that the newest
   * handed item declares is resolved in that item's capture, held awake
   * through its card — unless the person has since picked another tile whose
   * surface declares the same target (their choice is newer).
   */
  const itemSurfacesRef = useRef(host.itemSurfaces);
  useEffect(() => {
    itemSurfacesRef.current = host.itemSurfaces;
  });
  const onScreenTiles = () => board.read().tiles;
  const tilesRef = useRef(onScreenTiles);
  useEffect(() => {
    tilesRef.current = onScreenTiles;
  });
  useEffect(
    () =>
      registerAgentWriteSource(async (query) => {
        const index = itemSurfacesRef.current;
        if (!index || !store) return null;
        const state = handed();
        const now = Date.now();
        const liveId = store.getFocused() ?? store.getEditing() ?? store.getSelected();
        const onBoard = new Set(tilesRef.current().map((t) => t.id));
        const candidates = [...state.items.entries()]
          .filter(
            ([id, entry]) =>
              onBoard.has(id) &&
              now - entry.at < HANDED_ITEM_MS &&
              (!entry.conversationId || !query.conversationId || entry.conversationId === query.conversationId) &&
              !(query.onScreenDeclares && id !== liveId && state.personPickedAt > entry.at),
          )
          .sort((a, b) => b[1].at - a[1].at);
        for (const [id] of candidates) {
          const release = store.holdAwake(id);
          const capture = await index.wait(id, ITEM_MOUNT_TIMEOUT_MS);
          const runtime = capture ? await waitForCapturedRuntime(capture, ITEM_MOUNT_TIMEOUT_MS) : null;
          const fits =
            capture &&
            runtime &&
            (!query.surfaceName || runtime.surfaceName === query.surfaceName) &&
            listAgentWritableTargets(capture).some((entry) => entry.target.name === query.targetName);
          if (capture && fits) {
            // apply_surface_write on a handed item: its chip says the agent is on it until the write lands.
            const done = store.beginAgentWork(id);
            return {
              source: capture,
              release: () => {
                done();
                releaseLater(release);
              },
            };
          }
          release();
          console.warn("[board] a handed item did not take the agent's write", {
            id,
            targetName: query.targetName,
            mounted: Boolean(capture),
            runtime: runtime?.surfaceName ?? null,
            declares: capture ? listAgentWritableTargets(capture).map((entry) => entry.target.name) : [],
          });
        }
        if (state.items.size > 0 && candidates.length === 0) {
          console.warn("[board] no handed item could take the agent's write", {
            targetName: query.targetName,
            handed: [...state.items.entries()].map(([id, entry]) => ({
              id,
              onBoard: onBoard.has(id),
              ageMs: now - entry.at,
              sameConversation: !entry.conversationId || !query.conversationId || entry.conversationId === query.conversationId,
              personPickedSince: state.personPickedAt > entry.at,
            })),
            onScreenDeclares: query.onScreenDeclares,
          });
        }
        return null;
      }),
    [store],
  );

  useSurfaceClientTools(surfaceName, {
    board_read: read,
    board_add_tile: add,
    board_add_items: addItems,
    board_find_records: findRecords,
    board_update_tile: update,
    board_remove_tile: remove,
    board_move_tiles: moveTiles,
    board_arrange: arrangeTool,
    board_group: group,
    board_connect: connectTool,
    board_shape: shapeTool,
    board_focus: focusTool,
    board_open_item: openItem,
    board_item_act: itemAct,
    board_park: park,
    board_undo: undo,
  });
}
