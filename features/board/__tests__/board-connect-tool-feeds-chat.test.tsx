// board_connect (the agent's tool) draws the same line a person's arrow does: a tile connected TO a
// chat tile through the tool lands in that chat's own context, in full. Real BoardStore, real tool handler.

jest.mock("@/lib/toast", () => ({ toast: Object.assign(jest.fn(), { error: jest.fn(), success: jest.fn() }) }));
jest.mock("@/features/surfaces/manifests/registry", () => {
  const manifest = {
    surfaceName: "matrx-user/test-ctx-note2",
    label: "Note",
    description: "One note.",
    briefValues: ["note_title", "note_body"],
    values: [
      { name: "note_title", label: "Title", description: "t", valueType: "string" },
      { name: "note_body", label: "Body", description: "b", valueType: "string" },
    ],
  };
  const actual = jest.requireActual("@/features/surfaces/manifests/registry");
  return { ...actual, getManifest: (name: string) => (name === manifest.surfaceName ? manifest : actual.getManifest(name)) };
});

import { act } from "react";
import { createRoot } from "react-dom/client";
import { executeSurfaceClientTool } from "@ai-matrx/chat/surfaces/runtime/surface-client-tools";
import type { SurfaceRegistry } from "@ai-matrx/chat/surfaces/runtime/SurfaceRuntimeContext";
import { BoardStore } from "../board/board-store";
import { BoardSurface } from "../components/BoardSurface";
import { BoardCameraStore } from "../engine/camera-store";
import { createItemSurfaceIndex } from "../tools/item-surfaces";
import { buildTileContext } from "../tools/tile-context";
import type { BoardToolHost } from "../tools/useBoardAgentTools";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Tile = { id: string; title: string; rect: { x: number; y: number; w: number; h: number } };
const tile = (id: string, x: number): Tile => ({ id, title: id, rect: { x, y: 0, w: 100, h: 100 } });
const SURFACE = "matrx-user/test-ctx-note2";

it("board_connect note -> chat gives that chat the note's full text; removing the line takes it away", async () => {
  const board = new BoardStore<Tile>([tile("note", 0), tile("chat", 300), tile("other", 600)]);
  const itemSurfaces = createItemSurfaceIndex();
  for (const id of ["note", "other"]) {
    const scope = { note_title: id, note_body: `${id}: the supplier contract renews on 14 June with a 3% uplift` };
    itemSurfaces.set(id, { primary: () => ({ surfaceName: SURFACE, getScope: () => scope }) } as unknown as SurfaceRegistry);
  }
  const host: BoardToolHost<Tile> = {
    board,
    store: new BoardCameraStore({ x: 0, y: 0, z: 1 }),
    boardTitle: "Plans",
    itemSurfaces,
    createTile: (id, input, size) => ({ id, title: input.title ?? "Note", rect: { x: 0, y: 0, ...size } }),
    describe: (t) => ({ kind: t.id === "chat" ? "chat" : "note", surface: t.id === "chat" ? null : SURFACE }),
  };
  const root = createRoot(document.createElement("div"));
  act(() => root.render(<BoardSurface host={host}>{null}</BoardSurface>));

  expect(await buildTileContext("chat", host)).toBeNull();
  const out = await executeSurfaceClientTool("board_connect", { from_id: "note", to_id: "chat" });
  expect((out as { output: Record<string, unknown> }).output).toMatchObject({ ok: true });

  const entry = await buildTileContext("chat", host);
  const items = entry!.value.board_items.items;
  expect(String((items.find((i) => i.id === "note")!.full_values as Record<string, unknown>).note_body)).toContain("14 June");
  expect(items.find((i) => i.id === "other")!.full_values).toBeUndefined();

  board.disconnect(board.read().connections[0].id);
  expect(await buildTileContext("chat", host)).toBeNull();
  act(() => root.unmount());
});
