import { rectsIntersect, type Rect } from "@/features/spatial/engine/camera";
import type { ThreadTab } from "@/features/war-room/types";
import {
  BOARD_LAYOUT_KEY,
  FRAME_GAP_X,
  FRAME_HEADER_H,
  FRAME_PAD,
  PART_GAP,
  type ThreadParts,
  boardPartTabs,
  parseBoardLayout,
  parsePartKey,
  partKey,
  placeMissingParts,
  serializeBoardLayout,
  threadFrame,
} from "../boardLayout";

const CORE: ThreadTab[] = ["task", "notes", "audio", "agent", "files"];

/** Deterministic variety: 1 to 8 parts per thread (core tabs + entity tabs). */
function room(n: number): ThreadParts[] {
  return Array.from({ length: n }, (_, i) => {
    const count = 1 + ((i * 3) % 8);
    const tabs: ThreadTab[] = [...CORE, "entity:dataset", "entity:table", "entity:recipe"].slice(
      0,
      count,
    ) as ThreadTab[];
    return { threadId: `t${String(i).padStart(2, "0")}-uuid`, tabs };
  });
}

function frameOf(t: { threadId: string; tabs: readonly ThreadTab[] }, parts: Record<string, Rect>): Rect {
  const f = threadFrame(t.threadId, t.tabs, parts);
  if (!f) throw new Error(`no frame for ${t.threadId}`);
  return f;
}

function assertNoOverlap(threads: readonly ThreadParts[], parts: Record<string, Rect>) {
  const all: Array<{ key: string; r: Rect }> = [];
  for (const t of threads)
    for (const tab of t.tabs) {
      const r = parts[partKey(t.threadId, tab)];
      expect(r).toBeDefined();
      all.push({ key: partKey(t.threadId, tab), r });
    }
  // No part touches another (and the gap between them is kept).
  for (let i = 0; i < all.length; i++)
    for (let j = i + 1; j < all.length; j++) {
      const a = all[i].r;
      const grown = { x: a.x - PART_GAP + 1, y: a.y - PART_GAP + 1, w: a.w + 2 * PART_GAP - 2, h: a.h + 2 * PART_GAP - 2 };
      expect([all[i].key, all[j].key, rectsIntersect(grown, all[j].r)]).toEqual([
        all[i].key,
        all[j].key,
        false,
      ]);
    }
  // Frames never touch, and keep at least the frame gap between them.
  const frames = threads.map((t) => ({ id: t.threadId, f: frameOf(t, parts) }));
  for (let i = 0; i < frames.length; i++)
    for (let j = i + 1; j < frames.length; j++) {
      const a = frames[i].f;
      const g = FRAME_GAP_X - 1;
      const grown = { x: a.x - g, y: a.y - g, w: a.w + 2 * g, h: a.h + 2 * g };
      expect([frames[i].id, frames[j].id, rectsIntersect(grown, frames[j].f)]).toEqual([
        frames[i].id,
        frames[j].id,
        false,
      ]);
    }
  // Every part sits inside its own frame, below the header band.
  for (const t of threads) {
    const f = frameOf(t, parts);
    for (const tab of t.tabs) {
      const r = parts[partKey(t.threadId, tab)];
      expect(r.x).toBeGreaterThanOrEqual(f.x + FRAME_PAD);
      expect(r.y).toBeGreaterThanOrEqual(f.y + FRAME_PAD + FRAME_HEADER_H);
      expect(r.x + r.w).toBeLessThanOrEqual(f.x + f.w - FRAME_PAD);
      expect(r.y + r.h).toBeLessThanOrEqual(f.y + f.h - FRAME_PAD);
    }
  }
}

describe("war room board layout", () => {
  it.each([1, 5, 12])("lays out a room of %i threads with nothing overlapping", (n) => {
    const threads = room(n);
    const parts = placeMissingParts(threads, {});
    assertNoOverlap(threads, parts);
  });

  it("is deterministic", () => {
    const threads = room(7);
    expect(placeMissingParts(threads, {})).toEqual(placeMissingParts(threads, {}));
  });

  it("a part added later lands inside its frame's space without covering anything", () => {
    const threads = room(5);
    const parts = placeMissingParts(threads, {});
    // Thread 2 gains an attachment tab; thread 0 gains two.
    const grown = threads.map((t, i) =>
      i === 2
        ? { ...t, tabs: [...t.tabs, "entity:workbook" as ThreadTab] }
        : i === 0
          ? { ...t, tabs: [...t.tabs, "entity:workbook" as ThreadTab, "entity:video" as ThreadTab] }
          : t,
    );
    const added = placeMissingParts(grown, parts);
    expect(Object.keys(added).sort()).toEqual(
      [
        partKey(threads[0].threadId, "entity:workbook"),
        partKey(threads[0].threadId, "entity:video"),
        partKey(threads[2].threadId, "entity:workbook"),
      ].sort(),
    );
    // Nothing that was already placed moves.
    for (const key of Object.keys(parts)) expect(added[key]).toBeUndefined();
    assertNoOverlap(grown, { ...parts, ...added });
  });

  it("a new thread gets a new frame in a free slot, even after frames were moved", () => {
    const threads = room(5);
    const parts = placeMissingParts(threads, {});
    // Drag thread 1's whole frame somewhere odd.
    for (const tab of threads[1].tabs) {
      const k = partKey(threads[1].threadId, tab);
      parts[k] = { ...parts[k], x: parts[k].x + 777, y: parts[k].y + 333 };
    }
    const more = [...threads, { threadId: "new-thread", tabs: CORE }];
    const added = placeMissingParts(more, parts, { x: 1500, y: 900 });
    expect(Object.keys(added)).toHaveLength(CORE.length);
    const all = { ...parts, ...added };
    // Only the new frame is checked against the (now irregular) others.
    const nf = frameOf({ threadId: "new-thread", tabs: CORE }, all);
    for (const t of threads) {
      const f = frameOf(t, all);
      expect(rectsIntersect(nf, f)).toBe(false);
    }
  });

  it("round-trips through metadata, keyed per part, pruning threads that left", () => {
    const threads = room(3);
    const parts = placeMissingParts(threads, {});
    const k = partKey(threads[0].threadId, "notes");
    const json = serializeBoardLayout(
      { v: 2, parts, parked: [k], removed: [partKey(threads[2].threadId, "task")], camera: { x: 1, y: 2, z: 0.5 } },
      [threads[0].threadId, threads[1].threadId],
    );
    const back = parseBoardLayout({ [BOARD_LAYOUT_KEY]: json });
    expect(back.parked).toEqual([k]);
    expect(back.removed).toEqual([]);
    expect(back.camera).toEqual({ x: 1, y: 2, z: 0.5 });
    expect(Object.keys(back.parts).every((key) => !key.startsWith(threads[2].threadId))).toBe(true);
    expect(back.parts[k]).toEqual(parts[k]);
  });

  it("ignores the old per-thread layout but keeps its camera", () => {
    const back = parseBoardLayout({
      [BOARD_LAYOUT_KEY]: { v: 1, tiles: { abc: { x: 0, y: 0, w: 720, h: 620 } }, camera: { x: 0, y: 0, z: 1 } },
    });
    expect(back.parts).toEqual({});
    expect(back.camera).toEqual({ x: 0, y: 0, z: 1 });
  });

  it("splits part keys whose tab holds a colon", () => {
    expect(parsePartKey("abc:entity:dataset")).toEqual({ threadId: "abc", tab: "entity:dataset" });
    expect(boardPartTabs(["task", "combined", "entity:x"])).toEqual(["task", "entity:x"]);
  });
});
