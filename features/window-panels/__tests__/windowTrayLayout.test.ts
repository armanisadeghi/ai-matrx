import reducer, {
  maximizeWindow,
  minimizeAll,
  minimizeWindow,
  moveTraySlot,
  popOutWindow,
  recomputeTrayPositions,
  registerWindow,
  revealWindow,
  restoreWindow,
  unregisterWindow,
  type WindowRect,
} from "@/lib/redux/slices/windowManagerSlice";
import {
  trayChipsPerRow,
  traySlotRect,
} from "@/features/window-panels/constants/tray";

const DESKTOP_WIDTH = 1280;
const DESKTOP_HEIGHT = 800;
const MOBILE_WIDTH = 390;
const MOBILE_HEIGHT = 844;

const initialRect = (index: number): WindowRect => ({
  x: 40 + index * 20,
  y: 50 + index * 20,
  width: 640,
  height: 480,
});

function stateWithMinimized(ids: string[]) {
  let state = reducer(undefined, { type: "@@INIT" });
  ids.forEach((id, index) => {
    state = reducer(state, registerWindow({ id, initial: initialRect(index) }));
    state = reducer(
      state,
      minimizeWindow({
        id,
        viewportWidth: DESKTOP_WIDTH,
        viewportHeight: DESKTOP_HEIGHT,
      }),
    );
  });
  return state;
}

describe("minimized window tray layout", () => {
  it("uses the 240×160 desktop card and wraps from right to left, then upward", () => {
    expect(trayChipsPerRow(DESKTOP_WIDTH)).toBe(5);
    expect(traySlotRect(0, DESKTOP_WIDTH, DESKTOP_HEIGHT)).toEqual({
      x: 1020,
      y: 620,
      width: 240,
      height: 160,
    });
    expect(traySlotRect(1, DESKTOP_WIDTH, DESKTOP_HEIGHT)).toEqual({
      x: 772,
      y: 620,
      width: 240,
      height: 160,
    });
    expect(traySlotRect(5, DESKTOP_WIDTH, DESKTOP_HEIGHT)).toEqual({
      x: 1020,
      y: 452,
      width: 240,
      height: 160,
    });
  });

  it("keeps the compact mobile geometry centralized in the same contract", () => {
    expect(trayChipsPerRow(MOBILE_WIDTH)).toBe(2);
    expect(traySlotRect(0, MOBILE_WIDTH, MOBILE_HEIGHT)).toEqual({
      x: 199,
      y: 752,
      width: 171,
      height: 72,
    });
  });

  it.each([
    [800, 800],
    [1280, 800],
    [390, 844],
  ])(
    "keeps all 64 supported minimized sessions reachable at %d×%d",
    (viewportWidth, viewportHeight) => {
      const rects = Array.from({ length: 64 }, (_, slot) =>
        traySlotRect(slot, viewportWidth, viewportHeight, 64),
      );
      rects.forEach((rect) => {
        expect(rect.x).toBeGreaterThanOrEqual(0);
        expect(rect.y).toBeGreaterThanOrEqual(0);
        expect(rect.x + rect.width).toBeLessThanOrEqual(viewportWidth);
        expect(rect.y + rect.height).toBeLessThanOrEqual(viewportHeight);
        expect(rect.height).toBe(32);
      });
    },
  );

  it("reflows every card into and out of compact overflow mode", () => {
    const ids = Array.from({ length: 21 }, (_, index) => `w-${index}`);
    let state = stateWithMinimized(ids);

    expect(
      Object.values(state.windows).every((win) => win.windowed.height === 32),
    ).toBe(true);

    state = reducer(state, restoreWindow("w-20"));

    expect(state.trayCount).toBe(20);
    expect(
      Object.values(state.windows)
        .filter((win) => win.state === "minimized")
        .every((win) => win.windowed.height === 160),
    ).toBe(true);
  });

  it("uses the supplied viewport when minimizing all from an empty tray", () => {
    let state = reducer(undefined, { type: "@@INIT" });
    state = reducer(
      state,
      registerWindow({ id: "a", initial: initialRect(0) }),
    );
    state = reducer(
      state,
      registerWindow({ id: "b", initial: initialRect(1) }),
    );

    state = reducer(
      state,
      minimizeAll({
        viewportWidth: MOBILE_WIDTH,
        viewportHeight: MOBILE_HEIGHT,
      }),
    );

    expect(state.trayViewport).toEqual({
      width: MOBILE_WIDTH,
      height: MOBILE_HEIGHT,
    });
    expect(state.windows.a.windowed).toEqual(
      traySlotRect(0, MOBILE_WIDTH, MOBILE_HEIGHT, 2),
    );
    expect(state.windows.b.windowed).toEqual(
      traySlotRect(1, MOBILE_WIDTH, MOBILE_HEIGHT, 2),
    );
  });

  it("compacts both slots and rectangles when a middle card is restored", () => {
    let state = stateWithMinimized(["a", "b", "c"]);
    const formerSlotOneRect = state.windows.b.windowed;

    state = reducer(state, restoreWindow("b"));

    expect(state.trayCount).toBe(2);
    expect(state.windows.a.traySlot).toBe(0);
    expect(state.windows.c.traySlot).toBe(1);
    expect(state.windows.c.windowed).toEqual(formerSlotOneRect);
    expect(state.windows.b.windowed).toEqual(initialRect(1));
  });

  it("compacts the visual layout when a minimized window unregisters", () => {
    let state = stateWithMinimized(["a", "b", "c"]);
    const formerSlotZeroRect = state.windows.a.windowed;

    state = reducer(state, unregisterWindow("a"));

    expect(state.trayCount).toBe(2);
    expect(state.windows.b.traySlot).toBe(0);
    expect(state.windows.b.windowed).toEqual(formerSlotZeroRect);
    expect(state.windows.c.traySlot).toBe(1);
  });

  it.each([
    ["maximize", maximizeWindow("b")],
    [
      "reveal",
      revealWindow({
        id: "b",
        viewportWidth: DESKTOP_WIDTH,
        viewportHeight: DESKTOP_HEIGHT,
      }),
    ],
    ["pop out", popOutWindow({ id: "b", mode: "popup" })],
  ])("compacts slots and rectangles when a middle card is %s", (_, action) => {
    let state = stateWithMinimized(["a", "b", "c"]);
    const formerSlotOneRect = state.windows.b.windowed;

    state = reducer(state, action);

    expect(state.trayCount).toBe(2);
    expect(state.windows.c.traySlot).toBe(1);
    expect(state.windows.c.windowed).toEqual(formerSlotOneRect);
  });

  it("reorders slot numbers and rectangles together and clamps invalid targets", () => {
    let state = stateWithMinimized(["a", "b", "c"]);
    const rects = [
      state.windows.a.windowed,
      state.windows.b.windowed,
      state.windows.c.windowed,
    ];

    state = reducer(state, moveTraySlot({ id: "a", toSlot: 99 }));

    expect(state.windows.b.traySlot).toBe(0);
    expect(state.windows.b.windowed).toEqual(rects[0]);
    expect(state.windows.c.traySlot).toBe(1);
    expect(state.windows.c.windowed).toEqual(rects[1]);
    expect(state.windows.a.traySlot).toBe(2);
    expect(state.windows.a.windowed).toEqual(rects[2]);
  });

  it("recomputes every card from the centralized geometry after resize", () => {
    let state = stateWithMinimized(["a", "b", "c"]);

    state = reducer(
      state,
      recomputeTrayPositions({
        viewportWidth: MOBILE_WIDTH,
        viewportHeight: MOBILE_HEIGHT,
      }),
    );

    expect(state.windows.a.windowed).toEqual(
      traySlotRect(0, MOBILE_WIDTH, MOBILE_HEIGHT),
    );
    expect(state.windows.b.windowed).toEqual(
      traySlotRect(1, MOBILE_WIDTH, MOBILE_HEIGHT),
    );
    expect(state.windows.c.windowed).toEqual(
      traySlotRect(2, MOBILE_WIDTH, MOBILE_HEIGHT),
    );
  });
});
