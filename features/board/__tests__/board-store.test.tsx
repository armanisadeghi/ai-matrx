import { act, memo } from "react";
import { createRoot } from "react-dom/client";
import { BoardStore } from "../board/board-store";
import { type Board, useBoard, useBoardLayout, useBoardStore, useBoardTile } from "../board/useBoard";

// React's act environment flag, so updates flush synchronously inside act().
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type T = { id: string; rect: { x: number; y: number; w: number; h: number }; title: string };
const tile = (id: string, x = 0): T => ({ id, rect: { x, y: 0, w: 100, h: 100 }, title: id });

/**
 * THE CLASS: a gesture (drag, resize) at pointer rate must wake ONLY the tile
 * it touches. When the board model lived in a host's useState, every frame of
 * a resize re-rendered every tile and every heavy body on the board, and a
 * real board locked up on the first resize.
 */
describe("board store — a change wakes only who reads it", () => {
  function mountBoard(ids: string[]) {
    const renders: Record<string, number> = { host: 0 };
    let store!: BoardStore<T>;
    // memo() stands in for the React Compiler, which jest does not run: in the
    // app, a tile element whose props did not change is reused the same way.
    const Tile = memo(function Tile({ board, id }: { board: BoardStore<T>; id: string }) {
      renders[id] = (renders[id] ?? 0) + 1;
      const t = useBoardTile(board, id);
      return <div data-x={t?.rect.x} data-w={t?.rect.w} />;
    });
    function Host() {
      renders.host++;
      store = useBoardStore<T>(() => ids.map((id, i) => tile(id, i * 200)));
      const layout = useBoardLayout(store);
      return (
        <>
          {layout.tileIds.map((id) => (
            <Tile key={id} board={store} id={id} />
          ))}
        </>
      );
    }
    act(() => createRoot(document.createElement("div")).render(<Host />));
    const reset = () => {
      for (const k of Object.keys(renders)) renders[k] = 0;
    };
    reset();
    return { renders, store: () => store, reset };
  }

  it("a 60-frame resize re-renders the resized tile only — never the host or its siblings", () => {
    const { renders, store } = mountBoard(["a", "b", "c"]);
    for (let i = 1; i <= 60; i++) {
      act(() => store().resizeTile("a", { x: 0, y: 0, w: 100 + i, h: 100 }));
    }
    expect(renders.a).toBe(60);
    expect(renders.b).toBe(0);
    expect(renders.c).toBe(0);
    expect(renders.host).toBe(1); // once: undo became possible on the first frame
    expect(store().getTile("a")?.rect.w).toBe(160);
  });

  it("a drag wakes the dragged tile only", () => {
    const { renders, store } = mountBoard(["a", "b"]);
    for (let i = 1; i <= 20; i++) act(() => store().moveTile("b", i * 5, 0));
    expect(renders.b).toBe(20);
    expect(renders.a).toBe(0);
    expect(renders.host).toBe(1);
  });

  it("a content change wakes that tile only; adding a tile wakes the host", () => {
    const { renders, store, reset } = mountBoard(["a", "b"]);
    act(() => store().updateTile("b", { title: "Renamed" }, { history: false }));
    expect(renders.b).toBe(1);
    expect(renders.a).toBe(0);
    expect(renders.host).toBe(0);
    reset();
    act(() => void store().addTile(tile("c", 600)));
    expect(renders.host).toBe(1);
    expect(renders.c).toBe(1);
  });

  it("the layout object is the same object across moves (nothing structural changed)", () => {
    const s = new BoardStore<T>([tile("a"), tile("b", 200)]);
    s.moveTile("a", 10, 0);
    const before = s.getLayout();
    s.moveTile("a", 20, 0);
    s.resizeTile("b", { x: 200, y: 0, w: 300, h: 300 });
    expect(s.getLayout()).toBe(before);
    s.parkTile("b");
    expect(s.getLayout()).not.toBe(before);
    expect(s.getLayout().tileIds).toEqual(["a"]);
  });

  it("renaming a PARKED tile reaches the layout (the shelf shows its title)", () => {
    const s = new BoardStore<T>({ tiles: [tile("a"), tile("p", 200)], parked: ["p"] });
    const before = s.getLayout();
    s.updateTile("p", { title: "Renamed" });
    expect(s.getLayout()).not.toBe(before);
    expect(s.getLayout().parked.map((t) => t.title)).toEqual(["Renamed"]);
  });

  it("useBoard's operations keep their identity across renders, so the compiler's memoization holds", () => {
    const seen: Board<T>[] = [];
    function Probe() {
      seen.push(useBoard<T>(() => [tile("a")]));
      return null;
    }
    act(() => createRoot(document.createElement("div")).render(<Probe />));
    act(() => seen[0].moveTile("a", 50, 0));
    const [first, last] = [seen[0], seen[seen.length - 1]];
    expect(seen.length).toBeGreaterThan(1);
    expect(last.moveTile).toBe(first.moveTile);
    expect(last.resizeTile).toBe(first.resizeTile);
    expect(last.updateTile).toBe(first.updateTile);
    expect(last.read).toBe(first.read);
  });
});
