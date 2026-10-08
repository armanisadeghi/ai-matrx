/**
 * THE AGENT MANAGES THE PERSON'S BOARD WITH THEIR REAL RECORDS (Arman, 2026-10-04: "tell the agent
 * that I'm working on a topic and then tell it to get all of my notes, files, chat … about that
 * topic on the board"). `board_add_items` places an existing record exactly as its bring-in picker
 * does, or starts a new one through the type's own create; `board_find_records` turns a topic into
 * candidates keyed by catalog item type. Real BoardStore, real camera store, real tool handlers
 * through BoardSurface, the real catalog, and the exact dedup + placement functions UserBoard's
 * `place()` runs (`planPlacement`, `placeTiles`).
 */

jest.mock("@/lib/toast", () => ({ toast: Object.assign(jest.fn(), { error: jest.fn(), success: jest.fn() }) }));
jest.mock("@/features/unified-data/hub/doors", () => ({
  ...jest.requireActual("@/features/unified-data/hub/doors"),
  dataHomeTables: jest.fn(),
}));
jest.mock("@/features/data-tables/pick-lists/pick-list-index", () => ({
  ...jest.requireActual("@/features/data-tables/pick-lists/pick-list-index"),
  readPickListIndex: jest.fn(),
}));

import { act } from "react";
import { createRoot } from "react-dom/client";
import { executeSurfaceClientTool } from "@ai-matrx/chat/surfaces/runtime/surface-client-tools";
import { dataHomeTables } from "@/features/unified-data/hub/doors";
import { readPickListIndex } from "@/features/data-tables/pick-lists/pick-list-index";
import { BoardStore } from "../board/board-store";
import { planPlacement } from "../board/plan-placement";
import { BoardSurface } from "../components/BoardSurface";
import { BoardCameraStore } from "../engine/camera-store";
import { placeTiles } from "../home/place-run";
import { BOARD_ITEM_TYPES, itemTypeFor } from "../items/catalog";
import { startNewEntries, type PlacedItem } from "../items/types";
import type { UserBoardTile } from "../home/UserBoard";
import { findBoardRecords, type SearchItemRow } from "../tools/board-records";
import { BOARD_ADDABLE_ITEM_KEYS, BOARD_CLIENT_TOOLS, BOARD_FINDABLE_ITEM_KEYS } from "../tools/board-tools";
import type { BoardToolHost } from "../tools/useBoardAgentTools";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const NOTE = "0b8f5f0e-1f7c-4a43-9a8e-3d1f5a2c7e01";
const TABLE = "5d1c2b7a-90e4-4c11-8f3e-2a6b9c4d8e02";
const TASK = "9e7a3c51-2b4d-4f86-a1c0-7d5e3b9f6a03";

describe("board_add_items / board_find_records — the tool shape comes from the catalog", () => {
  it("every type with a record door or a 'new' entry is addable, and nothing else", () => {
    const fromCatalog = BOARD_ITEM_TYPES.filter((t) => t.record || startNewEntries(t).length > 0).map((t) => t.key);
    expect([...BOARD_ADDABLE_ITEM_KEYS].sort()).toEqual([...fromCatalog].sort());
  });

  it("every type the search projection holds or a finder lists is findable, and nothing else", () => {
    const fromCatalog = BOARD_ITEM_TYPES.filter((t) => t.record?.searchToken || t.record?.find).map((t) => t.key);
    expect([...BOARD_FINDABLE_ITEM_KEYS].sort()).toEqual([...fromCatalog].sort());
  });

  it("the tools' type enums are those lists", () => {
    const add = BOARD_CLIENT_TOOLS.find((t) => t.name === "board_add_items")!;
    const find = BOARD_CLIENT_TOOLS.find((t) => t.name === "board_find_records")!;
    const addSchema = add.inputSchema as { properties: { items: { items: { properties: { type: { enum: string[] } } } } } };
    const findSchema = find.inputSchema as { properties: { types: { items: { enum: string[] } } } };
    expect(addSchema.properties.items.items.properties.type.enum).toEqual([...BOARD_ADDABLE_ITEM_KEYS]);
    expect(findSchema.properties.types.items.enum).toEqual([...BOARD_FINDABLE_ITEM_KEYS]);
  });
});

function mount(start: UserBoardTile[] = []) {
  const board = new BoardStore<UserBoardTile>(start);
  const store = new BoardCameraStore({ x: 0, y: 0, z: 1 });
  store.setSize({ w: 1600, h: 1000 });
  // UserBoard's place(), minus the camera moves: the same two functions.
  const place = (wanted: PlacedItem[], at?: { x: number; y: number }) => {
    const plan = planPlacement(wanted, [...board.read().tiles, ...board.read().parked], itemTypeFor);
    const view = { camera: store.getCamera(), size: store.getSize(), insets: store.getInsets() };
    if (plan.tiles.length > 0) placeTiles(board, plan.tiles, view, null, at);
    return plan.results;
  };
  const host: BoardToolHost<UserBoardTile> = {
    board,
    store,
    boardTitle: "Move-out",
    createTile: () => ({ ok: false, error: "unused" }),
    describe: (t) => ({ kind: itemTypeFor(t.source)?.key ?? "item" }),
    itemTypes: BOARD_ITEM_TYPES,
    placeItems: (batch) => {
      const out = new Array(batch.length).fill(null);
      const flowing = batch.flatMap((b, i) => (b.at ? [] : [i]));
      place(flowing.map((i) => batch[i].item)).forEach((r, k) => (out[flowing[k]] = r));
      batch.forEach((b, i) => {
        if (b.at) out[i] = place([b.item], b.at)[0] ?? null;
      });
      return out;
    },
  };
  const root = createRoot(document.createElement("div"));
  act(() => root.render(<BoardSurface host={host}>{null}</BoardSurface>));
  return { board, unmount: () => act(() => root.unmount()) };
}

type AddOutput = { ok: boolean; added: number; results: { status: string; tile_id?: string; error?: string }[] };
const addItems = async (items: unknown[]) =>
  ((await executeSurfaceClientTool("board_add_items", { items })) as { output: AddOutput }).output;

describe("board_add_items — the person's real records, one undoable step", () => {
  it("an existing note, table and task land as the same sources their pickers place", async () => {
    const { board, unmount } = mount();
    const out = await addItems([
      { type: "note", id: NOTE, title: "Harborview move-out checklist" },
      { type: "data-table", id: TABLE, title: "Harborview move-out costs" },
      { type: "task", id: TASK },
    ]);
    expect(out.added).toBe(3);
    const sources = out.results.map((r) => board.getTile(r.tile_id!)?.source);
    expect(sources).toEqual([
      { kind: "entity", entity: "note", id: NOTE },
      { kind: "entity", entity: "data-table", id: TABLE },
      { kind: "entity", entity: "task", id: TASK },
    ]);
    expect(board.getTile(out.results[0].tile_id!)?.title).toBe("Harborview move-out checklist");
    // One undoable step: the agent's undo takes all three back at once.
    expect(board.undoActor("agent").undone).toBe(true);
    expect(board.read().tiles).toHaveLength(0);
    unmount();
  });

  it("new: true starts a blank one through the type's own create; a start that needs a choice says so", async () => {
    const { board, unmount } = mount();
    const out = await addItems([{ type: "note", new: true }, { type: "meeting", new: true }]);
    expect(out.results[0].status).toBe("added");
    expect(board.getTile(out.results[0].tile_id!)?.source).toEqual({ kind: "entity", entity: "note", id: null });
    expect(out.results[1].status).toBe("needs_person");
    unmount();
  });

  it("a record already on the board, or named twice, is placed once and reported per entry", async () => {
    const { board, unmount } = mount([
      { id: "note:old", title: "Checklist", source: { kind: "entity", entity: "note", id: NOTE }, rect: { x: 0, y: 0, w: 560, h: 620 } },
    ]);
    const out = await addItems([
      { type: "note", id: NOTE },
      { type: "task", id: TASK },
      { type: "task", id: TASK },
      { type: "bogus", id: "x" },
    ]);
    expect(out.results.map((r) => r.status)).toEqual(["already_on_board", "added", "duplicate", "refused"]);
    expect(out.results[0].tile_id).toBe("note:old");
    expect(board.read().tiles).toHaveLength(2);
    unmount();
  });
});

describe("board_find_records — a topic across the person's records", () => {
  const rows: SearchItemRow[] = [
    { entity_token: "note", entity_id: NOTE, title: "Harborview move-out checklist", subtitle: null, updated_at: "2026-10-04T10:00:00Z" },
    { entity_token: "conversation", entity_id: "c1", title: "Harborview move-out chat", subtitle: null, updated_at: "2026-10-03T10:00:00Z" },
    { entity_token: "agent", entity_id: "a1", title: "Harborview agent", subtitle: null, updated_at: null },
  ];

  beforeEach(() => {
    (dataHomeTables as jest.Mock).mockResolvedValue({
      ok: true,
      data: [
        { table_id: TABLE, table_name: "Harborview move-out costs", organization_id: "o", organization_name: "Home", member: true, visibility: "personal", updated_at: "2026-10-04T09:00:00Z", mine: true, shared_with_me: false, platform_owned: false, kind: "table" },
        { table_id: "t2", table_name: "Grocery budget", organization_id: "o", organization_name: "Home", member: true, visibility: "personal", updated_at: null, mine: true, shared_with_me: false, platform_owned: false, kind: "table" },
      ],
    });
    (readPickListIndex as jest.Mock).mockResolvedValue({
      ok: true,
      lists: [{ id: "l1", listName: "Harborview move-out rooms", description: null, itemCount: 3, updatedAt: null, createdBy: null, organizationId: "o", organizationName: "Home" }],
      archivedIds: ["l1"],
    });
  });

  it("maps projection tokens to catalog keys, reads tables by name, leaves archived and foreign types out", async () => {
    const searchItems = jest.fn(async () => rows);
    const out = await findBoardRecords({ query: "Harborview move-out" }, BOARD_ITEM_TYPES, searchItems);
    if (!out.ok) throw new Error(out.error);
    expect(out.records.map((r) => `${r.type}:${r.id}`).sort()).toEqual([`chat:c1`, `data-table:${TABLE}`, `note:${NOTE}`].sort());
    // The conversation asking is never offered (live run 2026-10-04 put the asking chat on the board).
    const asking = await findBoardRecords({ query: "Harborview move-out" }, BOARD_ITEM_TYPES, searchItems, {
      exclude: [{ type: "chat", id: "c1" }],
    });
    if (!asking.ok) throw new Error(asking.error);
    expect(asking.records.map((r) => r.type)).not.toContain("chat");
    // The projection is asked only for the tokens the catalog declares.
    const tokens = (searchItems.mock.calls[0] as unknown as [{ tokens: string[] }])[0].tokens;
    expect(tokens).toEqual(expect.arrayContaining(["note", "conversation", "file", "task", "udt_document"]));
    expect(tokens).not.toContain("agent");
  });

  it("types narrows the lanes; a lane that fails is named, never silent", async () => {
    const searchItems = jest.fn(async () => {
      throw new Error("projection down");
    });
    const out = await findBoardRecords({ query: "Harborview", types: ["note", "data-table"] }, BOARD_ITEM_TYPES, searchItems);
    if (!out.ok) throw new Error(out.error);
    expect(out.records.map((r) => r.type)).toEqual(["data-table"]);
    expect(out.unsearched).toEqual([{ types: ["note"], why: "projection down" }]);
  });
});

describe("board_find_records — meetings, workflow runs and study kits (no search projection: their pickers' own lists)", () => {
  it("each is findable and the tool names what stays unsearchable", () => {
    expect([...BOARD_FINDABLE_ITEM_KEYS]).toEqual(expect.arrayContaining(["meeting", "workflow-run", "study-kit"]));
    const find = BOARD_CLIENT_TOOLS.find((t) => t.name === "board_find_records")!;
    expect(find.description).toMatch(/meetings, workflow runs, study kits/);
    expect(find.description).toMatch(/data records .*cannot be searched/i);
  });

  it("names match, archived meetings are left out, kit ids carry their anchor type, and a failing list is named", async () => {
    const { findMeetings, findWorkflowRuns, findKits } = jest.requireActual("../items/record-finders");
    const meet = (id: string, title: string, deletedAt: string | null) => ({ id, title, deletedAt, scheduledFor: "2026-10-05T10:00:00Z", startedAt: null, endedAt: null });
    const meetings = await findMeetings("meeting", "board review", 10, async () => ({
      meetings: [meet("m1", "Board review Q4", null), meet("m2", "Board review old", "2026-09-01T00:00:00Z"), meet("m3", "Standup", null)],
    }));
    expect(meetings.map((m: { id: string }) => m.id)).toEqual(["m1"]);

    const runs = await findWorkflowRuns(
      "workflow-run",
      "invoice",
      10,
      async () => ({ ok: true, rows: [
        { runId: "r1", definitionId: "d1", status: "completed", startedAt: "2026-10-04T10:00:00Z" },
        { runId: "r2", definitionId: "d2", status: "failed", startedAt: "2026-10-03T10:00:00Z" },
      ] }),
      async () => new Map([["d1", { name: "Invoice intake" }], ["d2", { name: "Weekly digest" }]]),
    );
    expect(runs.map((r: { id: string }) => r.id)).toEqual(["r1"]);

    const kits = await findKits("study-kit", "biology", 10, async () => [
      { sourceType: "file", sourceId: "f1", title: "Biology ch 3", artifacts: [{}, {}], createdAt: "2026-10-01T00:00:00Z" },
      { sourceType: "udt_document", sourceId: "d9", title: "Biology notes", artifacts: [{}], createdAt: "2026-10-02T00:00:00Z" },
      { sourceType: "file", sourceId: "f2", title: "History", artifacts: [{}], createdAt: "2026-10-02T00:00:00Z" },
    ]);
    expect(kits.map((k: { id: string }) => k.id)).toEqual(["udt_document:d9", "f1"]);
    await expect(findKits("study-kit", "x", 5, async () => { throw new Error("down"); })).rejects.toThrow("down");
  });

  it("a kit id placed by an agent opens the same source the picker places", () => {
    const kit = itemTypeFor({ kind: "entity", entity: "study-kit", id: "f1" })!;
    expect(kit.record!.place("f1").source).toEqual({ kind: "entity", entity: "study-kit", id: "f1" });
    expect(kit.record!.place("udt_document:d9").source).toEqual({ kind: "entity", entity: "study-kit", id: "d9", meta: { from: "udt_document" } });
  });
});
