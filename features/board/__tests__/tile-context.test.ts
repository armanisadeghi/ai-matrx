/**
 * A chat tile's OWN context: lines are context. The full values of every tile joined to a chat tile
 * by a line (either direction), the normal overview of the rest, and two chat tiles with different
 * lines see different sets. board_connect (the agent's tool) draws the same line.
 */
jest.mock("@/features/surfaces/manifests/registry", () => {
  const manifest = {
    surfaceName: "matrx-user/test-ctx-note",
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

import { buildTileContext, CONNECTED_CONTEXT_KEY, connectedTileIds } from "../tools/tile-context";
import { createItemSurfaceIndex } from "../tools/item-surfaces";
import type { BoardConnection } from "../board/board-store";
import type { SurfaceRegistry } from "@ai-matrx/chat/surfaces/runtime/SurfaceRuntimeContext";

const SURFACE = "matrx-user/test-ctx-note";
const LONG = "Quarterly plan: ".padEnd(400, "the partnership launches on the first of March. ");

function board(connections: BoardConnection[]) {
  const index = createItemSurfaceIndex();
  const tiles = ["note-a", "note-b", "chat-1", "chat-2"].map((id) => ({
    id,
    title: id.toUpperCase(),
    rect: { x: 0, y: 0, w: 100, h: 100 },
  }));
  for (const t of tiles.filter((x) => x.id.startsWith("note"))) {
    const scope = { note_title: t.title, note_body: `${t.id} says: ${LONG}` };
    index.set(t.id, { primary: () => ({ surfaceName: SURFACE, getScope: () => scope }) } as unknown as SurfaceRegistry);
  }
  const state = { tiles, parked: [], connections };
  return {
    board: { read: () => state },
    describe: (t: { id: string }) => ({ kind: t.id.startsWith("chat") ? "chat" : "note", surface: t.id.startsWith("note") ? SURFACE : null }),
    itemSurfaces: index,
  };
}

describe("a chat tile's context from its lines", () => {
  it("connectedTileIds reads a line in either direction, once", () => {
    const lines = [
      { id: "1", from: "note-a", to: "chat-1" },
      { id: "2", from: "chat-1", to: "note-b" },
      { id: "3", from: "chat-1", to: "note-a" },
    ];
    expect(connectedTileIds(lines, "chat-1")).toEqual(["note-a", "note-b"]);
    expect(connectedTileIds(lines, "chat-2")).toEqual([]);
  });

  it("includes the connected tile's FULL values and not the unconnected tile's", async () => {
    const host = board([{ id: "l", from: "note-a", to: "chat-1" }]);
    const entry = await buildTileContext("chat-1", host);
    expect(entry?.key).toBe(CONNECTED_CONTEXT_KEY);
    const items = entry!.value.board_items.items;
    const a = items.find((i) => i.id === "note-a")!;
    const b = items.find((i) => i.id === "note-b")!;
    expect(a.connected).toBe(true);
    expect(String((a.full_values as Record<string, unknown>).note_body)).toBe(`note-a says: ${LONG}`);
    expect(b.connected).toBeUndefined();
    expect(b.full_values).toBeUndefined();
    expect(JSON.stringify(b)).not.toContain(LONG);
    // the asking chat is not an item of its own context; the other chat is just listed
    expect(items.find((i) => i.id === "chat-1")).toBeUndefined();
    expect(items.find((i) => i.id === "chat-2")).toBeDefined();
  });

  it("a line drawn the other way (chat to tile) has the same effect", async () => {
    const host = board([{ id: "l", from: "chat-1", to: "note-b" }]);
    const items = (await buildTileContext("chat-1", host))!.value.board_items.items;
    expect(items.find((i) => i.id === "note-b")!.full_values).toBeDefined();
    expect(items.find((i) => i.id === "note-a")!.full_values).toBeUndefined();
  });

  it("two chat tiles with different lines see different connected sets", async () => {
    const host = board([
      { id: "1", from: "note-a", to: "chat-1" },
      { id: "2", from: "note-b", to: "chat-2" },
    ]);
    const one = (await buildTileContext("chat-1", host))!.value;
    const two = (await buildTileContext("chat-2", host))!.value;
    expect(one.connected_ids).toEqual(["note-a"]);
    expect(two.connected_ids).toEqual(["note-b"]);
    expect(one.board_items.items.find((i) => i.id === "note-b")!.full_values).toBeUndefined();
    expect(two.board_items.items.find((i) => i.id === "note-a")!.full_values).toBeUndefined();
  });

  it("no line, no entry (the chat carries nothing of the board)", async () => {
    expect(await buildTileContext("chat-1", board([]))).toBeNull();
  });
});
