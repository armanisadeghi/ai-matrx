/**
 * Reserved geometry (round 29, item 1): a database block stores the size it was painted at, per window
 * width, and that size never makes a save by itself — only a size the store does not hold (a new width,
 * or a table that grew) rides as one.
 */
import { contentKey } from "../../page/content-key";
import { paintedDrift, paintedHeights, pickPainted, readPaintedSizes } from "../database-host";

const db = (paintedSize?: unknown) => ({ id: "db1", type: "database", props: { inline: true, source: { kind: "table", tableId: "t" }, ...(paintedSize ? { paintedSize } : {}) } });
const doc = (blocks: unknown[]) => ({ title: "Plan", icon: null, cover: null, settings: {} as never, blocks: blocks as never });

describe("a database block's painted size", () => {
  it("is not content: a page that differs only in it has the same content key", () => {
    expect(contentKey(doc([db([{ w: 700, h: 300, vw: 1280 }])]))).toBe(contentKey(doc([db()])));
  });
  it("is picked by the block's width, else (before layout) by the window's", () => {
    const list = readPaintedSizes([{ w: 700, h: 300, vw: 1280 }, { w: 889, h: 387, vw: 1699 }]);
    expect(pickPainted(list, { width: 880 })?.h).toBe(387);
    expect(pickPainted(list, { width: 400 })).toBeNull();
    expect(pickPainted(list, { vw: 1290 })?.h).toBe(300);
  });
  it("reads a single stored size too", () => {
    expect(readPaintedSizes({ w: 1, h: 2 })).toEqual([{ w: 1, h: 2, vw: 0 }]);
  });
  it("drifts only when missing at that width or off by more than a few pixels", () => {
    const stored = paintedHeights([db([{ w: 700, h: 300, vw: 1280 }])]);
    expect(paintedDrift(paintedHeights([db([{ w: 702, h: 304, vw: 1280 }])]), stored)).toBe(false);
    expect(paintedDrift(paintedHeights([db([{ w: 700, h: 340, vw: 1280 }])]), stored)).toBe(true);
    expect(paintedDrift(paintedHeights([db([{ w: 889, h: 387, vw: 1699 }])]), stored)).toBe(true);
  });
});
