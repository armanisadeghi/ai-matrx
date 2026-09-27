"use client";

/**
 * useBoard — the tile collection of one board, and every way it changes.
 *
 * This is the board's MODEL: which tiles exist, where they sit, which are
 * parked on the shelf, and the undo that every removal offers. The host
 * renders `tiles` and `parked`; gestures, the context menu and agents all
 * change the board through these same functions, so there is one path.
 * Persistence (a saved board) serialises exactly this state.
 */

import { useState } from "react";
import type { Rect } from "../engine/camera";
import { findFreeSpot } from "../engine/placement";

export interface BoardTileBase {
  id: string;
  rect: Rect;
}

export interface Board<T extends BoardTileBase> {
  /** Tiles on the board, positions applied. */
  tiles: T[];
  /** Tiles on the shelf, in the order they were parked. */
  parked: T[];
  moveTile: (id: string, x: number, y: number) => void;
  /** Add a tile. Without an explicit position it lands in the nearest free
   * space to `near` (usually the viewport centre). Returns its final rect. */
  addTile: (tile: T, near?: { x: number; y: number }) => Rect;
  /** Add many tiles at their own rects (a batch, e.g. a workflow's slots). */
  addTiles: (tiles: T[]) => void;
  /** Drop many tiles with no undo (the batch that added them is being undone). */
  dropTiles: (ids: string[]) => void;
  /** Remove a tile; returns the function that puts it back. */
  removeTile: (id: string) => () => void;
  /** Park a tile on the shelf; returns the undo. */
  parkTile: (id: string) => () => void;
  /** Bring a parked tile back where it was. */
  unparkTile: (id: string) => void;
}

interface BoardState<T> {
  order: string[];
  byId: Record<string, T>;
  positions: Record<string, { x: number; y: number }>;
  parked: string[];
}

export function useBoard<T extends BoardTileBase>(initial: () => T[]): Board<T> {
  const [state, setState] = useState<BoardState<T>>(() => {
    const tiles = initial();
    return {
      order: tiles.map((t) => t.id),
      byId: Object.fromEntries(tiles.map((t) => [t.id, t])),
      positions: {},
      parked: [],
    };
  });

  const withPosition = (t: T): T => {
    const p = state.positions[t.id];
    return p ? { ...t, rect: { ...t.rect, x: p.x, y: p.y } } : t;
  };
  const parkedSet = new Set(state.parked);
  const tiles = state.order
    .filter((id) => !parkedSet.has(id) && state.byId[id])
    .map((id) => withPosition(state.byId[id]));
  const parked = state.parked.filter((id) => state.byId[id]).map((id) => withPosition(state.byId[id]));

  const moveTile = (id: string, x: number, y: number) =>
    setState((s) => ({ ...s, positions: { ...s.positions, [id]: { x, y } } }));

  const addTile = (tile: T, near?: { x: number; y: number }): Rect => {
    const rect = near
      ? findFreeSpot(
          tiles.map((t) => t.rect),
          { w: tile.rect.w, h: tile.rect.h },
          near,
        )
      : tile.rect;
    const placed = { ...tile, rect };
    setState((s) => ({
      ...s,
      order: s.order.includes(tile.id) ? s.order : [...s.order, tile.id],
      byId: { ...s.byId, [tile.id]: placed },
    }));
    return rect;
  };

  const addTiles = (batch: T[]) =>
    setState((s) => ({
      ...s,
      order: [...s.order, ...batch.map((t) => t.id).filter((id) => !s.byId[id])],
      byId: { ...s.byId, ...Object.fromEntries(batch.map((t) => [t.id, t])) },
    }));

  const dropTiles = (ids: string[]) => {
    const drop = new Set(ids);
    setState((s) => ({
      ...s,
      order: s.order.filter((id) => !drop.has(id)),
      byId: Object.fromEntries(Object.entries(s.byId).filter(([id]) => !drop.has(id))),
      parked: s.parked.filter((id) => !drop.has(id)),
    }));
  };

  const removeTile = (id: string) => {
    const snapshot = state;
    setState((s) => {
      const byId = { ...s.byId };
      delete byId[id];
      return {
        ...s,
        order: s.order.filter((x) => x !== id),
        byId,
        parked: s.parked.filter((x) => x !== id),
      };
    });
    return () =>
      setState((s) => ({
        ...s,
        order: s.order.includes(id) ? s.order : insertAt(s.order, id, snapshot.order.indexOf(id)),
        byId: { ...s.byId, [id]: snapshot.byId[id] },
        parked: snapshot.parked.includes(id) && !s.parked.includes(id) ? [...s.parked, id] : s.parked,
      }));
  };

  const parkTile = (id: string) => {
    setState((s) => (s.parked.includes(id) ? s : { ...s, parked: [...s.parked, id] }));
    return () => unparkTile(id);
  };

  const unparkTile = (id: string) =>
    setState((s) => ({ ...s, parked: s.parked.filter((x) => x !== id) }));

  return { tiles, parked, moveTile, addTile, addTiles, dropTiles, removeTile, parkTile, unparkTile };
}

function insertAt(list: string[], id: string, index: number): string[] {
  if (index < 0 || index >= list.length) return [...list, id];
  return [...list.slice(0, index), id, ...list.slice(index)];
}
