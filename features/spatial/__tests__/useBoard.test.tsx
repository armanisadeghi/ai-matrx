import { act } from "react";
import { createRoot } from "react-dom/client";
import { useBoard } from "../board/useBoard";

// React's act environment flag, so updates flush synchronously inside act().
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** The smallest hook harness: render once, read the latest value through `current`. */
function renderHook<R>(hook: () => R): { result: { current: R } } {
  const result = {} as { current: R };
  function Probe() {
    result.current = hook();
    return null;
  }
  act(() => {
    createRoot(document.createElement("div")).render(<Probe />);
  });
  return { result };
}

type T = { id: string; rect: { x: number; y: number; w: number; h: number }; title: string; noteId?: string | null };
const tile = (id: string, x = 0): T => ({ id, rect: { x, y: 0, w: 100, h: 100 }, title: id, noteId: null });

describe("useBoard history", () => {
  it("undoes and redoes adds, and a drag is ONE step", () => {
    const { result } = renderHook(() => useBoard<T>(() => [tile("a")]));
    act(() => void result.current.addTile(tile("b", 300)));
    expect(result.current.tiles.map((t) => t.id)).toEqual(["a", "b"]);
    // a drag: many moves of one tile in quick succession
    act(() => {
      for (let i = 1; i <= 20; i++) result.current.moveTile("a", i * 5, 0);
    });
    expect(result.current.tiles[0].rect.x).toBe(100);
    act(() => result.current.undo());
    expect(result.current.tiles[0].rect.x).toBe(0); // the whole drag undone at once
    act(() => result.current.undo());
    expect(result.current.tiles.map((t) => t.id)).toEqual(["a"]);
    act(() => result.current.redo());
    expect(result.current.tiles.map((t) => t.id)).toEqual(["a", "b"]);
  });

  it("an out-of-history patch survives undo (a note never loses its record id)", () => {
    const { result } = renderHook(() => useBoard<T>(() => [tile("n")]));
    act(() => result.current.updateTile("n", { title: "Renamed" }));
    act(() => result.current.updateTile("n", { noteId: "note-1" }, { history: false }));
    act(() => result.current.undo()); // undoes the rename only
    expect(result.current.tiles[0].title).toBe("n");
    expect(result.current.tiles[0].noteId).toBe("note-1");
  });

  it("remove returns an undo that puts the tile back in place", () => {
    const { result } = renderHook(() => useBoard<T>(() => [tile("a"), tile("b"), tile("c")]));
    let putBack = () => {};
    act(() => {
      putBack = result.current.removeTile("b");
    });
    expect(result.current.tiles.map((t) => t.id)).toEqual(["a", "c"]);
    act(() => putBack());
    expect(result.current.tiles.map((t) => t.id)).toEqual(["a", "b", "c"]);
  });

  it("frames and shapes are on the same undo stack", () => {
    const { result } = renderHook(() => useBoard<T>(() => ({ tiles: [], frames: [] })));
    act(() => result.current.addFrame({ id: "f", rect: { x: 0, y: 0, w: 10, h: 10 }, title: "F" }));
    act(() => result.current.addShape({ id: "s", kind: "line", points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] }));
    act(() => result.current.undo());
    expect(result.current.shapes).toEqual([]);
    expect(result.current.frames).toHaveLength(1);
  });

  it("commands in one tick see each other (an agent's add-add, arrange-then-read)", () => {
    const { result } = renderHook(() => useBoard<T>(() => [tile("a")]));
    const board = result.current; // one render's handle, as a tool handler holds it
    act(() => {
      const r1 = board.addTile(tile("b"), { x: 50, y: 50 });
      const r2 = board.addTile(tile("c"), { x: 50, y: 50 });
      const overlap = r1.x < r2.x + r2.w && r2.x < r1.x + r1.w && r1.y < r2.y + r2.h && r2.y < r1.y + r1.h;
      expect(overlap).toBe(false);
      board.moveMany([{ id: "a", x: 900, y: 900 }]);
      expect(board.read().tiles.find((t) => t.id === "a")?.rect.x).toBe(900);
    });
    expect(result.current.tiles.map((t) => t.id)).toEqual(["a", "b", "c"]);
  });

  it("a placed tile stays out of frames unless told it may join one", () => {
    const frame = { id: "f", rect: { x: 0, y: 0, w: 1000, h: 1000 }, title: "Group" };
    const { result } = renderHook(() => useBoard<T>(() => ({ tiles: [], frames: [frame] })));
    const inside = (r: { x: number; y: number; w: number; h: number }) =>
      r.x < 1000 && r.x + r.w > 0 && r.y < 1000 && r.y + r.h > 0;
    let outside = { x: 0, y: 0, w: 0, h: 0 };
    let joined = { x: 0, y: 0, w: 0, h: 0 };
    act(() => {
      outside = result.current.addTile(tile("a"), { x: 500, y: 500 });
      joined = result.current.addTile(tile("b"), { x: 500, y: 500 }, { within: "f" });
    });
    expect(inside(outside)).toBe(false);
    expect(inside(joined)).toBe(true);
  });
});
