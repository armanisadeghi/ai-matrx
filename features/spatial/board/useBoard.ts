"use client";

/**
 * useBoard — everything on one board, every way it changes, and undo.
 *
 * The board's MODEL: tiles (live results, notes, text), frames (named
 * regions), shapes (drawn marks), where each sits, which tiles are parked, and
 * a history. Gestures, the tool bar, the context menu and agents all change the
 * board through these functions, so there is ONE path — and one undo stack
 * (⌘Z / ⇧⌘Z). Persistence serialises exactly this state.
 *
 * History: every change is one step, except moves, which coalesce — a drag of
 * one item is one step however many frames it took (Figma, FigJam).
 */

import { useState } from "react";
import type { Rect } from "../engine/camera";
import { findFreeSpot } from "../engine/placement";

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

export type ShapeKind = "rect" | "oval" | "arrow" | "line" | "pen";

export interface BoardShape {
  id: string;
  kind: ShapeKind;
  /** World-space points: two for rect/oval/arrow/line (corners or ends), many for pen. */
  points: { x: number; y: number }[];
}

interface Snapshot<T> {
  order: string[];
  byId: Record<string, T>;
  parked: string[];
  frames: BoardFrame[];
  shapes: BoardShape[];
}

interface BoardState<T> {
  now: Snapshot<T>;
  past: Snapshot<T>[];
  future: Snapshot<T>[];
  /** The item whose move is being coalesced, and when it last moved. */
  moving: { id: string; at: number } | null;
}

const HISTORY_LIMIT = 100;
const MOVE_COALESCE_MS = 600;

export interface Board<T extends BoardTileBase> {
  tiles: T[];
  parked: T[];
  frames: BoardFrame[];
  shapes: BoardShape[];
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
  moveTile: (id: string, x: number, y: number) => void;
  /** Add a tile. With `near`, it lands in the nearest free space to that world point. */
  addTile: (tile: T, near?: { x: number; y: number }) => Rect;
  addTiles: (tiles: T[]) => void;
  /** Change a tile's own fields. One undoable step, unless `history: false`
   * (typing, or a note gaining its record id — undoing those would lose work
   * or duplicate a record). */
  updateTile: (id: string, patch: Partial<T>, opts?: { history?: boolean }) => void;
  /** Drop tiles with no undo (the batch that added them is being taken back). */
  dropTiles: (ids: string[]) => void;
  /** Remove a tile; returns a function that puts it back. */
  removeTile: (id: string) => () => void;
  parkTile: (id: string) => () => void;
  unparkTile: (id: string) => void;
  addFrame: (frame: BoardFrame) => void;
  updateFrame: (id: string, patch: Partial<BoardFrame>) => void;
  removeFrame: (id: string) => void;
  addShape: (shape: BoardShape) => void;
  removeShape: (id: string) => void;
}

export function useBoard<T extends BoardTileBase>(
  /** The starting tiles, or tiles plus frames. */
  initial: () => T[] | { tiles: T[]; frames?: BoardFrame[] },
): Board<T> {
  const [state, setState] = useState<BoardState<T>>(() => {
    const start = initial();
    const { tiles, frames = [] } = Array.isArray(start) ? { tiles: start } : start;
    return {
      now: {
        order: tiles.map((t) => t.id),
        byId: Object.fromEntries(tiles.map((t) => [t.id, t])),
        parked: [],
        frames,
        shapes: [],
      },
      past: [],
      future: [],
      moving: null,
    };
  });

  /** Apply one undoable change. */
  const change = (fn: (s: Snapshot<T>) => Snapshot<T>) =>
    setState((st) => {
      const next = fn(st.now);
      if (next === st.now) return st;
      return { now: next, past: [...st.past, st.now].slice(-HISTORY_LIMIT), future: [], moving: null };
    });

  const { now } = state;
  const parkedSet = new Set(now.parked);
  const tiles = now.order.filter((id) => !parkedSet.has(id) && now.byId[id]).map((id) => now.byId[id]);
  const parked = now.parked.filter((id) => now.byId[id]).map((id) => now.byId[id]);

  const moveTile = (id: string, x: number, y: number) =>
    setState((st) => {
      const tile = st.now.byId[id];
      const frame = st.now.frames.find((f) => f.id === id);
      if (!tile && !frame) return st;
      const t = performance.now();
      const coalesce = st.moving?.id === id && t - st.moving.at < MOVE_COALESCE_MS;
      const next: Snapshot<T> = tile
        ? { ...st.now, byId: { ...st.now.byId, [id]: { ...tile, rect: { ...tile.rect, x, y } } } }
        : {
            ...st.now,
            frames: st.now.frames.map((f) => (f.id === id ? { ...f, rect: { ...f.rect, x, y } } : f)),
          };
      return {
        now: next,
        past: coalesce ? st.past : [...st.past, st.now].slice(-HISTORY_LIMIT),
        future: coalesce ? st.future : [],
        moving: { id, at: t },
      };
    });

  const addTile = (tile: T, near?: { x: number; y: number }): Rect => {
    const rect = near ? findFreeSpot(tiles.map((t) => t.rect), { w: tile.rect.w, h: tile.rect.h }, near) : tile.rect;
    const placed = { ...tile, rect };
    change((s) => ({
      ...s,
      order: s.order.includes(tile.id) ? s.order : [...s.order, tile.id],
      byId: { ...s.byId, [tile.id]: placed },
    }));
    return rect;
  };

  const addTiles = (batch: T[]) =>
    change((s) => ({
      ...s,
      order: [...s.order, ...batch.map((t) => t.id).filter((id) => !s.byId[id])],
      byId: { ...s.byId, ...Object.fromEntries(batch.map((t) => [t.id, t])) },
    }));

  const updateTile = (id: string, patch: Partial<T>, opts: { history?: boolean } = {}) => {
    const apply = (s: Snapshot<T>): Snapshot<T> =>
      s.byId[id] ? { ...s, byId: { ...s.byId, [id]: { ...s.byId[id], ...patch } } } : s;
    if (opts.history === false) {
      // Also patch history, so undo never resurrects the old value.
      setState((st) => ({ ...st, now: apply(st.now), past: st.past.map(apply), future: st.future.map(apply) }));
    } else change(apply);
  };

  const dropTiles = (ids: string[]) => {
    const drop = new Set(ids);
    setState((st) => ({
      ...st,
      now: {
        ...st.now,
        order: st.now.order.filter((id) => !drop.has(id)),
        byId: Object.fromEntries(Object.entries(st.now.byId).filter(([id]) => !drop.has(id))),
        parked: st.now.parked.filter((id) => !drop.has(id)),
      },
    }));
  };

  const removeTile = (id: string) => {
    const removed = now.byId[id];
    const index = now.order.indexOf(id);
    const wasParked = now.parked.includes(id);
    change((s) => {
      if (!s.byId[id]) return s;
      const byId = { ...s.byId };
      delete byId[id];
      return { ...s, order: s.order.filter((x) => x !== id), byId, parked: s.parked.filter((x) => x !== id) };
    });
    return () =>
      change((s) =>
        s.byId[id] || !removed
          ? s
          : {
              ...s,
              order: insertAt(s.order, id, index),
              byId: { ...s.byId, [id]: removed },
              parked: wasParked ? [...s.parked, id] : s.parked,
            },
      );
  };

  const parkTile = (id: string) => {
    change((s) => (s.parked.includes(id) ? s : { ...s, parked: [...s.parked, id] }));
    return () => unparkTile(id);
  };

  const unparkTile = (id: string) =>
    change((s) => (s.parked.includes(id) ? { ...s, parked: s.parked.filter((x) => x !== id) } : s));

  const addFrame = (frame: BoardFrame) => change((s) => ({ ...s, frames: [...s.frames, frame] }));
  const updateFrame = (id: string, patch: Partial<BoardFrame>) =>
    change((s) => ({ ...s, frames: s.frames.map((f) => (f.id === id ? { ...f, ...patch } : f)) }));
  const removeFrame = (id: string) => change((s) => ({ ...s, frames: s.frames.filter((f) => f.id !== id) }));
  const addShape = (shape: BoardShape) => change((s) => ({ ...s, shapes: [...s.shapes, shape] }));
  const removeShape = (id: string) => change((s) => ({ ...s, shapes: s.shapes.filter((x) => x.id !== id) }));

  const undo = () =>
    setState((st) =>
      st.past.length === 0
        ? st
        : { now: st.past[st.past.length - 1], past: st.past.slice(0, -1), future: [st.now, ...st.future], moving: null },
    );
  const redo = () =>
    setState((st) =>
      st.future.length === 0
        ? st
        : { now: st.future[0], past: [...st.past, st.now], future: st.future.slice(1), moving: null },
    );

  return {
    tiles,
    parked,
    frames: now.frames,
    shapes: now.shapes,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    undo,
    redo,
    moveTile,
    addTile,
    addTiles,
    updateTile,
    dropTiles,
    removeTile,
    parkTile,
    unparkTile,
    addFrame,
    updateFrame,
    removeFrame,
    addShape,
    removeShape,
  };
}

function insertAt(list: string[], id: string, index: number): string[] {
  if (index < 0 || index >= list.length) return [...list, id];
  return [...list.slice(0, index), id, ...list.slice(index)];
}
