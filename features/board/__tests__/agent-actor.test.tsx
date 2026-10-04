// The assistant's changes are its own: `board_undo` takes back only what the
// agent did, never the person's move, and an agent's add never takes the
// selection from a tile the person is typing in. Real BoardStore, real
// SpatialStore, real tool handlers through the board surface.

jest.mock("@/lib/toast", () => ({ toast: Object.assign(jest.fn(), { error: jest.fn(), success: jest.fn() }) }));

import { act } from "react";
import { createRoot } from "react-dom/client";
import { executeSurfaceClientTool } from "@ai-matrx/chat/surfaces/runtime/surface-client-tools";
import { BoardStore } from "../board/board-store";
import { SpatialBoardSurface } from "../components/SpatialBoardSurface";
import { SpatialStore } from "../engine/spatial-store";
import type { BoardToolHost } from "../tools/useBoardAgentTools";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Tile = { id: string; title: string; rect: { x: number; y: number; w: number; h: number } };
const tile = (id: string, x: number): Tile => ({ id, title: id, rect: { x, y: 0, w: 100, h: 100 } });

describe("board store — actors", () => {
  it("an agent's undo never re-parks a tile it brought back (the person may be working in it)", () => {
    const board = new BoardStore<Tile>({ tiles: [tile("a", 0), tile("p", 200)], parked: ["p"] });
    board.runAs("agent", () => board.unparkTile("p"));
    board.undoActor("agent");
    expect(board.getLayout().parkedIds).toEqual([]);
  });

  it("the person's ⌘Z of the agent's change takes it off the agent's list, and ⇧⌘Z puts it back", () => {
    const board = new BoardStore<Tile>([tile("a", 0), tile("b", 200)]);
    board.runAs("agent", () => board.moveMany([{ id: "b", x: 900, y: 0 }]));
    board.undo();
    expect(board.canUndoActor("agent")).toBe(false);
    board.redo();
    expect(board.canUndoActor("agent")).toBe(true);
    expect(board.undoActor("agent")).toEqual({ undone: true, kept: [] });
    expect(board.getTile("b")?.rect.x).toBe(200);
  });

  it("undoActor('agent') reverts only the agent's change; the person's later move stays", () => {
    const board = new BoardStore<Tile>([tile("a", 0), tile("b", 200), tile("c", 400)]);
    board.moveTile("a", 10, 10); // the person
    board.runAs("agent", () => board.moveMany([{ id: "b", x: 900, y: 900 }])); // the agent
    board.moveTile("c", 50, 50); // the person again, after the agent
    expect(board.canUndoActor("agent")).toBe(true);
    const result = board.undoActor("agent");
    expect(result).toEqual({ undone: true, kept: [] });
    expect(board.getTile("b")?.rect).toMatchObject({ x: 200, y: 0 }); // the agent's move is gone
    expect(board.getTile("a")?.rect).toMatchObject({ x: 10, y: 10 }); // the person's moves remain
    expect(board.getTile("c")?.rect).toMatchObject({ x: 50, y: 50 });
    expect(board.canUndoActor("agent")).toBe(false);
  });

  it("an item the person changed after the agent is kept and named, never reverted", () => {
    const board = new BoardStore<Tile>([tile("a", 0)]);
    board.runAs("agent", () => board.moveMany([{ id: "a", x: 500, y: 0 }]));
    board.moveTile("a", 600, 0); // the person moved it again
    expect(board.undoActor("agent")).toEqual({ undone: true, kept: ["a"] });
    expect(board.getTile("a")?.rect.x).toBe(600);
  });

  it("the agent's add and remove are taken back; the person's own undo still walks the shared stack", () => {
    const board = new BoardStore<Tile>([tile("a", 0)]);
    board.runAs("agent", () => board.addTile(tile("new", 300)));
    board.removeTile("a"); // the person
    board.undoActor("agent");
    expect(board.getTile("new")).toBeUndefined();
    expect(board.read().tiles).toHaveLength(0); // "a" stays removed: that was the person
    board.undo(); // ⌘Z: the revert itself is one step
    expect(board.getTile("new")).toBeDefined();
  });
});

describe("board tools — the person's work is theirs", () => {
  function mount() {
    const board = new BoardStore<Tile>([tile("a", 0), tile("b", 200)]);
    const store = new SpatialStore({ x: 0, y: 0, z: 1 });
    const host: BoardToolHost<Tile> = {
      board,
      store,
      boardTitle: "Plans",
      createTile: (id, input, size) => ({ id, title: input.title ?? "Note", rect: { x: 0, y: 0, ...size } }),
      describe: () => ({ kind: "note" }),
    };
    const root = createRoot(document.createElement("div"));
    act(() => root.render(<SpatialBoardSurface host={host}>{null}</SpatialBoardSurface>));
    return { board, store, unmount: () => act(() => root.unmount()) };
  }

  it("board_undo takes back the agent's own move, never the person's", async () => {
    const { board, unmount } = mount();
    await executeSurfaceClientTool("board_move_tiles", { moves: [{ id: "b", x: 800, y: 800 }] });
    board.moveTile("a", 30, 30); // the person, after the agent
    const result = await executeSurfaceClientTool("board_undo", {});
    expect((result as { output: Record<string, unknown> }).output).toMatchObject({ ok: true });
    expect(board.getTile("b")?.rect).toMatchObject({ x: 200, y: 0 });
    expect(board.getTile("a")?.rect).toMatchObject({ x: 30, y: 30 });
    const again = await executeSurfaceClientTool("board_undo", {});
    expect((again as { output: Record<string, unknown> }).output).toMatchObject({ ok: false });
    expect(board.getTile("a")?.rect).toMatchObject({ x: 30, y: 30 });
    unmount();
  });

  it("an agent's new tile never takes the selection from a tile the person is typing in", async () => {
    const { board, store, unmount } = mount();
    store.setEditing("a");
    const result = await executeSurfaceClientTool("board_add_tile", { kind: "note", title: "Idea" });
    const id = (result as { output: { id: string } }).output.id;
    await act(async () => {
      await new Promise((r) => setTimeout(r, 40));
    });
    expect(board.getTile(id)).toBeDefined();
    expect(store.getEditing()).toBe("a");
    expect(store.getSelected()).toBe("a");
    unmount();
  });
});
