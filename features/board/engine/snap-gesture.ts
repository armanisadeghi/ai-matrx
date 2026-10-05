/**
 * One drag or resize's snapping — the bridge between the pure maths
 * (`snapping.ts`) and the board store. Started on pointer-down, ended on every
 * way a gesture ends (`startPointerGesture`'s `onEnd`).
 *
 * The candidates are collected ONCE per gesture: the tiles inside the viewport
 * plus half a viewport of margin (a bounded scan, never the whole board), so a
 * pointer move costs a few comparisons whatever the board's size. Frames are
 * not snap targets (their registered rect carries the title band).
 */

import type { Rect } from "./camera";
import type { BoardCameraStore } from "./camera-store";
import { isSnapBypass, snapMove, snapResize } from "./snapping";
import type { ResizeHandle } from "./tile-gestures";

type Mods = { metaKey?: boolean; ctrlKey?: boolean; altKey?: boolean; shiftKey?: boolean };

/** Tiles near the viewport, except `selfId`. */
export function nearbyRects(store: BoardCameraStore, selfId: string): Rect[] {
  const { x, y, z } = store.getCamera();
  const { w, h } = store.getSize();
  const left = -x / z - w / z / 2;
  const top = -y / z - h / z / 2;
  const right = (w - x) / z + w / z / 2;
  const bottom = (h - y) / z + h / z / 2;
  const out: Rect[] = [];
  for (const [id, r] of store.getItems()) {
    if (id === selfId || id.startsWith("frame:")) continue;
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

export function beginSnap(store: BoardCameraStore, selfId: string): SnapSession {
  const others = nearbyRects(store, selfId);
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
