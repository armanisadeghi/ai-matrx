/**
 * windowArrangements.test.ts — Layout-tab tile math.
 *
 * Guards the invariant that arrange-all never returns duplicate rects for
 * windows within a layout's slot capacity, and that excess windows are
 * left unmoved instead of wrapping onto occupied tiles.
 */
import { computeGlobalArrangement } from "../utils/windowArrangements";

function rectKey(r: { x: number; y: number; width: number; height: number }) {
  return `${r.x},${r.y},${r.width},${r.height}`;
}

describe("computeGlobalArrangement", () => {
  it("places grid4 windows into unique non-overlapping tiles", () => {
    const ids = ["a", "b", "c", "d"];
    const updates = computeGlobalArrangement(
      "grid4",
      ids,
      1200,
      800,
      "rtl",
      "ttb",
      "vertical",
    );
    expect(updates).toHaveLength(4);
    const keys = new Set(updates.map((u) => rectKey(u.rect)));
    expect(keys.size).toBe(4);
  });

  it("does not pile excess windows onto occupied stack slots", () => {
    const ids = ["a", "b", "c", "d", "e"];
    const updates = computeGlobalArrangement(
      "stackLeft3",
      ids,
      1200,
      900,
      "rtl",
      "ttb",
      "vertical",
    );
    // Only 3 slots — extras keep their prior geometry (not returned).
    expect(updates).toHaveLength(3);
    const keys = new Set(updates.map((u) => rectKey(u.rect)));
    expect(keys.size).toBe(3);
    for (const u of updates) {
      expect(u.rect.x).toBe(0);
      expect(u.rect.width).toBe(400);
    }
  });

  it("mirrors columns under rtl without colliding within capacity", () => {
    const updates = computeGlobalArrangement(
      "grid6",
      ["a", "b", "c", "d", "e", "f"],
      1200,
      800,
      "rtl",
      "ttb",
      "horizontal",
    );
    expect(new Set(updates.map((u) => rectKey(u.rect))).size).toBe(6);
  });
});
