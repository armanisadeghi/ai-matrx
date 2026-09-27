import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useState } from "react";
import { SpatialTile } from "../components/SpatialTile";
import { FocusHostContext, SpatialStoreContext } from "../engine/react";
import { SpatialStore } from "../engine/spatial-store";

function TileHarness({ store, onMove }: { store: SpatialStore; onMove: jest.Mock }) {
  const [focusHost, setFocusHost] = useState<HTMLDivElement | null>(null);
  return (
    <SpatialStoreContext.Provider value={store}>
      <FocusHostContext.Provider value={focusHost}>
        <div ref={setFocusHost} data-focus-host />
        <SpatialTile
          id="tile"
          rect={{ x: 0, y: 0, w: 320, h: 240 }}
          title="Movable tile"
          onMove={onMove}
        >
          {() => <div>Body</div>}
        </SpatialTile>
      </FocusHostContext.Provider>
    </SpatialStoreContext.Provider>
  );
}

function dragHeader(header: HTMLElement) {
  header.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, button: 0, clientX: 10, clientY: 20 }));
  header.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientX: 30, clientY: 45 }));
  header.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, clientX: 30, clientY: 45 }));
}

describe("SpatialTile focus round trip", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    Object.defineProperty(HTMLElement.prototype, "setPointerCapture", {
      configurable: true,
      value: jest.fn(),
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("keeps header dragging after the focus portal returns to the board", () => {
    const store = new SpatialStore({ x: 0, y: 0, z: 1 });
    const onMove = jest.fn();

    act(() => root.render(<TileHarness store={store} onMove={onMove} />));
    const firstHeader = container.querySelector<HTMLElement>("[data-spatial-card] > div");
    expect(firstHeader).not.toBeNull();
    act(() => dragHeader(firstHeader!));
    expect(onMove).toHaveBeenCalledTimes(1);

    act(() => store.focus("tile"));
    act(() => store.unfocus());

    const returnedHeader = container.querySelector<HTMLElement>("[data-spatial-card] > div");
    expect(returnedHeader).not.toBeNull();
    expect(returnedHeader).not.toBe(firstHeader);
    act(() => dragHeader(returnedHeader!));
    expect(onMove).toHaveBeenCalledTimes(2);
  });
});
