// lib/layout/galleryLayout.ts
//
// Generic gallery-grid layout engine — the "video-call gallery view" problem:
// place N tiles in a fixed viewport so per-tile area is maximized, beautiful at
// low counts (bento special-cases) and graceful at high counts (uniform grid,
// then scroll). Pure + framework-agnostic so it's unit-testable and reusable by
// any tiled workspace, not just War Room. The React binding lives in
// hooks/useGalleryLayout.ts.

export interface GalleryViewport {
  width: number;
  height: number;
}

export interface GalleryInput {
  count: number;
  viewport: GalleryViewport;
  /** px between tiles. Default 12. */
  gap?: number;
  /** Floor before the grid switches to scrolling. Default 300×220. */
  minTile?: { width: number; height: number };
  /** Preferred tile width/height ratio used when scoring fit. Default 4/3. */
  targetAspect?: number;
}

/** A CSS-grid placement (1-indexed grid lines), one per item. */
export interface GalleryPlacement {
  colStart: number;
  colSpan: number;
  rowStart: number;
  rowSpan: number;
  /** Larger "hero" cell in a bento layout. */
  featured?: boolean;
}

export interface GalleryLayout {
  cols: number;
  rows: number;
  /** CSS grid-template-columns value, e.g. "repeat(3, 1fr)" or "1.5fr 1fr". */
  colTemplate: string;
  /** CSS grid-template-rows value. Fixed px in scroll mode, else 1fr. */
  rowTemplate: string;
  /** True when tiles hit the minTile floor and the grid must scroll. */
  scroll: boolean;
  /** One placement per item, in input order. */
  placements: GalleryPlacement[];
}

const DEFAULT_GAP = 12;
const DEFAULT_MIN = { width: 300, height: 220 };
const DEFAULT_ASPECT = 4 / 3;

function uniformPlacements(count: number, cols: number): GalleryPlacement[] {
  const out: GalleryPlacement[] = [];
  for (let i = 0; i < count; i++) {
    out.push({
      colStart: (i % cols) + 1,
      colSpan: 1,
      rowStart: Math.floor(i / cols) + 1,
      rowSpan: 1,
    });
  }
  return out;
}

/**
 * Pick the column count that maximizes realized per-tile area (each cell
 * fitted to targetAspect). This is exactly how Zoom/Meet gallery view sizes
 * tiles — it naturally lands on 4×3 for 12, 3×3 for 9, etc., for a given
 * viewport aspect.
 */
function bestColumns(
  count: number,
  w: number,
  h: number,
  gap: number,
  targetAspect: number,
): { cols: number; rows: number } {
  let best = { cols: 1, rows: count, score: -1 };
  for (let cols = 1; cols <= count; cols++) {
    const rows = Math.ceil(count / cols);
    const cellW = (w - gap * (cols - 1)) / cols;
    const cellH = (h - gap * (rows - 1)) / rows;
    if (cellW <= 0 || cellH <= 0) continue;
    const fitW = Math.min(cellW, cellH * targetAspect);
    const fitH = Math.min(cellH, cellW / targetAspect);
    const area = fitW * fitH;
    const empties = rows * cols - count;
    // Maximize area; tiny penalty for empty cells so we prefer full grids.
    const score = area * (1 - empties * 0.03);
    if (score > best.score) best = { cols, rows, score };
  }
  return { cols: best.cols, rows: best.rows };
}

/**
 * Bento special-cases for 1–4 tiles: hand-tuned so a small number of tiles
 * looks intentional and well-spaced — never cramped to accommodate a future
 * twelfth tile. The first tile gets the hero cell at count 3.
 */
function bentoLayout(
  count: number,
  landscape: boolean,
): GalleryLayout | null {
  switch (count) {
    case 1:
      return {
        cols: 1,
        rows: 1,
        colTemplate: "1fr",
        rowTemplate: "1fr",
        scroll: false,
        placements: [{ colStart: 1, colSpan: 1, rowStart: 1, rowSpan: 1, featured: true }],
      };
    case 2:
      return landscape
        ? {
            cols: 2,
            rows: 1,
            colTemplate: "1fr 1fr",
            rowTemplate: "1fr",
            scroll: false,
            placements: [
              { colStart: 1, colSpan: 1, rowStart: 1, rowSpan: 1 },
              { colStart: 2, colSpan: 1, rowStart: 1, rowSpan: 1 },
            ],
          }
        : {
            cols: 1,
            rows: 2,
            colTemplate: "1fr",
            rowTemplate: "1fr 1fr",
            scroll: false,
            placements: [
              { colStart: 1, colSpan: 1, rowStart: 1, rowSpan: 1 },
              { colStart: 1, colSpan: 1, rowStart: 2, rowSpan: 1 },
            ],
          };
    case 3:
      // Hero left (spans both rows) + two stacked right — the "beautiful three".
      // On a portrait viewport, fall back to 3 stacked rows.
      return landscape
        ? {
            cols: 2,
            rows: 2,
            colTemplate: "1.5fr 1fr",
            rowTemplate: "1fr 1fr",
            scroll: false,
            placements: [
              { colStart: 1, colSpan: 1, rowStart: 1, rowSpan: 2, featured: true },
              { colStart: 2, colSpan: 1, rowStart: 1, rowSpan: 1 },
              { colStart: 2, colSpan: 1, rowStart: 2, rowSpan: 1 },
            ],
          }
        : {
            cols: 1,
            rows: 3,
            colTemplate: "1fr",
            rowTemplate: "1fr 1fr 1fr",
            scroll: false,
            placements: uniformPlacements(3, 1),
          };
    case 4:
      return {
        cols: 2,
        rows: 2,
        colTemplate: "1fr 1fr",
        rowTemplate: "1fr 1fr",
        scroll: false,
        placements: uniformPlacements(4, 2),
      };
    default:
      return null;
  }
}

/**
 * Compute the gallery layout for `count` tiles in `viewport`. Deterministic and
 * pure — same inputs always yield the same layout.
 */
export function computeGalleryLayout(input: GalleryInput): GalleryLayout {
  const gap = input.gap ?? DEFAULT_GAP;
  const minTile = input.minTile ?? DEFAULT_MIN;
  const targetAspect = input.targetAspect ?? DEFAULT_ASPECT;
  const { width: w, height: h } = input.viewport;
  const count = Math.max(0, Math.floor(input.count));

  if (count === 0) {
    return { cols: 0, rows: 0, colTemplate: "1fr", rowTemplate: "1fr", scroll: false, placements: [] };
  }

  // Until we have a real viewport measurement, fall back to a single column.
  if (w <= 0 || h <= 0) {
    return {
      cols: 1,
      rows: count,
      colTemplate: "1fr",
      rowTemplate: `repeat(${count}, minmax(${minTile.height}px, 1fr))`,
      scroll: count > 1,
      placements: uniformPlacements(count, 1),
    };
  }

  const landscape = w >= h;

  // Bento for 1–4.
  const bento = count <= 4 ? bentoLayout(count, landscape) : null;
  if (bento) return bento;

  // General case: area-maximizing uniform grid.
  const { cols, rows } = bestColumns(count, w, h, gap, targetAspect);
  const cellH = (h - gap * (rows - 1)) / rows;
  const cellW = (w - gap * (cols - 1)) / cols;

  // If cells fit above the floor, fill the viewport (1fr rows). Otherwise switch
  // to a scrolling grid sized at the floor so nothing collapses.
  if (cellH >= minTile.height && cellW >= minTile.width) {
    return {
      cols,
      rows,
      colTemplate: `repeat(${cols}, 1fr)`,
      rowTemplate: `repeat(${rows}, 1fr)`,
      scroll: false,
      placements: uniformPlacements(count, cols),
    };
  }

  // Scroll mode: as many columns as fit at minTile width, fixed-height rows.
  const scrollCols = Math.max(
    1,
    Math.min(cols, Math.floor((w + gap) / (minTile.width + gap))),
  );
  const scrollRows = Math.ceil(count / scrollCols);
  return {
    cols: scrollCols,
    rows: scrollRows,
    colTemplate: `repeat(${scrollCols}, 1fr)`,
    rowTemplate: `repeat(${scrollRows}, ${minTile.height}px)`,
    scroll: true,
    placements: uniformPlacements(count, scrollCols),
  };
}
