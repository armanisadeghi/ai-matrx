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
import { boundsOfPoints, type BoardShape, type ShapeStyle } from "../engine/shapes";

type At = { x: number; y: number };

function viewCentre(store: BoardCameraStore): At {
  const size = store.getSize();
  return screenToWorld(store.getCamera(), size.w / 2, size.h / 2);
}

/** `shape` moved to the nearest free place to where it was made (centre-based, so it keeps its size). */
function settled<T extends BoardTileBase>(board: BoardStore<T>, shape: BoardShape): BoardShape {
  const box = boundsOfPoints(shape.points);
  const free = board.freeSpot(box, { x: box.x + box.w / 2, y: box.y + box.h / 2 });
  const dx = free.x - box.x;
  const dy = free.y - box.y;
  if (dx === 0 && dy === 0) return shape;
  return { ...shape, points: shape.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) };
}

function startTyping(store: BoardCameraStore, id: string) {
  // After the layer has drawn it (the editor mounts over the drawn object). A selection the person
  // changed in the meantime (a click on empty board) is theirs: it is not overridden.
  const before = store.getSelection();
  requestAnimationFrame(() => {
    if (store.getSelection() !== before) return;
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
  // No position (the toolbar, the Add menu): the nearest free place to the view's centre, never on
  // top of older content. A click or double-click names its own point and keeps it.
  const made = makeSticky(at ?? viewCentre(store), { style });
  const sticky = at ? made : settled(board, made);
  board.addShape(sticky);
  startTyping(store, sticky.id);
  return sticky.id;
}

/** New plain text at `at` (world px; default: the middle of the view), ready to type in. Returns its id. */
export function createTextOnBoard<T extends BoardTileBase>(board: BoardStore<T>, store: BoardCameraStore, at?: At): string {
  const made = makeText(at ?? viewCentre(store));
  const text = at ? made : settled(board, made);
  board.addShape(text);
  startTyping(store, text.id);
  return text.id;
}
