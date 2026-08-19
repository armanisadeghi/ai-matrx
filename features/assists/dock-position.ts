/**
 * Dock position — the pure half of "drag the assists dock out of my way".
 *
 * Stored as an offset from the BOTTOM-RIGHT corner (not left/top) so the dock
 * keeps its relationship to the window tray and the composer band when the
 * window is resized, and so the default (no stored position) is expressible as
 * `null` rather than a magic pair of numbers.
 *
 * Clamping happens on every render, never only on drop: a position saved on a
 * 4K monitor must not park the dock off-screen on a laptop. Persisted per user
 * in `preferences.assists.dockPosition`.
 */

export interface DockOffset {
  /** px from the right edge of the viewport. */
  right: number;
  /** px from the bottom edge of the viewport. */
  bottom: number;
}

export interface Viewport {
  width: number;
  height: number;
}

/** The dock's own footprint — how much must stay on screen to grab it. */
export const DOCK_MIN_VISIBLE = { width: 120, height: 32 } as const;

/** Default resting place on a desktop viewport — just above the window tray. */
export const DEFAULT_DOCK_OFFSET: DockOffset = { right: 12, bottom: 56 };

/**
 * Mobile parks the dock ABOVE the bottom band where composers and action bars
 * live: at the desktop offset the launcher covered a composer's input
 * (2026-08-16). Drag is desktop-only, so this default is the whole mobile
 * story and has to be right on its own.
 */
export const DEFAULT_DOCK_OFFSET_MOBILE: DockOffset = { right: 12, bottom: 128 };

/** Tailwind's `sm` breakpoint — the same line the old responsive class used. */
const MOBILE_MAX_WIDTH = 640;

export function defaultDockOffset(viewport: Viewport): DockOffset {
  return viewport.width < MOBILE_MAX_WIDTH
    ? DEFAULT_DOCK_OFFSET_MOBILE
    : DEFAULT_DOCK_OFFSET;
}

/**
 * Keep an offset inside the viewport with the whole grab area reachable.
 * Negative offsets (dragged past an edge) and offsets larger than the viewport
 * both collapse to the nearest legal edge — a dock you cannot reach is the
 * same defect as a dock you cannot move.
 */
export function clampDockOffset(
  offset: DockOffset,
  viewport: Viewport,
): DockOffset {
  const maxRight = Math.max(0, viewport.width - DOCK_MIN_VISIBLE.width);
  const maxBottom = Math.max(0, viewport.height - DOCK_MIN_VISIBLE.height);
  return {
    right: Math.min(Math.max(0, Math.round(offset.right)), maxRight),
    bottom: Math.min(Math.max(0, Math.round(offset.bottom)), maxBottom),
  };
}

/**
 * Translate a pointer delta into a new offset. The pointer moves right/down in
 * positive screen coordinates while the offsets grow left/up, hence the
 * subtraction — getting this sign wrong makes the dock run away from the
 * cursor, which reads as "broken" rather than "inverted".
 */
export function offsetFromDrag(
  start: DockOffset,
  deltaX: number,
  deltaY: number,
  viewport: Viewport,
): DockOffset {
  return clampDockOffset(
    { right: start.right - deltaX, bottom: start.bottom - deltaY },
    viewport,
  );
}

/** A pointer that moved less than this is a click, not a drag. */
export const DRAG_THRESHOLD_PX = 4;

export function isDrag(deltaX: number, deltaY: number): boolean {
  return Math.abs(deltaX) >= DRAG_THRESHOLD_PX || Math.abs(deltaY) >= DRAG_THRESHOLD_PX;
}
