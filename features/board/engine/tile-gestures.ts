/**
 * Board — what a gesture on a TILE means (pure).
 *
 * Every tile on every board gets these from the tile frame (`BoardTile`),
 * so no item type writes its own resize or double-click code.
 *
 *   resize        — eight handles (four edges, four corners), a constant
 *                   screen-size hit area at any zoom, a minimum size, Shift
 *                   keeps the aspect ratio (Figma, tldraw, Miro).
 *   double-click  — on the header / chrome: fly to the tile and make it live
 *                   (the state `board_focus` "fly" produces). In the body of a
 *                   tile you are not yet working in: fly and start working in
 *                   it (tldraw: double-click enters a shape). Inside content
 *                   you are already working in, or on a control: native
 *                   (word selection, cell edit) — the board stays out of it.
 */

import type { Rect } from "./camera";

export type ResizeHandle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

export const RESIZE_HANDLES: readonly ResizeHandle[] = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];

/** Smallest a tile may be resized to, world px — a header plus a line of body. */
export const MIN_TILE_SIZE = { w: 160, h: 96 } as const;

/** Hit area of a resize handle, SCREEN px (constant at any zoom). */
export const RESIZE_HANDLE_SCREEN_PX = 12;

/** The handle's size in WORLD px at zoom `z`, so it is always the same on screen. */
export function resizeHandleWorldPx(z: number): number {
  return RESIZE_HANDLE_SCREEN_PX / z;
}

export const RESIZE_CURSOR: Record<ResizeHandle, string> = {
  n: "ns-resize",
  s: "ns-resize",
  e: "ew-resize",
  w: "ew-resize",
  ne: "nesw-resize",
  sw: "nesw-resize",
  nw: "nwse-resize",
  se: "nwse-resize",
};

/**
 * The tile's rect after dragging `handle` by (dx, dy) SCREEN px at zoom `z`.
 * Dragging a left or top handle moves the origin so the opposite edge stays
 * put; the minimum size pins at that opposite edge too.
 */
export function resizeRect(
  start: Rect,
  handle: ResizeHandle,
  dx: number,
  dy: number,
  opts: { z: number; keepAspect?: boolean; min?: { w: number; h: number } },
): Rect {
  const min = opts.min ?? MIN_TILE_SIZE;
  const wx = dx / opts.z;
  const wy = dy / opts.z;
  const west = handle.includes("w");
  const east = handle.includes("e");
  const north = handle.includes("n");
  const south = handle.includes("s");

  let w = start.w + (east ? wx : west ? -wx : 0);
  let h = start.h + (south ? wy : north ? -wy : 0);

  if (opts.keepAspect && start.h > 0) {
    const ratio = start.w / start.h;
    const horizontal = east || west;
    const vertical = north || south;
    if (horizontal && vertical) {
      // A corner: the axis that moved most (relative to its size) leads.
      if (Math.abs(w / start.w - 1) >= Math.abs(h / start.h - 1)) h = w / ratio;
      else w = h * ratio;
    } else if (horizontal) h = w / ratio;
    else w = h * ratio;
    if (w < min.w) {
      w = min.w;
      h = w / ratio;
    }
    if (h < min.h) {
      h = min.h;
      w = h * ratio;
    }
  } else {
    w = Math.max(min.w, w);
    h = Math.max(min.h, h);
  }

  let x = west ? start.x + start.w - w : start.x;
  let y = north ? start.y + start.h - h : start.y;
  // An edge drag with Shift scales the other axis about its centre.
  if (opts.keepAspect && !(north || south)) y = start.y + (start.h - h) / 2;
  if (opts.keepAspect && !(east || west)) x = start.x + (start.w - w) / 2;
  return { x, y, w, h };
}

export type DoubleClickAction = "fly" | "fly-and-interact" | "native";

/** What a double-click on a tile does (see the header comment). */
export function doubleClickAction(at: {
  /** The tile fills the screen (focus mode). */
  focused: boolean;
  /** The press landed on the tile's header / chrome. */
  inHeader: boolean;
  /** The press landed on a control (button, field, link, editor…). */
  onControl: boolean;
  /** The tile is the one being worked in (its content has native input). */
  interacting: boolean;
}): DoubleClickAction {
  if (at.focused || at.onControl) return "native";
  if (at.inHeader) return "fly";
  return at.interacting ? "native" : "fly-and-interact";
}

export type PressAction = "control" | "native" | "select-native" | "move";

/**
 * What a primary press on a tile does — the pointer twin of `routeWheel`.
 *
 *   control        — a button, field, link… gets its own press.
 *   native         — inside the body of the tile being worked in.
 *   select-native  — a FINGER on a tile's body: the tile is selected but the
 *                    touch stays native, so the content scrolls (and a body
 *                    that cannot scroll simply doesn't). A finger never drags
 *                    a tile by its body, and never pans the board over a tile.
 *   move           — select and drag the tile (mouse / pen on the body of a
 *                    tile you are not working in; the header, always).
 * Empty space is the viewport's: a finger there pans the board.
 */
export function pressAction(at: {
  pointerType: string;
  inHeader: boolean;
  onControl: boolean;
  interacting: boolean;
}): PressAction {
  if (at.onControl) return "control";
  if (at.inHeader) return "move";
  if (at.interacting) return "native";
  return at.pointerType === "touch" ? "select-native" : "move";
}
