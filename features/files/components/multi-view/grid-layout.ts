/**
 * features/files/components/multi-view/grid-layout.ts
 *
 * Pure layout math for the multi-file grid viewer. Given a count of items
 * and the viewport aspect ratio, pick a `cols × rows` arrangement that
 * yields tiles whose aspect ratio is close to the target (default ~1.4,
 * which fits typical photography / generated images well) and minimises
 * empty trailing cells.
 *
 * The viewer hands each computed pick to a CSS grid: `gridTemplateColumns:
 * repeat(cols, minmax(0, 1fr))`. The component handles resize.
 */

export interface GridPick {
  cols: number;
  rows: number;
  /** Aspect ratio (w/h) of each tile under this pick. */
  tileAspect: number;
  /** Empty cells in the last row (cols*rows - n). */
  emptyCells: number;
}

interface PickOptions {
  /** Preferred tile aspect ratio (w/h). Photos ≈ 1.4–1.5, square ≈ 1. */
  targetTileAspect?: number;
  /** Penalty per empty trailing cell. Higher = avoid empties more. */
  emptyCellPenalty?: number;
}

/**
 * Pick the best `cols` for `n` items inside a viewport of aspect ratio
 * `viewportAspect` (= viewportWidth / viewportHeight). Scores every
 * candidate `cols ∈ [1, n]` and picks the lowest-score one.
 *
 *   tileAspect = (viewport.w / cols) / (viewport.h / rows)
 *              = viewportAspect · rows / cols
 *
 * Score combines log-distance from the target aspect and a small penalty
 * per empty trailing cell. Log distance keeps "twice as tall" and "twice
 * as wide" symmetric.
 */
export function pickGridLayout(
  n: number,
  viewportAspect: number,
  options: PickOptions = {},
): GridPick {
  if (n <= 0) {
    return { cols: 1, rows: 1, tileAspect: viewportAspect, emptyCells: 1 };
  }

  const { targetTileAspect = 1.4, emptyCellPenalty = 0.05 } = options;

  let best: GridPick = {
    cols: 1,
    rows: n,
    tileAspect: (viewportAspect * n) / 1,
    emptyCells: 0,
  };
  let bestScore = Infinity;

  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    const tileAspect = (viewportAspect * rows) / cols;
    const aspectScore = Math.abs(Math.log(tileAspect / targetTileAspect));
    const emptyCells = cols * rows - n;
    const score = aspectScore + emptyCells * emptyCellPenalty;

    if (score < bestScore) {
      bestScore = score;
      best = { cols, rows, tileAspect, emptyCells };
    }
  }

  return best;
}
