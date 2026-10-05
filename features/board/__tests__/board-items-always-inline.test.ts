/**
 * Arman 2026-10-04: "the agent should instantly know the basics of what I have on my board and if I
 * have one selected, then it should have the full data for that one ... it always sees enough to
 * know what I'm talking about and has id references".
 *
 * Live failure this guards: on a reloaded 6-item board (tiles asleep, nothing selected) the agent had
 * to call board_read — `board_items` was DEFERRED (no inline allowance: the server's default inlines
 * only values under 200 chars) and every asleep tile read "Not loaded yet" (basics came only from a
 * mounted tile's capture).
 */
jest.mock("@/features/surfaces/manifests/registry", () => {
  const manifest = {
    surfaceName: "matrx-user/test-inline-note",
    label: "Note",
    description: "One note.",
    briefValues: ["note_title", "note_body"],
    values: [
      { name: "note_title", label: "Title", description: "t", valueType: "string" },
      { name: "note_body", label: "Body", description: "b", valueType: "string" },
    ],
  };
  return { getManifest: (name: string) => (name === manifest.surfaceName ? manifest : undefined) };
});

import { boardManifest } from "@/features/surfaces/manifests/board.manifest";
import {
  BOARD_ITEMS_INLINE_CHARS,
  boardItemsOverview,
  createItemSurfaceIndex,
  sampleItemBasics,
  type BoardItemRow,
  type StoredBasics,
} from "../tools/item-surfaces";
import { parseBoardDocument, serializeBoardDocument, type BoardDocument } from "../board/document";
import { mergeBoardDocuments } from "../board/merge";
import type { SurfaceRegistry } from "@ai-matrx/chat/surfaces/runtime/SurfaceRuntimeContext";

const SURFACE = "matrx-user/test-inline-note";
const id = (i: number) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
const stored = (i: number): StoredBasics => ({
  values: { note_title: `Packing list ${i}`, note_body: { first_line: `Boxes for room ${i}`, words: 40 + i } },
  at: "2026-10-04T18:00:00.000Z",
});

function captureFor(scope: Record<string, unknown>): SurfaceRegistry {
  return { primary: () => ({ surfaceName: SURFACE, getScope: () => scope }) } as unknown as SurfaceRegistry;
}

describe("board_items is always inline, with basics for every item", () => {
  it("the manifest lets the server inline the whole board_items value, and the value never outgrows it", async () => {
    const declared = boardManifest.values.find((v) => v.name === "board_items");
    expect(declared?.inlineUpTo).toBe(BOARD_ITEMS_INLINE_CHARS);
    // The largest board: every listed item plus the tail, a selected tile with a huge body.
    const index = createItemSurfaceIndex();
    const rows: BoardItemRow[] = [];
    for (let i = 0; i < 400; i++) {
      const scope = { note_title: `A long title for item ${i} `.repeat(4), note_body: `x `.repeat(20_000) };
      index.set(id(i), captureFor(scope));
      rows.push({ id: id(i), title: `Item ${i} `.repeat(6), kind: "note", surface: SURFACE, live: false, selected: i === 3 });
    }
    const overview = await boardItemsOverview(rows, index);
    expect(JSON.stringify(overview).length).toBeLessThanOrEqual(BOARD_ITEMS_INLINE_CHARS);
    expect(overview.items[3].full_values).toBeDefined();
  });

  it("asleep tiles (nothing mounted, nothing selected) carry their last-known basics", async () => {
    const index = createItemSurfaceIndex(); // a reloaded board: no tile has mounted
    const rows: BoardItemRow[] = [0, 1, 2, 3, 4, 5].map((i) => ({
      id: id(i),
      title: `Tile ${i}`,
      kind: "note",
      surface: SURFACE,
      live: false,
      stored_basics: stored(i),
    }));
    const overview = await boardItemsOverview(rows, index);
    for (const [i, item] of overview.items.entries()) {
      expect(item.basics_note).toBeUndefined();
      expect(item.basics).toEqual(stored(i).values);
      expect(item.basics_at).toBe("2026-10-04T18:00:00.000Z");
      expect(item.basics_stale).toBeUndefined();
    }
  });

  it("a tile that has never been awake carries add-time basics, marked stale with when", async () => {
    const overview = await boardItemsOverview(
      [{ id: id(1), title: "Call the utility company", kind: "Task", surface: "matrx-user/tasks", live: false }],
      createItemSurfaceIndex(),
    );
    const item = overview.items[0];
    expect(item.basics).toEqual({ type: "Task", name: "Call the utility company" });
    expect(item.basics_stale).toBe(true);
    expect(typeof item.basics_at).toBe("string");
    expect(item.basics_note).toBeUndefined();
  });

  it("the selected tile (not live) still carries its full values", async () => {
    const index = createItemSurfaceIndex();
    index.set(id(2), captureFor({ note_title: "Moving day", note_body: "Line one\nLine two with the full text" }));
    const overview = await boardItemsOverview(
      [
        { id: id(1), title: "Other", kind: "note", surface: SURFACE, live: true },
        { id: id(2), title: "Moving day", kind: "note", surface: SURFACE, live: false, selected: true },
      ],
      index,
    );
    expect(overview.items[1].full_values).toEqual({
      note_title: "Moving day",
      note_body: "Line one\nLine two with the full text",
    });
  });
});

describe("last-known basics are kept in the saved board", () => {
  it("an awake tile's brief is sampled once, and not again while it is unchanged (no write loop)", async () => {
    const index = createItemSurfaceIndex();
    index.set(id(1), captureFor({ note_title: "Groceries", note_body: "Milk\nEggs and bread" }));
    const tiles = [
      { id: id(1), title: "Groceries", kind: "note", surface: SURFACE },
      { id: id(2), title: "Rooms", kind: "Picklist", surface: "matrx-user/picklist" },
    ];
    const first = await sampleItemBasics(tiles, index);
    expect(first).toHaveLength(2);
    const awake = first.find((u) => u.id === id(1))?.basics;
    expect(awake?.values).toEqual({ note_title: "Groceries", note_body: { first_line: "Milk", words: 4 } });
    expect(awake?.stale).toBeUndefined();
    const never = first.find((u) => u.id === id(2))?.basics;
    expect(never).toMatchObject({ values: { type: "Picklist", name: "Rooms" }, stale: true });
    const again = await sampleItemBasics(
      tiles.map((t) => ({ ...t, basics: first.find((u) => u.id === t.id)?.basics })),
      index,
    );
    expect(again).toEqual([]);
  });

  it("the document keeps a node's basics through save and load", () => {
    const doc: BoardDocument = {
      camera: { x: 0, y: 0, z: 1 },
      nodes: [
        {
          id: id(1),
          rect: { x: 0, y: 0, w: 10, h: 10 },
          title: "Groceries",
          source: { kind: "entity", entity: "note", id: id(9) },
          basics: stored(1),
        },
      ],
      groups: [],
      edges: [],
      shapes: [],
    };
    const round = parseBoardDocument(JSON.parse(JSON.stringify(serializeBoardDocument(doc))));
    expect(round.problems).toEqual([]);
    expect(round.doc.nodes[0].basics).toEqual(stored(1));
  });

  it("two tabs: a basics-only change never overrides the other tab's move and is never a conflict", () => {
    const node = {
      id: id(1),
      rect: { x: 0, y: 0, w: 10, h: 10 },
      title: "Groceries",
      source: { kind: "entity" as const, entity: "note", id: id(9) },
    };
    const doc = (n: object): BoardDocument => ({
      camera: { x: 0, y: 0, z: 1 },
      nodes: [n as BoardDocument["nodes"][number]],
      groups: [],
      edges: [],
      shapes: [],
    });
    const base = doc(node);
    const theirs = doc({ ...node, rect: { x: 500, y: 0, w: 10, h: 10 } });
    const ours = doc({ ...node, basics: stored(1) });
    const merged = mergeBoardDocuments(base, theirs, ours);
    expect(merged.conflicts).toBe(0);
    expect(merged.doc.nodes[0].rect.x).toBe(500);
    expect(merged.doc.nodes[0].basics).toEqual(stored(1));
  });
});
