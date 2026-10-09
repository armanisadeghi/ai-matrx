/**
 * BoardStore — the board MODEL, outside React (the camera's twin:
 * `engine/camera-store.ts`).
 *
 * Tiles, frames, shapes, connections, the shelf and one undo stack. Every way
 * a board changes — a gesture, the tool bar, the menu, an agent — goes through
 * these methods, so there is ONE path and one ⌘Z stack. Persistence
 * serialises exactly this state.
 *
 * Why it is not React state: a drag or resize changes one tile's rect at
 * pointer rate (120 Hz). Held in a host's `useState`, every frame re-rendered
 * the whole board — every tile and every heavy body (a chat, an editor, a
 * table) — and a board of dozens of live tiles locked up on the first resize.
 * Here a change notifies only who reads what changed:
 *   - `subscribeTile(id)` — that tile's record changed (its rect, title, source);
 *   - `subscribeLayout`   — which tiles exist, the shelf, frames,
 *                           connections, or whether undo/redo is possible;
 *   - `subscribeShapes`   — the shapes list (a drawing moved, restyled, added);
 *   - `subscribe`         — anything (persistence, a layers list).
 * A move of one tile wakes one tile. Records are immutable, so "changed" is a
 * reference check.
 *
 * History: every change is one step, except moves and resizes, which coalesce —
 * a drag or resize of one item is one step however many frames it took (Figma).
 *
 * Actors: a change made inside `runAs("agent", fn)` is the ASSISTANT's. ⌘Z
 * (`undo`) still walks the one shared stack — the person can take back
 * anything. `undoActor("agent")` takes back only the assistant's own latest
 * change, reverting just the records it touched that nobody changed since —
 * so an agent's undo can never undo the person's own move (Figma / Google
 * Docs: each collaborator's undo is their own).
 */

import type { Rect } from "../engine/camera";
import { findFreeSpot, placeInFlow, type PlacementFlow } from "../engine/placement";
import {
  type BindTarget,
  type BoardShape,
  type ShapeStyle,
  bakeBindings,
  boundsOfPoints,
  isBoxKind,
  isConnector,
  resizeShapeTo,
  shapeBounds,
  translateShape,
  withStyle,
} from "../engine/shapes";

export type { BoardShape, ShapeKind, ShapeStyle } from "../engine/shapes";

export interface BoardTileBase {
  id: string;
  rect: Rect;
}

export interface BoardFrame {
  id: string;
  rect: Rect;
  title: string;
  note?: string;
}

/** A connection drawn between two tiles (a pipeline hand-off, a "see also"). */
export interface BoardConnection {
  id: string;
  from: string;
  to: string;
}

/** A board to start from: tiles (parked ones listed in `parked`) and the rest. */
export interface BoardSeed<T extends BoardTileBase> {
  tiles: T[];
  frames?: BoardFrame[];
  /** Ids of tiles that start on the shelf. */
  parked?: string[];
  shapes?: BoardShape[];
  connections?: BoardConnection[];
}

export interface BoardView<T extends BoardTileBase> {
  tiles: T[];
  parked: T[];
  frames: BoardFrame[];
  connections: BoardConnection[];
}

/**
 * What a host renders the board's STRUCTURE from. It changes only when tiles
 * come or go, park, or frames/connections/undo-ability change — never when a
 * tile moves, resizes or its content changes (those wake that tile), and never
 * when a SHAPE changes: shapes have their own channel (`subscribeShapes`), so
 * dragging a drawing re-renders the shapes layer and nothing else.
 */
export interface BoardLayout<T extends BoardTileBase = BoardTileBase> {
  /** Tiles on the board (not parked), in order. */
  tileIds: readonly string[];
  parkedIds: readonly string[];
  /** The parked tiles' records (a shelf shows their titles; they never move). */
  parked: readonly T[];
  frames: readonly BoardFrame[];
  connections: readonly BoardConnection[];
  canUndo: boolean;
  canRedo: boolean;
}

interface Snapshot<T> {
  order: string[];
  byId: Record<string, T>;
  parked: string[];
  frames: BoardFrame[];
  shapes: BoardShape[];
  connections: BoardConnection[];
}

interface History<T> {
  now: Snapshot<T>;
  past: Snapshot<T>[];
  future: Snapshot<T>[];
  /** The item whose move is being coalesced, and when it last moved. */
  moving: { id: string; at: number } | null;
}

type Listener = () => void;

/** Who made a change. */
export type BoardActor = "person" | "agent";

/** One change an actor made: the board before and after it. */
interface ActorStep<T> {
  before: Snapshot<T>;
  after: Snapshot<T>;
}

/** What `undoActor` did. */
export interface ActorUndoResult {
  /** False when that actor has no change left to take back. */
  undone: boolean;
  /** Items the actor changed that someone else has changed since — left as they are. */
  kept: string[];
}

const HISTORY_LIMIT = 100;
const ACTOR_STEPS_LIMIT = 50;
const MOVE_COALESCE_MS = 600;

function seedHistory<T extends BoardTileBase>(start: T[] | BoardSeed<T>): History<T> {
  const {
    tiles,
    frames = [],
    parked = [],
    shapes = [],
    connections = [],
  }: BoardSeed<T> = Array.isArray(start) ? { tiles: start } : start;
  const ids = new Set(tiles.map((t) => t.id));
  return {
    now: {
      order: tiles.map((t) => t.id),
      byId: Object.fromEntries(tiles.map((t) => [t.id, t])),
      parked: parked.filter((id) => ids.has(id)),
      frames,
      shapes,
      connections: connections.filter((c) => ids.has(c.from) && ids.has(c.to)),
    },
    past: [],
    future: [],
    moving: null,
  };
}

function insertAt(list: string[], id: string, index: number): string[] {
  if (index < 0 || index >= list.length) return [...list, id];
  return [...list.slice(0, index), id, ...list.slice(index)];
}

export class BoardStore<T extends BoardTileBase> {
  private h: History<T>;
  private listeners = new Set<Listener>();
  private layoutListeners = new Set<Listener>();
  private tileListeners = new Map<string, Set<Listener>>();
  private shapeListeners = new Set<Listener>();
  private viewCache: { now: Snapshot<T>; view: BoardView<T> } | null = null;
  private layoutCache: BoardLayout<T> | null = null;
  private actor: BoardActor = "person";
  private agentSteps: ActorStep<T>[] = [];
  /** Agent steps the person's ⌘Z took back — ⇧⌘Z puts them back on the agent's list. */
  private undoneAgentSteps: ActorStep<T>[] = [];

  constructor(start: T[] | BoardSeed<T>) {
    this.h = seedHistory(start);
  }

  // ── reads ────────────────────────────────────────────────────────────────

  /** The board as of the LAST change — what a sequence of commands in one
   * tick (an agent's tool calls) must read. Cached per change. */
  read = (): BoardView<T> => {
    const now = this.h.now;
    if (this.viewCache?.now === now) return this.viewCache.view;
    const parkedSet = new Set(now.parked);
    const view: BoardView<T> = {
      tiles: now.order.filter((id) => !parkedSet.has(id) && now.byId[id]).map((id) => now.byId[id]),
      parked: now.parked.filter((id) => now.byId[id]).map((id) => now.byId[id]),
      frames: now.frames,
      connections: now.connections,
    };
    this.viewCache = { now, view };
    return view;
  };

  /** One tile's current record (on the board or parked). */
  getTile = (id: string): T | undefined => this.h.now.byId[id];

  getLayout = (): BoardLayout<T> => {
    const now = this.h.now;
    const canUndo = this.h.past.length > 0;
    const canRedo = this.h.future.length > 0;
    const c = this.layoutCache;
    if (
      c &&
      c.frames === now.frames &&
      c.connections === now.connections &&
      c.canUndo === canUndo &&
      c.canRedo === canRedo &&
      sameIds(c, now)
    ) {
      return c;
    }
    const parkedSet = new Set(now.parked);
    const parkedIds = now.parked.filter((id) => now.byId[id]);
    this.layoutCache = {
      tileIds: now.order.filter((id) => !parkedSet.has(id) && now.byId[id]),
      parkedIds,
      parked: parkedIds.map((id) => now.byId[id]),
      frames: now.frames,
      connections: now.connections,
      canUndo,
      canRedo,
    };
    return this.layoutCache;
  };

  get shapes(): BoardShape[] {
    return this.h.now.shapes;
  }
  /** The shapes list, bottom to top (stable between changes; for `useSyncExternalStore`). */
  getShapes = (): readonly BoardShape[] => this.h.now.shapes;
  getShape = (id: string): BoardShape | undefined => this.h.now.shapes.find((s) => s.id === id);

  /**
   * What a line / arrow end can bind to, by id: a tile (its rect) or a
   * rectangle / oval shape (its box and outline). Stable — reads the live board.
   */
  targetOf = (id: string): BindTarget | undefined => {
    const now = this.h.now;
    const tile = now.byId[id];
    if (tile) return { rect: tile.rect, outline: "rect" };
    const shape = now.shapes.find((s) => s.id === id);
    if (shape && isBoxKind(shape.kind)) return { rect: boundsOfPoints(shape.points), outline: shape.kind === "oval" ? "oval" : "rect" };
    return undefined;
  };
  get frames(): BoardFrame[] {
    return this.h.now.frames;
  }
  get connections(): BoardConnection[] {
    return this.h.now.connections;
  }
  get canUndo(): boolean {
    return this.h.past.length > 0;
  }
  get canRedo(): boolean {
    return this.h.future.length > 0;
  }

  // ── subscriptions ────────────────────────────────────────────────────────

  /** Any change at all (persistence, a full list). */
  subscribe = (l: Listener): (() => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };

  /** The board's structure (see `BoardLayout`). */
  subscribeLayout = (l: Listener): (() => void) => {
    this.layoutListeners.add(l);
    return () => this.layoutListeners.delete(l);
  };

  /** The shapes list. */
  subscribeShapes = (l: Listener): (() => void) => {
    this.shapeListeners.add(l);
    return () => this.shapeListeners.delete(l);
  };

  /** One tile's record. */
  subscribeTile = (id: string, l: Listener): (() => void) => {
    let set = this.tileListeners.get(id);
    if (!set) {
      set = new Set();
      this.tileListeners.set(id, set);
    }
    set.add(l);
    return () => {
      set.delete(l);
      if (set.size === 0 && this.tileListeners.get(id) === set) this.tileListeners.delete(id);
    };
  };

  // ── the one write path ───────────────────────────────────────────────────

  private commit(next: History<T>): void {
    const prev = this.h;
    if (next === prev) return;
    this.h = next;
    if (this.actor === "agent" && prev.now !== next.now) {
      this.agentSteps = [...this.agentSteps, { before: prev.now, after: next.now }].slice(-ACTOR_STEPS_LIMIT);
    }
    const a = prev.now;
    const b = next.now;
    // Wake each tile whose record changed — a reference check per subscriber,
    // so a 300-tile board pays for the one tile that moved.
    if (a.byId !== b.byId) {
      for (const [id, set] of this.tileListeners) {
        if (a.byId[id] !== b.byId[id]) for (const l of [...set]) l();
      }
    }
    if (a.shapes !== b.shapes) for (const l of [...this.shapeListeners]) l();
    const layout = this.layoutCache;
    if (!layout || this.getLayout() !== layout) for (const l of [...this.layoutListeners]) l();
    for (const l of [...this.listeners]) l();
  }

  /** Apply one undoable change. */
  private change(fn: (s: Snapshot<T>) => Snapshot<T>): void {
    const st = this.h;
    const next = fn(st.now);
    if (next === st.now) return;
    this.commit({ now: next, past: [...st.past, st.now].slice(-HISTORY_LIMIT), future: [], moving: null });
  }

  /** One gesture step on one item's rect. Successive steps on the same item
   * within MOVE_COALESCE_MS are ONE undo step (a drag, a resize). */
  private gestureRect(id: string, patch: (r: Rect) => Rect): void {
    const st = this.h;
    const tile = st.now.byId[id];
    const frame = tile ? undefined : st.now.frames.find((f) => f.id === id);
    if (!tile && !frame) return;
    const current = tile ? tile.rect : frame!.rect;
    const rect = patch(current);
    if (rect.x === current.x && rect.y === current.y && rect.w === current.w && rect.h === current.h) return;
    const t = performance.now();
    const coalesce = st.moving?.id === id && t - st.moving.at < MOVE_COALESCE_MS;
    const now: Snapshot<T> = tile
      ? { ...st.now, byId: { ...st.now.byId, [id]: { ...tile, rect } } }
      : { ...st.now, frames: st.now.frames.map((f) => (f.id === id ? { ...f, rect } : f)) };
    this.commit({
      now,
      past: coalesce ? st.past : [...st.past, st.now].slice(-HISTORY_LIMIT),
      future: coalesce ? st.future : [],
      moving: { id, at: t },
    });
  }

  // ── operations ───────────────────────────────────────────────────────────

  moveTile = (id: string, x: number, y: number): void => this.gestureRect(id, (r) => ({ ...r, x, y }));

  /** Set a tile's whole rect (a resize handle drag). Coalesces like a move:
   * one gesture is one undoable step. */
  resizeTile = (id: string, rect: Rect): void => this.gestureRect(id, () => ({ ...rect }));

  /** Move many tiles (and/or frames) as ONE undoable step — an arrangement.
   * `addFrames` draws frames in the same step ("Tidy into frames by type"). */
  moveMany = (moves: { id: string; x: number; y: number }[], opts: { addFrames?: BoardFrame[] } = {}): void =>
    this.change((s) => {
      const at = new Map(moves.map((m) => [m.id, m]));
      const byId = { ...s.byId };
      for (const [id, m] of at) {
        const t = byId[id];
        if (t) byId[id] = { ...t, rect: { ...t.rect, x: m.x, y: m.y } };
      }
      const frames = s.frames.map((f) => {
        const m = at.get(f.id);
        return m ? { ...f, rect: { ...f.rect, x: m.x, y: m.y } } : f;
      });
      const shapes = this.movedShapes(s, at) ?? s.shapes;
      return { ...s, byId, shapes, frames: opts.addFrames?.length ? [...frames, ...opts.addFrames] : frames };
    });

  /**
   * The shapes list with every shape named in `at` moved so its box's corner
   * lands at the given point, or null when none moved. A line / arrow end
   * bound to something that is NOT moving with it lets go where it is drawn
   * (tldraw: dragging an arrow alone detaches it); ends whose target moves too
   * stay bound.
   */
  private movedShapes(s: Snapshot<T>, at: ReadonlyMap<string, { x: number; y: number }>): BoardShape[] | null {
    let changed = false;
    const lookup = this.lookupIn(s);
    const shapes = s.shapes.map((sh) => {
      const m = at.get(sh.id);
      if (!m) return sh;
      const box = shapeBounds(sh, lookup);
      const dx = m.x - box.x;
      const dy = m.y - box.y;
      if (dx === 0 && dy === 0) return sh;
      changed = true;
      let next = sh;
      if (sh.bind && isConnector(sh.kind)) {
        const loose = new Set([sh.bind.start, sh.bind.end].filter((id): id is string => !!id && !at.has(id)));
        if (loose.size) next = bakeBindings(sh, lookup, loose);
      }
      return translateShape(next, dx, dy);
    });
    return changed ? shapes : null;
  }

  /** `targetOf` over a given snapshot (the one a change is being computed from). */
  private lookupIn(s: Snapshot<T>) {
    return (id: string): BindTarget | undefined => {
      const tile = s.byId[id];
      if (tile) return { rect: tile.rect, outline: "rect" };
      const shape = s.shapes.find((x) => x.id === id);
      if (shape && isBoxKind(shape.kind)) return { rect: boundsOfPoints(shape.points), outline: shape.kind === "oval" ? "oval" : "rect" };
      return undefined;
    };
  }

  /** Shapes whose bound ends point at `gone` let go where they are drawn now. */
  private releaseBindings(s: Snapshot<T>, gone: ReadonlySet<string>, shapes: BoardShape[]): BoardShape[] {
    const lookup = this.lookupIn(s);
    let changed = false;
    const out = shapes.map((sh) => {
      if (!sh.bind || (!gone.has(sh.bind.start ?? "") && !gone.has(sh.bind.end ?? ""))) return sh;
      changed = true;
      return bakeBindings(sh, lookup, gone);
    });
    return changed ? out : shapes;
  }

  /**
   * One step of a GROUP gesture — a multi-selection drag, a frame carrying its
   * tiles, a keyboard nudge. Successive steps on the same set of items within
   * MOVE_COALESCE_MS are ONE undo step, exactly like a single tile's drag.
   */
  dragMany = (moves: { id: string; x: number; y: number }[]): void => {
    const st = this.h;
    const at = new Map(moves.map((m) => [m.id, m]));
    let byId = st.now.byId;
    for (const [id, m] of at) {
      const t = byId[id];
      if (!t || (t.rect.x === m.x && t.rect.y === m.y)) continue;
      if (byId === st.now.byId) byId = { ...byId };
      byId[id] = { ...t, rect: { ...t.rect, x: m.x, y: m.y } };
    }
    let framesChanged = false;
    const frames = st.now.frames.map((f) => {
      const m = at.get(f.id);
      if (!m || (f.rect.x === m.x && f.rect.y === m.y)) return f;
      framesChanged = true;
      return { ...f, rect: { ...f.rect, x: m.x, y: m.y } };
    });
    const shapes = this.movedShapes(st.now, at);
    if (byId === st.now.byId && !framesChanged && !shapes) return;
    const key = `group:${[...at.keys()].sort().join("|")}`;
    const t = performance.now();
    const coalesce = st.moving?.id === key && t - st.moving.at < MOVE_COALESCE_MS;
    this.commit({
      now: { ...st.now, byId, frames: framesChanged ? frames : st.now.frames, shapes: shapes ?? st.now.shapes },
      past: coalesce ? st.past : [...st.past, st.now].slice(-HISTORY_LIMIT),
      future: coalesce ? st.future : [],
      moving: { id: key, at: t },
    });
  };

  connect = (c: BoardConnection): void =>
    this.change((s) =>
      s.connections.some((x) => x.from === c.from && x.to === c.to) ? s : { ...s, connections: [...s.connections, c] },
    );

  disconnect = (id: string): void =>
    this.change((s) => ({ ...s, connections: s.connections.filter((c) => c.id !== id) }));

  /** Add a tile. With `near`, it lands in the nearest free space to that world
   * point, clear of tiles AND frames (a group is not free space) — except the
   * frame named by `within`, where it may land among that group's tiles. With
   * `flow`, it takes the first free spot of that block in reading order (a run
   * of adds fills the view like text; `near` then only says where a run's
   * first tile is centred when that spot is free). */
  addTile = (
    tile: T,
    near?: { x: number; y: number },
    opts: { within?: string; flow?: PlacementFlow } = {},
  ): Rect => {
    const cur = this.read();
    const obstacles = [
      ...cur.tiles.map((t) => t.rect),
      ...cur.frames.filter((f) => f.id !== opts.within).map((f) => f.rect),
    ];
    const size = { w: tile.rect.w, h: tile.rect.h };
    const rect = opts.flow
      ? placeInFlow(obstacles, size, opts.flow, near)
      : near
        ? findFreeSpot(obstacles, size, near)
        : tile.rect;
    const placed = { ...tile, rect };
    this.change((s) => ({
      ...s,
      order: s.order.includes(tile.id) ? s.order : [...s.order, tile.id],
      byId: { ...s.byId, [tile.id]: placed },
    }));
    return rect;
  };

  addTiles = (batch: T[]): void =>
    this.change((s) => ({
      ...s,
      order: [...s.order, ...batch.map((t) => t.id).filter((id) => !s.byId[id])],
      byId: { ...s.byId, ...Object.fromEntries(batch.map((t) => [t.id, t])) },
    }));

  /** Change a tile's own fields. One undoable step, unless `history: false`
   * (typing, or a note gaining its record id — undoing those would lose work
   * or duplicate a record). */
  updateTile = (id: string, patch: Partial<T>, opts: { history?: boolean } = {}): void => {
    const apply = (s: Snapshot<T>): Snapshot<T> =>
      s.byId[id] ? { ...s, byId: { ...s.byId, [id]: { ...s.byId[id], ...patch } } } : s;
    if (opts.history === false) {
      // Also patch history, so undo never resurrects the old value.
      const st = this.h;
      const now = apply(st.now);
      if (now === st.now) return;
      this.commit({ ...st, now, past: st.past.map(apply), future: st.future.map(apply) });
    } else this.change(apply);
  };

  /** Drop tiles with no undo (the batch that added them is being taken back). */
  dropTiles = (ids: string[]): void => {
    const drop = new Set(ids);
    const st = this.h;
    if (!ids.some((id) => st.now.byId[id])) return;
    this.commit({
      ...st,
      now: {
        ...st.now,
        order: st.now.order.filter((id) => !drop.has(id)),
        byId: Object.fromEntries(Object.entries(st.now.byId).filter(([id]) => !drop.has(id))),
        parked: st.now.parked.filter((id) => !drop.has(id)),
      },
    });
  };

  /** Remove a tile; returns a function that puts it back. */
  removeTile = (id: string): (() => void) => {
    const cur = this.h.now;
    const removed = cur.byId[id];
    const index = cur.order.indexOf(id);
    const wasParked = cur.parked.includes(id);
    const itsConnections = cur.connections.filter((c) => c.from === id || c.to === id);
    this.change((s) => {
      if (!s.byId[id]) return s;
      const byId = { ...s.byId };
      delete byId[id];
      return {
        ...s,
        order: s.order.filter((x) => x !== id),
        byId,
        parked: s.parked.filter((x) => x !== id),
        shapes: this.releaseBindings(s, new Set([id]), s.shapes),
        connections: s.connections.filter((c) => c.from !== id && c.to !== id),
      };
    });
    return () =>
      this.change((s) =>
        s.byId[id] || !removed
          ? s
          : {
              ...s,
              order: insertAt(s.order, id, index),
              byId: { ...s.byId, [id]: removed },
              parked: wasParked ? [...s.parked, id] : s.parked,
              connections: [...s.connections, ...itsConnections],
            },
      );
  };

  /**
   * Remove several things at once — a multi-selection's Delete — as ONE undo
   * step: tiles (with their connections), frames (never the tiles inside one
   * unless those are named too) and shapes.
   */
  removeMany = (ids: readonly string[]): void =>
    this.change((s) => {
      const drop = new Set(ids);
      const tiles = ids.filter((id) => s.byId[id]);
      const frames = s.frames.filter((f) => !drop.has(f.id));
      const kept = s.shapes.filter((x) => !drop.has(x.id));
      if (tiles.length === 0 && frames.length === s.frames.length && kept.length === s.shapes.length) return s;
      const shapes = this.releaseBindings(s, drop, kept);
      const byId = { ...s.byId };
      for (const id of tiles) delete byId[id];
      return {
        ...s,
        order: s.order.filter((id) => !drop.has(id)),
        byId,
        parked: s.parked.filter((id) => !drop.has(id)),
        frames,
        shapes,
        connections: s.connections.filter((c) => !drop.has(c.from) && !drop.has(c.to)),
      };
    });

  parkTile = (id: string): (() => void) => {
    this.change((s) => (s.parked.includes(id) ? s : { ...s, parked: [...s.parked, id] }));
    return () => this.unparkTile(id);
  };

  unparkTile = (id: string): void =>
    this.change((s) => (s.parked.includes(id) ? { ...s, parked: s.parked.filter((x) => x !== id) } : s));

  addFrame = (frame: BoardFrame): void => this.change((s) => ({ ...s, frames: [...s.frames, frame] }));

  updateFrame = (id: string, patch: Partial<BoardFrame>): void =>
    this.change((s) => ({ ...s, frames: s.frames.map((f) => (f.id === id ? { ...f, ...patch } : f)) }));

  removeFrame = (id: string): void => this.change((s) => ({ ...s, frames: s.frames.filter((f) => f.id !== id) }));

  addShape = (shape: BoardShape): void => this.change((s) => ({ ...s, shapes: [...s.shapes, shape] }));

  /** Several shapes as ONE step (an agent's diagram). */
  addShapes = (batch: BoardShape[]): void =>
    batch.length ? this.change((s) => ({ ...s, shapes: [...s.shapes, ...batch] })) : undefined;

  removeShape = (id: string): void => this.removeMany([id]);

  /** Change one shape's own fields (text, points, binding) as one undoable step. */
  updateShape = (id: string, patch: Partial<Omit<BoardShape, "id">>): void =>
    this.change((s) => {
      const at = s.shapes.findIndex((x) => x.id === id);
      if (at < 0) return s;
      const shapes = [...s.shapes];
      const next: BoardShape = { ...shapes[at], ...patch };
      if (patch.text === "") delete next.text;
      if (patch.bind && !patch.bind.start && !patch.bind.end) delete next.bind;
      shapes[at] = next;
      return { ...s, shapes };
    });

  /** Restyle several shapes as ONE undoable step (the floating toolbar). */
  restyleShapes = (ids: readonly string[], patch: Partial<ShapeStyle>): void =>
    this.change((s) => {
      const set = new Set(ids);
      let changed = false;
      const shapes = s.shapes.map((sh) => {
        if (!set.has(sh.id)) return sh;
        changed = true;
        return withStyle(sh, patch);
      });
      return changed ? { ...s, shapes } : s;
    });

  /** One gesture step on one shape (a resize handle, an end handle). Coalesces like a move: one gesture, one step. */
  private gestureShape(id: string, fn: (sh: BoardShape) => BoardShape): void {
    const st = this.h;
    const at = st.now.shapes.findIndex((x) => x.id === id);
    if (at < 0) return;
    const next = fn(st.now.shapes[at]);
    if (next === st.now.shapes[at]) return;
    const shapes = [...st.now.shapes];
    shapes[at] = next;
    const t = performance.now();
    const coalesce = st.moving?.id === id && t - st.moving.at < MOVE_COALESCE_MS;
    this.commit({
      now: { ...st.now, shapes },
      past: coalesce ? st.past : [...st.past, st.now].slice(-HISTORY_LIMIT),
      future: coalesce ? st.future : [],
      moving: { id, at: t },
    });
  }

  /** Fit a shape to a box (its eight handles): a pen stroke scales, a line keeps its direction. */
  resizeShape = (id: string, rect: Rect): void => this.gestureShape(id, (sh) => resizeShapeTo(sh, rect));

  /** Move one end of a line / arrow, binding it to `bindTo` (a tile or box shape) or letting it go. */
  setShapeEnd = (id: string, end: "start" | "end", point: { x: number; y: number }, bindTo?: string | null): void =>
    this.gestureShape(id, (sh) => {
      if (!isConnector(sh.kind)) return sh;
      const points = [...sh.points];
      points[end === "start" ? 0 : points.length - 1] = point;
      const bind = { ...sh.bind, [end]: bindTo ?? undefined };
      const next: BoardShape = { ...sh, points };
      if (bind.start || bind.end) next.bind = { ...(bind.start ? { start: bind.start } : {}), ...(bind.end ? { end: bind.end } : {}) };
      else delete next.bind;
      return next;
    });

  /** Bring shapes forward / to the front, or send them backward / to the back (one step). */
  reorderShapes = (ids: readonly string[], dir: "forward" | "backward" | "front" | "back"): void =>
    this.change((s) => {
      const set = new Set(ids);
      const picked = s.shapes.filter((x) => set.has(x.id));
      if (picked.length === 0) return s;
      let shapes: BoardShape[];
      if (dir === "front") shapes = [...s.shapes.filter((x) => !set.has(x.id)), ...picked];
      else if (dir === "back") shapes = [...picked, ...s.shapes.filter((x) => !set.has(x.id))];
      else {
        shapes = [...s.shapes];
        const step = dir === "forward" ? 1 : -1;
        const order = dir === "forward" ? [...shapes.keys()].reverse() : [...shapes.keys()];
        for (const i of order) {
          const j = i + step;
          if (!set.has(shapes[i].id) || j < 0 || j >= shapes.length || set.has(shapes[j].id)) continue;
          [shapes[i], shapes[j]] = [shapes[j], shapes[i]];
        }
      }
      return shapes.every((x, i) => x === s.shapes[i]) ? s : { ...s, shapes };
    });

  /**
   * Copies of these shapes, offset down-right, as ONE step (⌘D). A binding
   * to another copied shape follows to its copy; other bindings let go.
   * Returns the new ids in the same order.
   */
  duplicateShapes = (ids: readonly string[], offset = 24): string[] => {
    const now = this.h.now;
    const set = new Set(ids);
    const source = now.shapes.filter((x) => set.has(x.id));
    if (source.length === 0) return [];
    const newId = new Map(source.map((sh) => [sh.id, `${sh.kind}:${Math.random().toString(36).slice(2, 10)}`]));
    const lookup = this.lookupIn(now);
    const copies = source.map((sh) => {
      let base = sh;
      if (sh.bind) {
        const outside = new Set([sh.bind.start, sh.bind.end].filter((id): id is string => !!id && !set.has(id)));
        if (outside.size) base = bakeBindings(sh, lookup, outside);
      }
      const copy = translateShape({ ...base, id: newId.get(sh.id)! }, offset, offset);
      if (copy.bind) {
        copy.bind = {
          ...(copy.bind.start ? { start: newId.get(copy.bind.start) ?? copy.bind.start } : {}),
          ...(copy.bind.end ? { end: newId.get(copy.bind.end) ?? copy.bind.end } : {}),
        };
      }
      return copy;
    });
    this.change((s) => ({ ...s, shapes: [...s.shapes, ...copies] }));
    return copies.map((c) => c.id);
  };

  undo = (): void => {
    const st = this.h;
    if (st.past.length === 0) return;
    // The person's ⌘Z took back the agent's latest change: it is no longer the
    // agent's to undo (board_undo would report a false "changed since").
    const top = this.agentSteps[this.agentSteps.length - 1];
    if (top && top.after === st.now) {
      this.agentSteps = this.agentSteps.slice(0, -1);
      this.undoneAgentSteps = [...this.undoneAgentSteps, top];
    }
    this.commit({
      now: st.past[st.past.length - 1],
      past: st.past.slice(0, -1),
      future: [st.now, ...st.future],
      moving: null,
    });
  };

  redo = (): void => {
    const st = this.h;
    if (st.future.length === 0) return;
    const back = this.undoneAgentSteps[this.undoneAgentSteps.length - 1];
    if (back && back.before === st.now && back.after === st.future[0]) {
      this.undoneAgentSteps = this.undoneAgentSteps.slice(0, -1);
      this.agentSteps = [...this.agentSteps, back];
    }
    this.commit({ now: st.future[0], past: [...st.past, st.now], future: st.future.slice(1), moving: null });
  };

  // ── batches ──────────────────────────────────────────────────────────────

  private batchDepth = 0;

  /**
   * Run `fn` as ONE undoable step: every change it makes (several adds, a move)
   * is one entry on the shared stack and, for the agent, one change to take
   * back. Nested batches fold into the outermost.
   */
  batch = <R>(fn: () => R): R => {
    if (this.batchDepth > 0) return fn();
    const start = this.h;
    const agentBefore = this.agentSteps.length;
    this.batchDepth += 1;
    try {
      return fn();
    } finally {
      this.batchDepth -= 1;
      const end = this.h;
      if (end.now !== start.now) {
        this.h = { ...end, past: [...start.past, start.now].slice(-HISTORY_LIMIT), future: [], moving: null };
        if (end.now.shapes !== start.now.shapes) for (const l of [...this.shapeListeners]) l();
        if (this.agentSteps.length - agentBefore > 1) {
          const mine = this.agentSteps.slice(agentBefore);
          this.agentSteps = [
            ...this.agentSteps.slice(0, agentBefore),
            { before: mine[0].before, after: mine[mine.length - 1].after },
          ];
        }
        const layout = this.layoutCache;
        if (!layout || this.getLayout() !== layout) for (const l of [...this.layoutListeners]) l();
        for (const l of [...this.listeners]) l();
      }
    }
  };

  // ── actors ───────────────────────────────────────────────────────────────

  /** Run `fn` with every change it makes tagged as `actor`'s. */
  runAs = <R>(actor: BoardActor, fn: () => R): R => {
    const prev = this.actor;
    this.actor = actor;
    try {
      return fn();
    } finally {
      this.actor = prev;
    }
  };

  /** Whether `actor` has a change of its own it could take back. */
  canUndoActor = (actor: BoardActor): boolean => actor === "agent" && this.agentSteps.length > 0;

  /**
   * Take back `actor`'s own latest change (only "agent" is tracked; the
   * person's undo is `undo`). Every record that change touched goes back to
   * what it was before — unless someone has changed that record since, which
   * is kept and named. The revert is ONE step on the shared stack, so ⌘Z can
   * take it back too.
   */
  undoActor = (actor: BoardActor): ActorUndoResult => {
    if (actor !== "agent") return { undone: false, kept: [] };
    const step = this.agentSteps[this.agentSteps.length - 1];
    if (!step) return { undone: false, kept: [] };
    this.agentSteps = this.agentSteps.slice(0, -1);
    const kept: string[] = [];
    // The revert itself is nobody's new change to take back.
    this.runAs("person", () => this.change((now) => revertStep(step, now, kept)));
    return { undone: true, kept };
  };
}

/**
 * `now` with `step` taken back: each record the step changed returns to its
 * `before` value when `now` still holds the step's `after` value; a record
 * someone changed since is left alone and named in `kept`.
 */
function revertStep<T extends BoardTileBase>(step: ActorStep<T>, now: Snapshot<T>, kept: string[]): Snapshot<T> {
  const { before, after } = step;
  let next = now;
  // Tile records.
  if (before.byId !== after.byId) {
    const ids = new Set([...Object.keys(before.byId), ...Object.keys(after.byId)]);
    let byId = next.byId;
    let order = next.order;
    for (const id of ids) {
      const was = before.byId[id];
      const became = after.byId[id];
      if (was === became) continue;
      if (now.byId[id] !== became) {
        kept.push(id);
        continue;
      }
      byId = { ...byId };
      if (was) byId[id] = was;
      else delete byId[id];
      if (!was) order = order.filter((x) => x !== id);
      else if (!order.includes(id)) order = insertAt(order, id, before.order.indexOf(id));
    }
    if (byId !== next.byId || order !== next.order) next = { ...next, byId, order };
  }
  // The shelf: what the step parked comes back. What it UNPARKED stays on the
  // board — an agent brings a tile back to open it, and the person may be
  // working in it now; parking it again would unmount it under them.
  if (before.parked !== after.parked) {
    const parkedBefore = new Set(before.parked);
    let parked = next.parked;
    for (const id of after.parked) if (!parkedBefore.has(id)) parked = parked.filter((x) => x !== id);
    if (parked !== next.parked) next = { ...next, parked };
  }
  next = revertList(next, "frames", before.frames, after.frames, kept);
  next = revertList(next, "shapes", before.shapes, after.shapes, kept);
  next = revertList(next, "connections", before.connections, after.connections, kept);
  return next;
}

function revertList<T, K extends "frames" | "shapes" | "connections">(
  now: Snapshot<T>,
  key: K,
  before: Snapshot<T>[K],
  after: Snapshot<T>[K],
  kept: string[],
): Snapshot<T> {
  if (before === after) return now;
  type Item = Snapshot<T>[K][number];
  const was = new Map<string, Item>(before.map((x: Item) => [x.id, x]));
  const became = new Map<string, Item>(after.map((x: Item) => [x.id, x]));
  let list: Item[] = [...now[key]];
  let changed = false;
  for (const id of new Set([...was.keys(), ...became.keys()])) {
    const a = was.get(id);
    const b = became.get(id);
    if (a === b) continue;
    const at = list.findIndex((x) => x.id === id);
    const current = at >= 0 ? list[at] : undefined;
    if (current !== b) {
      kept.push(id);
      continue;
    }
    changed = true;
    if (a && at >= 0) list[at] = a;
    else if (a) list = [...list, a];
    else list = list.filter((x) => x.id !== id);
  }
  return changed ? { ...now, [key]: list } : now;
}

/** The cached layout still names exactly the snapshot's tile ids and shelf
 * (and the parked records are the same records). */
function sameIds<T extends BoardTileBase>(c: BoardLayout<T>, now: Snapshot<T>): boolean {
  const parkedSet = now.parked.length ? new Set(now.parked) : null;
  let i = 0;
  for (const id of now.order) {
    if (!now.byId[id] || parkedSet?.has(id)) continue;
    if (c.tileIds[i++] !== id) return false;
  }
  if (i !== c.tileIds.length) return false;
  let j = 0;
  for (const id of now.parked) {
    if (!now.byId[id]) continue;
    if (c.parkedIds[j] !== id || c.parked[j] !== now.byId[id]) return false;
    j++;
  }
  return j === c.parkedIds.length;
}
