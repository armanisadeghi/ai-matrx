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
    act(() => dragHeader(must(firstHeader)));
    expect(onMove).toHaveBeenCalledTimes(1);

    act(() => store.focus("tile"));
    act(() => store.unfocus());

    const returnedHeader = container.querySelector<HTMLElement>("[data-spatial-card] > div");
    expect(returnedHeader).not.toBeNull();
    expect(returnedHeader).not.toBe(firstHeader);
    act(() => dragHeader(must(returnedHeader)));
    expect(onMove).toHaveBeenCalledTimes(2);
  });
});

function must<E extends Element>(el: E | null): E {
  if (!el) throw new Error("element not rendered");
  return el;
}

function ResizeHarness({ store, onResize }: { store: SpatialStore; onResize: jest.Mock }) {
  return (
    <SpatialStoreContext.Provider value={store}>
      <FocusHostContext.Provider value={null}>
        <SpatialTile
          id="tile"
          rect={{ x: 100, y: 100, w: 400, h: 300 }}
          title="Resizable tile"
          onMove={jest.fn()}
          onResize={onResize}
        >
          {() => <div data-body>Body</div>}
        </SpatialTile>
      </FocusHostContext.Provider>
    </SpatialStoreContext.Provider>
  );
}

describe("SpatialTile frame gestures", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    for (const name of ["setPointerCapture", "releasePointerCapture"]) {
      Object.defineProperty(HTMLElement.prototype, name, { configurable: true, value: jest.fn() });
    }
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("has eight resize handles, and a left-edge drag moves the origin (scale-compensated)", () => {
    const store = new SpatialStore({ x: 0, y: 0, z: 0.5 });
    const onResize = jest.fn();
    act(() => root.render(<ResizeHarness store={store} onResize={onResize} />));
    const handles = container.querySelectorAll("[data-spatial-resize]");
    expect(handles).toHaveLength(8);
    const west = must(container.querySelector<HTMLElement>("[data-spatial-resize='w']"));
    act(() => {
      west.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, button: 0, clientX: 50, clientY: 50 }));
      west.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientX: 70, clientY: 50 }));
      west.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, clientX: 70, clientY: 50 }));
    });
    // 20 screen px at 50% = 40 world px: the left edge moves right, the right edge stays.
    expect(onResize).toHaveBeenLastCalledWith("tile", { x: 140, y: 100, w: 360, h: 300 });
    expect(store.getSelected()).toBe("tile");
  });

  it("double-click on the header flies to the tile and makes it live", () => {
    const store = new SpatialStore({ x: 0, y: 0, z: 1 });
    const fit = jest.spyOn(store, "fitItem");
    act(() => root.render(<ResizeHarness store={store} onResize={jest.fn()} />));
    const header = must(container.querySelector<HTMLElement>("[data-spatial-card] > div"));
    const title = must(header.querySelector("p"));
    act(() => {
      // The header press captures the pointer, so the browser fires the
      // dblclick at the TILE, not the header — the rule must still see "header".
      title.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, button: 0, clientX: 10, clientY: 10 }));
      title.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, clientX: 10, clientY: 10 }));
      must(container.querySelector("[data-spatial-tile]")).dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    });
    expect(fit).toHaveBeenCalledWith("tile");
    expect(store.getSelected()).toBe("tile");
    expect(store.getEditing()).toBeNull();
  });

  it("double-click in the body of an interacting tile stays native (no fly)", () => {
    const store = new SpatialStore({ x: 0, y: 0, z: 1 });
    const fit = jest.spyOn(store, "fitItem");
    act(() => root.render(<ResizeHarness store={store} onResize={jest.fn()} />));
    act(() => store.setEditing("tile"));
    const body = must(container.querySelector<HTMLElement>("[data-body]"));
    act(() => {
      body.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, button: 0 }));
      body.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    });
    expect(fit).not.toHaveBeenCalled();
    expect(store.getEditing()).toBe("tile");
  });

  it("double-click in the body of an idle tile flies and starts interacting", () => {
    const store = new SpatialStore({ x: 0, y: 0, z: 1 });
    const fit = jest.spyOn(store, "fitItem");
    act(() => root.render(<ResizeHarness store={store} onResize={jest.fn()} />));
    const body = must(container.querySelector<HTMLElement>("[data-body]"));
    act(() => {
      body.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, button: 0 }));
      body.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    });
    expect(fit).toHaveBeenCalledWith("tile");
    expect(store.getEditing()).toBe("tile");
  });
});
