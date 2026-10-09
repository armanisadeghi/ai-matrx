/**
 * Putting words on the canvas — the ONE creator every way in calls: the
 * toolbar's Sticky note (S) and Text (T) tools, a double-click on empty board,
 * and the Add menu's Canvas section (`createStickyOnBoard` /
 * `createTextOnBoard`, no position = the centre of the view).
 *
 * Each makes the object (one undo step), selects it and starts typing in it —
 * a sticky's Note is created only by its first typed character
 * (`board/sticky-notes.ts`).
 */

import type { BoardStore, BoardTileBase } from "../board/board-store";
import type { BoardCameraStore } from "../engine/camera-store";
import { screenToWorld } from "../engine/camera";
import { makeSticky, makeText } from "../engine/canvas-text";
import type { ShapeStyle } from "../engine/shapes";

type At = { x: number; y: number };

function viewCentre(store: BoardCameraStore): At {
  const size = store.getSize();
  return screenToWorld(store.getCamera(), size.w / 2, size.h / 2);
}

function startTyping(store: BoardCameraStore, id: string) {
  // After the layer has drawn it (the editor mounts over the drawn object).
  requestAnimationFrame(() => {
    store.select(id);
    store.setEditing(id);
  });
}

/** A new sticky note at `at` (world px; default: the middle of the view), ready to type in. Returns its id. */
export function createStickyOnBoard<T extends BoardTileBase>(
  board: BoardStore<T>,
  store: BoardCameraStore,
  at?: At,
  style?: Partial<ShapeStyle>,
): string {
  const sticky = makeSticky(at ?? viewCentre(store), { style });
  board.addShape(sticky);
  startTyping(store, sticky.id);
  return sticky.id;
}

/** New plain text at `at` (world px; default: the middle of the view), ready to type in. Returns its id. */
export function createTextOnBoard<T extends BoardTileBase>(board: BoardStore<T>, store: BoardCameraStore, at?: At): string {
  const text = makeText(at ?? viewCentre(store));
  board.addShape(text);
  startTyping(store, text.id);
  return text.id;
}
