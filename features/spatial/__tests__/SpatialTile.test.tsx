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
          onResize={null}
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

/** A mouse pointer event (jsdom has no PointerEvent): pointerId 1, type "mouse". */
function mouse(type: string, init: { clientX: number; clientY: number; buttons: number }): MouseEvent {
  const ev = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, ...init });
  Object.defineProperty(ev, "pointerId", { value: 1 });
  Object.defineProperty(ev, "pointerType", { value: "mouse" });
  return ev;
}

function must<E extends Element>(el: E | null): E {
  if (!el) throw new Error("element not rendered");
  return el;
}

/** A store whose viewport shows the tile, so it renders at a reading tier. */
function onScreenStore(cam: { x: number; y: number; z: number }): SpatialStore {
  const store = new SpatialStore(cam);
  store.setSize({ w: 4000, h: 4000 });
  return store;
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

  /**
   * THE STUCK GESTURE: a resize (or drag) that ends only when one pointerup
   * reaches one element stayed open forever when that release was missed —
   * the page-wide shield stayed up, the cursor stayed a resize arrow and the
   * board took no more clicks (Arman, 2026-10-01). Every way a press can end
   * must end it.
   */
  it("a resize whose release is never delivered ends on the next move with the button up", () => {
    const store = onScreenStore({ x: 0, y: 0, z: 1 });
    const onResize = jest.fn();
    act(() => root.render(<ResizeHarness store={store} onResize={onResize} />));
    act(() => store.recomputeCoarse());
    const se = must(container.querySelector<HTMLElement>("[data-spatial-resize='se']"));
    act(() => {
      se.dispatchEvent(mouse("pointerdown", { clientX: 500, clientY: 400, buttons: 1 }));
      se.dispatchEvent(mouse("pointermove", { clientX: 520, clientY: 420, buttons: 1 }));
    });
    expect(document.querySelector("[data-spatial-resize-shield]")).not.toBeNull();
    expect(onResize).toHaveBeenLastCalledWith("tile", { x: 100, y: 100, w: 420, h: 320 });
    // The release went somewhere we never heard; the next move reports no button.
    act(() => {
      window.dispatchEvent(mouse("pointermove", { clientX: 600, clientY: 500, buttons: 0 }));
    });
    expect(document.querySelector("[data-spatial-resize-shield]")).toBeNull();
    expect(onResize).toHaveBeenCalledTimes(1); // the stray move did not resize
  });

  it("a resize ends when the window loses focus, and Escape puts the tile back", () => {
    const store = onScreenStore({ x: 0, y: 0, z: 1 });
    const onResize = jest.fn();
    act(() => root.render(<ResizeHarness store={store} onResize={onResize} />));
    act(() => store.recomputeCoarse());
    const e = must(container.querySelector<HTMLElement>("[data-spatial-resize='e']"));
    act(() => {
      e.dispatchEvent(mouse("pointerdown", { clientX: 500, clientY: 200, buttons: 1 }));
      window.dispatchEvent(new Event("blur"));
    });
    expect(document.querySelector("[data-spatial-resize-shield]")).toBeNull();

    act(() => {
      e.dispatchEvent(mouse("pointerdown", { clientX: 500, clientY: 200, buttons: 1 }));
      window.dispatchEvent(mouse("pointermove", { clientX: 560, clientY: 200, buttons: 1 }));
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(document.querySelector("[data-spatial-resize-shield]")).toBeNull();
    expect(onResize).toHaveBeenLastCalledWith("tile", { x: 100, y: 100, w: 400, h: 300 });
  });

  it("a tile drag whose release is never delivered stops following the cursor", () => {
    const store = onScreenStore({ x: 0, y: 0, z: 1 });
    const onMove = jest.fn();
    act(() =>
      root.render(
        <SpatialStoreContext.Provider value={store}>
          <FocusHostContext.Provider value={null}>
            <SpatialTile id="tile" rect={{ x: 100, y: 100, w: 400, h: 300 }} title="T" onMove={onMove} onResize={null}>
              {() => <div>Body</div>}
            </SpatialTile>
          </FocusHostContext.Provider>
        </SpatialStoreContext.Provider>,
      ),
    );
    const header = must(container.querySelector<HTMLElement>("[data-spatial-card] > div"));
    act(() => {
      header.dispatchEvent(mouse("pointerdown", { clientX: 150, clientY: 110, buttons: 1 }));
      window.dispatchEvent(mouse("pointermove", { clientX: 160, clientY: 120, buttons: 1 }));
    });
    expect(onMove).toHaveBeenCalledTimes(1);
    act(() => {
      window.dispatchEvent(mouse("pointermove", { clientX: 300, clientY: 300, buttons: 0 }));
      window.dispatchEvent(mouse("pointermove", { clientX: 320, clientY: 320, buttons: 0 }));
    });
    expect(onMove).toHaveBeenCalledTimes(1);
  });

  it("has eight resize handles, and a left-edge drag moves the origin (scale-compensated)", () => {
    const store = onScreenStore({ x: 0, y: 0, z: 0.5 });
    const onResize = jest.fn();
    act(() => root.render(<ResizeHarness store={store} onResize={onResize} />));
    act(() => store.recomputeCoarse());
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
    const store = onScreenStore({ x: 0, y: 0, z: 1 });
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
    const store = onScreenStore({ x: 0, y: 0, z: 1 });
    const fit = jest.spyOn(store, "fitItem");
    act(() => root.render(<ResizeHarness store={store} onResize={jest.fn()} />));
    act(() => store.recomputeCoarse());
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
    const store = onScreenStore({ x: 0, y: 0, z: 1 });
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

describe("SpatialTile frame edge", () => {
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

  it("a double-click on the frame edge (a resize handle) flies like the header", () => {
    // At far zoom the edge handles cover most of a tiny header; the edge is
    // the tile's frame, so it must fly too.
    const store = onScreenStore({ x: 0, y: 0, z: 1 });
    const fit = jest.spyOn(store, "fitItem");
    act(() => root.render(<ResizeHarness store={store} onResize={jest.fn()} />));
    act(() => store.recomputeCoarse());
    const north = must(container.querySelector<HTMLElement>("[data-spatial-resize='n']"));
    act(() => {
      north.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, button: 0, clientX: 5, clientY: 5 }));
      north.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, clientX: 5, clientY: 5 }));
      north.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    });
    expect(fit).toHaveBeenCalledWith("tile");
    expect(store.getSelected()).toBe("tile");
  });

  it("at overview zoom an unselected tile shows no handles (a drag moves it), the selected one does", () => {
    const store = onScreenStore({ x: 0, y: 0, z: 0.1 });
    act(() => root.render(<ResizeHarness store={store} onResize={jest.fn()} />));
    act(() => store.recomputeCoarse());
    expect(container.querySelectorAll("[data-spatial-resize]")).toHaveLength(0);
    act(() => store.select("tile"));
    expect(container.querySelectorAll("[data-spatial-resize]")).toHaveLength(8);
  });

  it("a finger on the body selects without dragging (the content scrolls natively)", () => {
    const store = onScreenStore({ x: 0, y: 0, z: 1 });
    const onMove = jest.fn();
    act(() =>
      root.render(
        <SpatialStoreContext.Provider value={store}>
          <FocusHostContext.Provider value={null}>
            <SpatialTile id="tile" rect={{ x: 100, y: 100, w: 400, h: 300 }} title="t" onMove={onMove} onResize={null}>
              {() => <div data-body>Body</div>}
            </SpatialTile>
          </FocusHostContext.Provider>
        </SpatialStoreContext.Provider>,
      ),
    );
    act(() => store.recomputeCoarse());
    const body = must(container.querySelector<HTMLElement>("[data-body]"));
    const touch = (type: string, x: number) => {
      const e = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: 50 });
      Object.defineProperty(e, "pointerType", { value: "touch" });
      return e;
    };
    let down!: MouseEvent;
    act(() => {
      down = touch("pointerdown", 50);
      body.dispatchEvent(down);
      body.dispatchEvent(touch("pointermove", 90));
      body.dispatchEvent(touch("pointerup", 90));
    });
    expect(onMove).not.toHaveBeenCalled();
    expect(down.defaultPrevented).toBe(false);
    expect(store.getSelected()).toBe("tile");
    expect(must(container.querySelector<HTMLElement>("[data-spatial-body]")).style.touchAction).toBe("pan-x pan-y");
  });
});
