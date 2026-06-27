// lib/layout/galleryLayout.test.ts
//
// Locks the two guarantees the War Room grid leans on:
//   1. tiles NEVER shrink below the minTile floor — past it the grid scrolls
//      (this is what keeps an operable thread card usable at high counts);
//   2. once scrolling, the grid PACKS THE WIDTH (as many floor-width columns as
//      fit, capped by item count) instead of honoring the fewer "fit-everything"
//      columns — which is what fixes the wide empty gutters.

import { computeGalleryLayout } from "@/lib/layout/galleryLayout";

const FLOOR = { width: 340, height: 290 }; // ≈ the comfortable density floor
const GAP = 12;

describe("computeGalleryLayout", () => {
  it("uses bento (no scroll) for 1–4 tiles", () => {
    for (const count of [1, 2, 3, 4]) {
      const l = computeGalleryLayout({
        count,
        viewport: { width: 1400, height: 800 },
        gap: GAP,
        minTile: FLOOR,
      });
      expect(l.scroll).toBe(false);
      expect(l.placements).toHaveLength(count);
    }
  });

  it("fills the viewport (no scroll) when tiles stay at/above the floor", () => {
    // 6 tiles in a roomy viewport → 3×2 well above the floor.
    const l = computeGalleryLayout({
      count: 6,
      viewport: { width: 1400, height: 820 },
      gap: GAP,
      minTile: FLOOR,
    });
    expect(l.scroll).toBe(false);
    expect(l.colTemplate).toBe("repeat(3, 1fr)");
  });

  it("switches to scrolling instead of shrinking tiles below the floor", () => {
    // Many tiles in a modest viewport must NOT pack into a single non-scrolling
    // screen of tiny cells — it scrolls at the floor height.
    const l = computeGalleryLayout({
      count: 16,
      viewport: { width: 1200, height: 700 },
      gap: GAP,
      minTile: FLOOR,
    });
    expect(l.scroll).toBe(true);
    expect(l.rowTemplate).toContain(`${FLOOR.height}px`); // rows fixed at the floor
  });

  it("packs the full width when scrolling (no narrow-column gutters)", () => {
    // 1200px / 340px floor → 3 columns fit. The engine must use all 3, not the
    // 2 a 'fit-everything' area search would pick for 16 tiles.
    const w = 1200;
    const expectedCols = Math.floor((w + GAP) / (FLOOR.width + GAP)); // = 3
    const l = computeGalleryLayout({
      count: 16,
      viewport: { width: w, height: 700 },
      gap: GAP,
      minTile: FLOOR,
    });
    expect(l.scroll).toBe(true);
    expect(l.cols).toBe(expectedCols);
    expect(l.colTemplate).toBe(`repeat(${expectedCols}, 1fr)`);
  });

  it("never makes more columns than there are tiles", () => {
    const l = computeGalleryLayout({
      count: 5,
      viewport: { width: 4000, height: 300 }, // ultra-wide, short → would force scroll
      gap: GAP,
      minTile: FLOOR,
    });
    expect(l.cols).toBeLessThanOrEqual(5);
  });
});
