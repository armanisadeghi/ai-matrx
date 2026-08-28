/**
 * Calculates how far a floating surface must move upward to remain inside the
 * visual viewport (the part of the page left visible above a software
 * keyboard). `surfaceTop` / `surfaceBottom` may already include a previously
 * applied lift; `currentLift` reconstructs the surface's natural position so
 * repeated VisualViewport events converge instead of oscillating.
 */
export function calculateVisualViewportLift({
  surfaceTop,
  surfaceBottom,
  currentLift,
  viewportTop,
  viewportHeight,
  margin = 12,
}: {
  surfaceTop: number;
  surfaceBottom: number;
  currentLift: number;
  viewportTop: number;
  viewportHeight: number;
  margin?: number;
}): number {
  const naturalTop = surfaceTop + currentLift;
  const naturalBottom = surfaceBottom + currentLift;
  const visibleTop = viewportTop + margin;
  const visibleBottom = viewportTop + viewportHeight - margin;
  const requiredLift = Math.max(0, naturalBottom - visibleBottom);
  const availableLift = Math.max(0, naturalTop - visibleTop);

  return Math.min(requiredLift, availableLift);
}
