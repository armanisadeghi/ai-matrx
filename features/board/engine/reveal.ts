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

/** A focus change this soon after a key press came from the keyboard (Tab, find-next, typing). */
export const KEY_FOCUS_WINDOW_MS = 1000;

/**
 * Whether a focus change may move the camera: only inside a tile, only when
 * the KEYBOARD moved it (a key pressed just before), never while a pointer is
 * down (a drag, a pan, a pinch), and never for the focus a click just gave —
 * a clicked element is on screen already. An editor focusing itself as it
 * loads is no one's keyboard: it used to fly the camera away from where a
 * board was opened, seconds after it opened.
 */
export function shouldReveal(at: {
  inTile: boolean;
  pointersDown: number;
  msSincePress: number;
  msSinceKey: number;
}): boolean {
  return (
    at.inTile &&
    at.pointersDown === 0 &&
    at.msSincePress >= PRESS_FOCUS_WINDOW_MS &&
    at.msSinceKey <= KEY_FOCUS_WINDOW_MS
  );
}

/**
 * The part of `el` its clipping boxes (the content's own scroll boxes, up to
 * the tile) let anyone see. A focused element hidden inside the content's own
 * clip — a cell past a grid's scroll edge — is not the camera's to reveal:
 * the result collapses to the clip's nearest 1px edge, so the board brings
 * at most that edge on screen and the content scrolls itself.
 */
export function clipToVisible(el: ScreenRect, clips: ScreenRect[]): ScreenRect {
  let { left, top, right, bottom } = el;
  for (const c of clips) {
    left = Math.max(left, c.left);
    top = Math.max(top, c.top);
    right = Math.min(right, c.right);
    bottom = Math.min(bottom, c.bottom);
    if (left >= right) {
      const edge = el.left >= c.right ? c.right : c.left + 1;
      left = edge - 1;
      right = edge;
    }
    if (top >= bottom) {
      const edge = el.top >= c.bottom ? c.bottom : c.top + 1;
      top = edge - 1;
      bottom = edge;
    }
  }
  return { left, top, right, bottom };
}
