import { recordKeyOf } from "../board/document";
// Saved boards — the pure parts of the service and the autosave core.
// Each case fails when the behaviour it names breaks.

jest.mock("@/utils/supabase/client", () => ({ supabase: { schema: () => ({ from: () => ({}) }) } }));
jest.mock("@/lib/organizations/ensureOrgId", () => ({ ensureOrgId: jest.fn() }));

import { parseBoardDocument } from "../board/document";
import { createAutosaver } from "../persistence/autosave";
import {
  BoardError,
  boardHref,
  copyTitle,
  countTiles,
  documentColumns,
  documentFingerprint,
  normalizeTitle,
  settingsForCopy,
  stableStringify,
  toJson,
  toLoadedBoard,
} from "../persistence/boardsService";

const doc = parseBoardDocument({
  camera: { x: 10, y: 20, z: 0.8 },
  nodes: [
    { id: "g1", rect: { x: 0, y: 0, w: 500, h: 500 }, title: "Group", group: true },
    { id: "n1", rect: { x: 1, y: 2, w: 3, h: 4 }, title: "Note", source: { kind: "text", markdown: "hi" } },
    { id: "n2", rect: { x: 5, y: 6, w: 7, h: 8 }, title: "Chat", source: { kind: "entity", entity: "chat", id: null } },
  ],
  edges: [{ id: "e1", from: "n1", to: "n2" }],
}).doc;

describe("board document columns", () => {
  it("round-trips through serialize → Json → parse with no problems", () => {
    const cols = documentColumns(doc);
    const back = parseBoardDocument(cols);
    expect(back.problems).toEqual([]);
    expect(back.doc).toEqual(doc);
  });

  it("toJson omits undefined keys and refuses what JSON cannot hold", () => {
    expect(toJson({ a: 1, b: undefined, c: [true, null] })).toEqual({ a: 1, c: [true, null] });
    expect(() => toJson({ x: Number.NaN })).toThrow("$.x is not a finite number");
    expect(() => toJson({ f: () => 1 })).toThrow("$.f is a function");
  });

  it("fingerprints ignore key order (jsonb re-orders keys) and the camera, but not content", () => {
    const a = documentColumns(doc);
    const reordered = {
      edges: a.edges,
      nodes: JSON.parse(JSON.stringify(a.nodes), (_k, v: unknown) =>
        v && typeof v === "object" && !Array.isArray(v)
          ? Object.fromEntries(Object.entries(v).reverse())
          : v,
      ),
      camera: { z: 0.8, y: 20, x: 10 },
    };
    expect(documentFingerprint(reordered)).toBe(documentFingerprint(a));
    // The camera is each viewer's own view: a pan in another tab must never
    // make this tab's next edit a conflict.
    expect(documentFingerprint({ ...a, camera: { x: 11, y: 20, z: 0.8 } })).toBe(documentFingerprint(a));
    // Connections are arrows inside `nodes` now (edges is always empty): taking one away changes the fingerprint.
    expect(documentFingerprint({ ...a, nodes: (a.nodes as unknown[]).filter((n) => (n as { id?: string }).id !== "e1") })).not.toBe(documentFingerprint(a));
    expect(stableStringify({ b: 1, a: [2, { d: 3, c: 4 }] })).toBe('{"a":[2,{"c":4,"d":3}],"b":1}');
  });

  it("counts tiles, not groups or drawn shapes", () => {
    expect(countTiles(documentColumns(doc).nodes)).toBe(2);
    expect(countTiles([{ id: "s", shape: true }, { id: "t" }])).toBe(1);
    expect(countTiles(null)).toBe(0);
  });

  it("toLoadedBoard carries parse problems instead of dropping them", () => {
    const board = toLoadedBoard({
      id: "b1",
      organization_id: "o1",
      title: "My board",
      description: null,
      camera: "nope",
      nodes: [{ id: "x" }],
      edges: [],
      settings: { home: true },
      version: 3,
      created_by: "u1",
      created_at: "2026-09-27T00:00:00Z",
      updated_at: "2026-09-27T00:00:00Z",
      last_opened_at: null,
    });
    expect(board.version).toBe(3);
    expect(board.problems).toEqual([
      "camera was not {x,y,z}; reset to the default view",
      "node 0 is missing id, rect or title",
    ]);
  });
});

describe("board copies and names", () => {
  it("a copy never inherits the retired home flag but keeps other settings", () => {
    expect(settingsForCopy({ home: true, wheel: "zoom" })).toEqual({ wheel: "zoom" });
    expect(settingsForCopy(null)).toEqual({});
    // A copy is never a brand's Studio board (that link is unique per brand); a template use drops the brand link too.
    const studio = { brand_id: "b", studio_brand_id: "b", wheel: "zoom" };
    expect(settingsForCopy(studio)).toEqual({ brand_id: "b", wheel: "zoom" });
    expect(settingsForCopy(studio, { dropBrand: true })).toEqual({ wheel: "zoom" });
    expect(copyTitle("Plans")).toBe("Plans (copy)");
  });

  it("every board opens at /board/<id> — /board is the list, there is no special board", () => {
    expect(boardHref({ id: "b1" })).toBe("/board/b1");
    expect(boardHref({ id: "b2" })).toBe("/board/b2");
  });

  it("a blank name is refused with a remedy; names are trimmed", () => {
    expect(normalizeTitle("  Roadmap ")).toBe("Roadmap");
    expect(() => normalizeTitle("   ")).toThrow(BoardError);
    try {
      normalizeTitle("");
    } catch (error) {
      expect(error).toBeInstanceOf(BoardError);
      expect((error as BoardError).code).toBe("invalid_title");
      expect((error as BoardError).remedy).toMatch(/Type a name/);
    }
  });
});

describe("createAutosaver", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("leaving the page with a save in flight sends the newest edit at once, urgently, beside it", async () => {
    const writes: { v: string; urgent: boolean }[] = [];
    let release: () => void = () => {};
    const saver = createAutosaver<string>({
      delayMs: 800,
      write: (v, { urgent }) => {
        writes.push({ v, urgent });
        return urgent ? Promise.resolve() : new Promise<void>((r) => (release = r));
      },
    });
    saver.schedule("first move");
    jest.advanceTimersByTime(800); // "first move" is in flight and never answers (the page is closing)
    saver.schedule("last move");
    await saver.flush({ urgent: true, leaving: true });
    expect(writes).toEqual([
      { v: "first move", urgent: false },
      { v: "last move", urgent: true },
    ]);
    release();
  });

  function setup(write: (v: string) => Promise<void> = async () => {}) {
    const writes: string[] = [];
    const errors: unknown[] = [];
    const saver = createAutosaver<string>({
      delayMs: 800,
      write: async (v) => {
        writes.push(v);
        await write(v);
      },
      onError: (e) => errors.push(e),
    });
    return { saver, writes, errors };
  }

  it("debounces: many edits inside the quiet period are ONE write of the last value", async () => {
    const { saver, writes } = setup();
    saver.schedule("a");
    jest.advanceTimersByTime(500);
    saver.schedule("b");
    jest.advanceTimersByTime(500);
    saver.schedule("c");
    jest.advanceTimersByTime(799);
    expect(writes).toEqual([]);
    jest.advanceTimersByTime(1);
    await Promise.resolve();
    expect(writes).toEqual(["c"]);
  });

  it("flush sends the pending value immediately (unmount / pagehide) and clears the timer", async () => {
    const { saver, writes } = setup();
    saver.schedule("typed");
    await saver.flush();
    expect(writes).toEqual(["typed"]);
    jest.advanceTimersByTime(2000);
    await Promise.resolve();
    expect(writes).toEqual(["typed"]); // not written twice
    expect(saver.hasPending()).toBe(false);
  });

  it("one write in flight at a time; an edit made during it goes out after, in order", async () => {
    let release: () => void = () => {};
    const { saver, writes } = setup(
      (v) => (v === "first" ? new Promise<void>((r) => (release = r)) : Promise.resolve()),
    );
    saver.schedule("first");
    jest.advanceTimersByTime(800);
    expect(writes).toEqual(["first"]);
    saver.schedule("second");
    jest.advanceTimersByTime(800); // timer fires while "first" is still writing
    expect(writes).toEqual(["first"]);
    release();
    await saver.flush();
    expect(writes).toEqual(["first", "second"]);
  });

  it("a failed write is reported, not retried on its own; the next edit retries", async () => {
    let fail = true;
    const { saver, writes, errors } = setup(async () => {
      if (fail) throw new Error("offline");
    });
    saver.schedule("x");
    await saver.flush();
    expect(errors).toHaveLength(1);
    jest.advanceTimersByTime(5000);
    await Promise.resolve();
    expect(writes).toEqual(["x"]);
    fail = false;
    saver.schedule("y");
    await saver.flush();
    expect(writes).toEqual(["x", "y"]);
    expect(errors).toHaveLength(1);
  });

  it("cancel drops the pending value without writing it", async () => {
    const { saver, writes } = setup();
    saver.schedule("stale");
    saver.cancel();
    jest.advanceTimersByTime(2000);
    await saver.flush();
    expect(writes).toEqual([]);
  });
});

describe("board list service", () => {
  // Imported lazily so the module-level mocks above apply.
  const { createBoardListService } = jest.requireActual<typeof import("../boards/listService")>(
    "../boards/listService",
  );
  const row = (id: string, title: string, tiles: number, updated: string) => ({
    id,
    title,
    organization_id: "o1",
    archived: false,
    tile_count: tiles,
    created_at: updated,
    updated_at: updated,
    last_opened_at: null,
  });
  const query = { scope: { kind: "mine" as const }, orgId: null, search: "", deep: false, archived: "active" as const, filters: {}, page: 1 };
  const sort = { sort: "tile_count", direction: "desc" as const, favoritesFirst: false, pageSize: 25 };

  it("page and counts asked together share ONE read; a refresh reads again (no stale list after rename/delete)", async () => {
    let reads = 0;
    let rows = [row("a", "Alpha", 1, "2026-09-01"), row("b", "Beta", 5, "2026-09-02")];
    const service = createBoardListService(async () => {
      reads += 1;
      return rows;
    });
    const [page, counts] = await Promise.all([service.fetchPage(query, sort), service.fetchCounts(query)]);
    expect(reads).toBe(1);
    expect(page.rows.map((r) => r.id)).toEqual(["b", "a"]); // sorted by tiles over the whole set
    expect(counts.byKind.mine).toBe(2);
    await new Promise((r) => setTimeout(r, 0));
    rows = [row("a", "Alpha renamed", 1, "2026-09-03")];
    const again = await service.fetchPage({ ...query, search: "renamed" }, sort);
    expect(reads).toBe(2);
    expect(again).toEqual({ rows: [rows[0]], total: 1 });
  });
});

describe("recordKeyOf — one record, one tile", () => {
  it("names a record by what it is, and board content as null", () => {
    expect(recordKeyOf({ kind: "entity", entity: "note", id: "n1" })).toBe("note:n1");
    expect(recordKeyOf({ kind: "entity", entity: "file", id: "f1" })).toBe(recordKeyOf({ kind: "entity", entity: "file", id: "f1" }));
    expect(recordKeyOf({ kind: "file", fileId: "f1" })).toBe("file:f1");
    expect(recordKeyOf({ kind: "document", documentId: "d1" })).toBe("document:d1");
    expect(recordKeyOf({ kind: "record", tableId: "t", recordId: "r" })).toBe("record:t:r");
    expect(recordKeyOf({ kind: "entity", entity: "note", id: null })).toBeNull();
    expect(recordKeyOf({ kind: "text", markdown: "x" })).toBeNull();
    expect(recordKeyOf({ kind: "html", url: "https://example.com" })).toBeNull();
  });
});
