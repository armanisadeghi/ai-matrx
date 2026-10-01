/**
 * An idle board does no style work. The minimap used to read its theme
 * colours with getComputedStyle on a 1 s timer — a forced style flush every
 * second on a board where nothing moved — and repainted its canvas each time.
 * Colours are read when the theme changes; the picture redraws only when it
 * changed.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { SpatialStoreContext } from "../engine/react";
import { SpatialStore } from "../engine/spatial-store";
import { Minimap } from "./SpatialChrome";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLDivElement;
let fills = 0;

beforeEach(() => {
  jest.useFakeTimers();
  fills = 0;
  const ctx = {
    setTransform: () => {},
    clearRect: () => {},
    fillRect: () => {
      fills += 1;
    },
    strokeRect: () => {},
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
  };
  jest
    .spyOn(HTMLCanvasElement.prototype, "getContext")
    .mockImplementation(() => ctx as unknown as CanvasRenderingContext2D);
  window.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
  // (Jest's modern fake timers drive requestAnimationFrame too.)
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  jest.restoreAllMocks();
  jest.useRealTimers();
});

function mount(store: SpatialStore) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() =>
    root.render(
      <SpatialStoreContext.Provider value={store}>
        <Minimap />
      </SpatialStoreContext.Provider>,
    ),
  );
}

it("reads no computed style and repaints nothing while the board is idle", () => {
  const store = new SpatialStore({ x: 0, y: 0, z: 1 });
  store.setSize({ w: 1200, h: 800 });
  store.registerItem("note:a", { x: 0, y: 0, w: 400, h: 300 });
  mount(store);
  act(() => {
    jest.advanceTimersByTime(100);
  });
  const paintedOnce = fills;
  expect(paintedOnce).toBeGreaterThan(0);

  const styleReads = jest.spyOn(window, "getComputedStyle");
  act(() => {
    jest.advanceTimersByTime(10_000);
  });
  expect(styleReads).not.toHaveBeenCalled();
  expect(fills).toBe(paintedOnce);
});

it("re-reads colours and repaints when the theme flips", async () => {
  const store = new SpatialStore({ x: 0, y: 0, z: 1 });
  store.setSize({ w: 1200, h: 800 });
  store.registerItem("note:a", { x: 0, y: 0, w: 400, h: 300 });
  mount(store);
  act(() => {
    jest.advanceTimersByTime(100);
  });
  const styleReads = jest.spyOn(window, "getComputedStyle");
  await act(async () => {
    document.documentElement.classList.toggle("dark");
    await Promise.resolve();
  });
  document.documentElement.classList.toggle("dark");
  expect(styleReads).toHaveBeenCalled();
});
