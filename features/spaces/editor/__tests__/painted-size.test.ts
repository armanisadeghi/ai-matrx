/**
 * Reserved geometry (round 29, item 1): a database block stores the size it was painted at, per window
 * width, and that size never makes a save by itself — opening a page writes no version (needs job 5,
 * 2026-10-07); this device keeps its size locally and the next real save carries it.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { contentKey } from "../../page/content-key";
import { NEW_PAGE_ROW_PX, paintedSizesOf, pickPainted, readPaintedSizes } from "../database-host";

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
  it("never schedules a save of its own: the page saves only when its content key changed", () => {
    const page = readFileSync(join(__dirname, "../../page/SpacePage.tsx"), "utf8");
    expect(page).toMatch(/if \(key === savedKey\.current\) \{/);
    expect(page).not.toMatch(/paintedDrift|DATABASE_PAINTED_EVENT/);
  });

  it("a built-in table saved before its + New page row reads back with the row's height; a newer save does not", () => {
    const entity = { source: { kind: "entity", token: "task" } };
    expect(paintedSizesOf({ ...entity, paintedSize: [{ w: 700, h: 300, vw: 1280 }] })[0]!.h).toBe(300 + NEW_PAGE_ROW_PX);
    expect(paintedSizesOf({ ...entity, paintedSize: [{ w: 700, h: 334, vw: 1280, nr: 1 }] })[0]!.h).toBe(334);
    expect(paintedSizesOf({ source: { kind: "table" }, paintedSize: [{ w: 700, h: 300, vw: 1280 }] })[0]!.h).toBe(300);
  });
});
