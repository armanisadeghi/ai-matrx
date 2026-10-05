/**
 * One drag or resize's snapping — the bridge between the pure maths
 * (`snapping.ts`) and the board store. Started on pointer-down, ended on every
 * way a gesture ends (`startPointerGesture`'s `onEnd`).
 *
 * The candidates are collected ONCE per gesture: the tiles inside the viewport
 * plus half a viewport of margin (a bounded scan, never the whole board), so a
 * pointer move costs a few comparisons whatever the board's size. Frames are
 * snap targets too, by their own rect (the registered one carries the title
 * band, which is taken off). A group move excludes everything it carries.
 */

import type { Rect } from "./camera";
import type { BoardCameraStore } from "./camera-store";
import { isSnapBypass, snapMove, snapResize } from "./snapping";
import type { ResizeHandle } from "./tile-gestures";
import { frameBody, isFrameKey } from "./selection";

type Mods = { metaKey?: boolean; ctrlKey?: boolean; altKey?: boolean; shiftKey?: boolean };

/** Tiles and frames near the viewport, except what is moving (`self`: one id, or the set a group move carries). */
export function nearbyRects(store: BoardCameraStore, self: string | ReadonlySet<string>): Rect[] {
  const moving = typeof self === "string" ? new Set([self]) : self;
  const { x, y, z } = store.getCamera();
  const { w, h } = store.getSize();
  const left = -x / z - w / z / 2;
  const top = -y / z - h / z / 2;
  const right = (w - x) / z + w / z / 2;
  const bottom = (h - y) / z + h / z / 2;
  const out: Rect[] = [];
  for (const [key, registered] of store.getItems()) {
    const frame = isFrameKey(key);
    if (moving.has(frame ? key.slice("frame:".length) : key)) continue;
    const r = frame ? frameBody(registered) : registered;
    if (r.x > right || r.x + r.w < left || r.y > bottom || r.y + r.h < top) continue;
    out.push(r);
  }
  return out;
}

export interface SnapSession {
  /** The rect a move should take, given where the pointer put it. */
  move(raw: Rect, mods: Mods): Rect;
  /** The rect a resize should take, given `resizeRect`'s answer. */
  resize(raw: Rect, handle: ResizeHandle, mods: Mods, min?: { w: number; h: number }): Rect;
  /** Clear the guides. Safe to call twice. */
  end(): void;
}

export function beginSnap(store: BoardCameraStore, self: string | ReadonlySet<string>): SnapSession {
  const others = nearbyRects(store, self);
  const options = (mods: Mods) => {
    const { smartGuides, grid } = store.getSnapSettings();
    return { z: store.getCamera().z, smartGuides, grid, bypass: isSnapBypass(mods) };
  };
  return {
    move(raw, mods) {
      const { rect, overlay } = snapMove(raw, others, options(mods));
      store.setSnapOverlay(overlay);
      return rect;
    },
    resize(raw, handle, mods, min) {
      const { rect, overlay } = snapResize(raw, handle, others, { ...options(mods), min, keepAspect: !!mods.shiftKey });
      store.setSnapOverlay(overlay);
      return rect;
    },
    end() {
      store.setSnapOverlay(null);
    },
  };
}
