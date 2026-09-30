/**
 * Spatial view — keep what has focus on screen (pure).
 *
 * When focus moves to an element inside a tile that is outside the visible
 * board area (tabbing through grid cells, find-next, an editor caret), the
 * CAMERA pans by the smallest amount that brings it into view with a margin —
 * never a zoom (Figma, Excel). The board never scrolls natively
 * (native-scroll.ts); this is the camera doing what a scroll would have done.
 *
 * Rects are SCREEN px; the result is the pan to hand `panBy(camera, dx, dy)`.
 * An element larger than the view aligns its start edge (Excel).
 */

export interface ScreenRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

function axis(start: number, end: number, viewStart: number, viewEnd: number, margin: number): number {
  const lo = viewStart + margin;
  const hi = viewEnd - margin;
  if (end - start > hi - lo) return start === lo ? 0 : lo - start;
  if (start < lo) return lo - start;
  if (end > hi) return hi - end;
  return 0;
}

export function panToReveal(el: ScreenRect, view: ScreenRect, margin: number): { dx: number; dy: number } {
  return {
    dx: axis(el.left, el.right, view.left, view.right, margin),
    dy: axis(el.top, el.bottom, view.top, view.bottom, margin),
  };
}

/** A focus change that follows a press this recently came from that press. */
export const PRESS_FOCUS_WINDOW_MS = 400;

/**
 * Whether a focus change may move the camera: only inside a tile, never while
 * a pointer is down (a drag, a pan, a pinch), and never for the focus a
 * click just gave — a clicked element is on screen already.
 */
export function shouldReveal(at: { inTile: boolean; pointersDown: number; msSincePress: number }): boolean {
  return at.inTile && at.pointersDown === 0 && at.msSincePress >= PRESS_FOCUS_WINDOW_MS;
}
