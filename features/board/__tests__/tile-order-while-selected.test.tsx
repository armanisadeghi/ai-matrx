import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { BoardTile, TileLayersContext } from "../components/BoardTile";
import { BoardCameraStoreContext } from "../engine/react";
import { BoardCameraStore } from "../engine/camera-store";

/** Order is the one source of stacking: a selected tile never draws over a tile in front of it. */
describe("tile z-order while selected", () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const render = (store: BoardCameraStore, order: string[]) =>
    act(() =>
      root.render(
        <BoardCameraStoreContext.Provider value={store}>
          <TileLayersContext.Provider value={new Map(order.map((id, i) => [id, i] as const))}>
            {order.map((id, i) => (
              <BoardTile key={id} id={id} rect={{ x: i * 10, y: 0, w: 100, h: 100 }} title={id} onMove={jest.fn()} onResize={null}>
                {() => <div>{id}</div>}
              </BoardTile>
            ))}
          </TileLayersContext.Provider>
        </BoardCameraStoreContext.Provider>,
      ),
    );
  const z = (id: string) => {
    const el = [...container.querySelectorAll<HTMLElement>("[data-board-tile]")].find((e) => e.textContent?.includes(`${id}`) && e.getAttribute("data-board-tile") === id);
    return el ? Number(el.style.zIndex || 0) : NaN;
  };

  it("sent to back while selected, the tile is under the ones in front of it", () => {
    const store = new BoardCameraStore({ x: 0, y: 0, z: 1 });
    render(store, ["a", "b"]);
    act(() => store.select("a"));
    expect(z("a")).toBeGreaterThan(6); // lifted above the drawings
    act(() => store.select("b"));
    render(store, ["b", "a"]); // b sent to back
    expect(z("b")).toBeGreaterThan(6);
    expect(z("a")).toBeGreaterThan(z("b")); // a is in front of b: never under it
  });

  it("a tile behind the selection stays under the drawings", () => {
    const store = new BoardCameraStore({ x: 0, y: 0, z: 1 });
    render(store, ["a", "b", "c"]);
    act(() => store.select("b"));
    expect(z("a")).toBe(0);
    expect(z("c")).toBeGreaterThan(z("b"));
  });
});
