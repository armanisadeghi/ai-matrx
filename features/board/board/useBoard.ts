"use client";

/**
 * useBoard — React bindings for the board model (`board-store.ts`).
 *
 * The model lives OUTSIDE React in a `BoardStore`; a component reads only the
 * part it renders, so a drag or resize at pointer rate wakes the one tile that
 * moved — never the whole board:
 *
 *   useBoardStore(initial)   the board, created once; a stable object whose
 *                            methods never change identity
 *   useBoardLayout(board)    which tiles exist, the shelf, frames, shapes,
 *                            connections, undo-ability — what a host renders
 *   useBoardTile(board, id)  one tile's record — what a tile renders
 *   useBoardView(board)      everything, re-rendering on every change (a
 *                            layers list, a small board)
 *
 * `useBoard` is the all-in-one form: the store's operations plus the full view,
 * re-rendering its host on every change. Fine for a board of a few light
 * tiles; a board of many or heavy tiles uses the narrow hooks (see UserBoard).
 */

import { useState, useSyncExternalStore } from "react";
import type { Rect } from "../engine/camera";
import type { PlacementFlow } from "../engine/placement";
import {
  BoardStore,
  type BoardConnection,
  type BoardFrame,
  type BoardLayout,
  type BoardSeed,
  type BoardShape,
  type BoardTileBase,
  type BoardView,
  type ActorUndoResult,
  type BoardActor,
} from "./board-store";

export { BoardStore } from "./board-store";
export type {
  ActorUndoResult,
  BoardActor,
  BoardConnection,
  BoardFrame,
  BoardLayout,
  BoardSeed,
  BoardShape,
  BoardTileBase,
  BoardView,
  ShapeKind,
} from "./board-store";

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
  /** Set a tile's whole rect (a resize handle drag). Coalesces like a move:
   * one gesture is one undoable step. */
  resizeTile: (id: string, rect: Rect) => void;
  /** Move many tiles (and/or frames) as ONE undoable step — an arrangement;
   * `addFrames` draws frames in the same step. */
  moveMany: (moves: { id: string; x: number; y: number }[], opts?: { addFrames?: BoardFrame[] }) => void;
  /** One step of a group gesture (a multi-selection drag, a frame and its tiles, a nudge);
   * successive steps on the same items are ONE undo step. */
  dragMany: (moves: { id: string; x: number; y: number }[]) => void;
  connections: BoardConnection[];
  connect: (connection: BoardConnection) => void;
  disconnect: (id: string) => void;
  /** Add a tile. With `near`, it lands in the nearest free space to that world
   * point, clear of tiles AND frames (a group is not free space) — except the
   * frame named by `within`, where it may land among that group's tiles. */
  addTile: (tile: T, near?: { x: number; y: number }, opts?: { within?: string; flow?: PlacementFlow }) => Rect;
  addTiles: (tiles: T[]) => void;
  /** Change a tile's own fields. One undoable step, unless `history: false`
   * (typing, or a note gaining its record id — undoing those would lose work
   * or duplicate a record). */
  updateTile: (id: string, patch: Partial<T>, opts?: { history?: boolean }) => void;
  /** Drop tiles with no undo (the batch that added them is being taken back). */
  dropTiles: (ids: string[]) => void;
  /** Remove a tile; returns a function that puts it back. */
  removeTile: (id: string) => () => void;
  /** Remove tiles, frames and shapes together as ONE undoable step (a multi-selection's Delete). */
  removeMany: (ids: readonly string[]) => void;
  parkTile: (id: string) => () => void;
  unparkTile: (id: string) => void;
  addFrame: (frame: BoardFrame) => void;
  updateFrame: (id: string, patch: Partial<BoardFrame>) => void;
  removeFrame: (id: string) => void;
  addShape: (shape: BoardShape) => void;
  removeShape: (id: string) => void;
  /** The board as of the LAST change, even before React re-renders — what a
   * sequence of commands in one tick (an agent's tool calls) must read. */
  read: () => BoardView<T>;
  /** Run changes as an actor (an agent's tool call runs as "agent"). */
  runAs: <R>(actor: BoardActor, fn: () => R) => R;
  /** Run several changes as ONE undoable step (an agent's batch of adds). */
  batch: <R>(fn: () => R) => R;
  /** Take back only `actor`'s own latest change (never the person's). */
  undoActor: (actor: BoardActor) => ActorUndoResult;
  canUndoActor: (actor: BoardActor) => boolean;
  /** The model itself, for leaves that subscribe on their own channel (the shapes layer). */
  store: BoardStore<T>;
}

/** The board, created once from `initial`. Stable for the component's life. */
export function useBoardStore<T extends BoardTileBase>(initial: () => T[] | BoardSeed<T>): BoardStore<T> {
  const [store] = useState(() => new BoardStore<T>(initial()));
  return store;
}

/** The board's structure; re-renders only when tiles come, go or park, or
 * frames, shapes, connections or undo-ability change. */
export function useBoardLayout<T extends BoardTileBase>(board: BoardStore<T>): BoardLayout<T> {
  return useSyncExternalStore(board.subscribeLayout, board.getLayout, board.getLayout);
}

/** One tile's record; re-renders only when THAT tile changes. */
export function useBoardTile<T extends BoardTileBase>(board: BoardStore<T>, id: string): T | undefined {
  return useSyncExternalStore(
    (l) => board.subscribeTile(id, l),
    () => board.getTile(id),
    () => board.getTile(id),
  );
}

/** Everything; re-renders on every change. */
export function useBoardView<T extends BoardTileBase>(board: BoardStore<T>): BoardView<T> {
  return useSyncExternalStore(board.subscribe, board.read, board.read);
}

export function useBoard<T extends BoardTileBase>(
  /** The starting tiles, or a whole saved board (tiles, frames, the shelf,
   * shapes and connections). */
  initial: () => T[] | BoardSeed<T>,
): Board<T> {
  const store = useBoardStore(initial);
  const view = useBoardView(store);
  const layout = useBoardLayout(store);
  return {
    tiles: view.tiles,
    parked: view.parked,
    frames: view.frames,
    shapes: store.shapes,
    connections: view.connections,
    canUndo: layout.canUndo,
    canRedo: layout.canRedo,
    undo: store.undo,
    redo: store.redo,
    moveTile: store.moveTile,
    resizeTile: store.resizeTile,
    moveMany: store.moveMany,
    dragMany: store.dragMany,
    connect: store.connect,
    disconnect: store.disconnect,
    addTile: store.addTile,
    addTiles: store.addTiles,
    updateTile: store.updateTile,
    dropTiles: store.dropTiles,
    removeTile: store.removeTile,
    removeMany: store.removeMany,
    parkTile: store.parkTile,
    unparkTile: store.unparkTile,
    addFrame: store.addFrame,
    updateFrame: store.updateFrame,
    removeFrame: store.removeFrame,
    addShape: store.addShape,
    removeShape: store.removeShape,
    read: store.read,
    runAs: store.runAs,
    batch: store.batch,
    undoActor: store.undoActor,
    canUndoActor: store.canUndoActor,
    store,
  };
}
