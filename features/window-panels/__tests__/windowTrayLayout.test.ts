import reducer, {
  maximizeWindow,
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
