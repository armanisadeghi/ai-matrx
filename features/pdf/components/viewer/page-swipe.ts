/** Horizontal touch-swipe recognition shared by the one-page PDF renderer. */

export interface PageSwipeSample {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  startedAt: number;
  endedAt: number;
}

export type PageSwipeDirection = -1 | 0 | 1;

const MIN_DISTANCE_PX = 48;
const HORIZONTAL_DOMINANCE = 1.25;
const MAX_DURATION_MS = 800;

/**
 * Returns `1` for next, `-1` for previous, and `0` when the gesture should
 * remain native scrolling/panning. Finger-left advances; finger-right goes
 * back, matching presentation viewers.
 */
export function resolvePageSwipe({
  startX,
  startY,
  endX,
  endY,
  startedAt,
  endedAt,
}: PageSwipeSample): PageSwipeDirection {
  const deltaX = endX - startX;
  const deltaY = endY - startY;
  if (endedAt < startedAt || endedAt - startedAt > MAX_DURATION_MS) return 0;
  if (Math.abs(deltaX) < MIN_DISTANCE_PX) return 0;
  if (Math.abs(deltaX) < Math.abs(deltaY) * HORIZONTAL_DOMINANCE) return 0;
  return deltaX < 0 ? 1 : -1;
}
