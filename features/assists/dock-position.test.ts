import {
  clampDockOffset,
  DEFAULT_DOCK_OFFSET,
  DEFAULT_DOCK_OFFSET_MOBILE,
  defaultDockOffset,
  DOCK_MIN_VISIBLE,
  isDrag,
  offsetFromDrag,
} from "./dock-position";

const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };

describe("clampDockOffset", () => {
  it("leaves a legal offset alone", () => {
    expect(clampDockOffset({ right: 300, bottom: 200 }, DESKTOP)).toEqual({
      right: 300,
      bottom: 200,
    });
  });

  it("pulls a negative offset back onto the screen", () => {
    expect(clampDockOffset({ right: -80, bottom: -20 }, DESKTOP)).toEqual({
      right: 0,
      bottom: 0,
    });
  });

  it("keeps the grab area reachable at the far edges", () => {
    const clamped = clampDockOffset({ right: 9999, bottom: 9999 }, DESKTOP);
    expect(clamped.right).toBe(DESKTOP.width - DOCK_MIN_VISIBLE.width);
    expect(clamped.bottom).toBe(DESKTOP.height - DOCK_MIN_VISIBLE.height);
  });

  it("survives a position saved on a bigger monitor", () => {
    // The whole reason clamping runs on every render, not only on drop.
    const fromBigScreen = { right: 2400, bottom: 1300 };
    const clamped = clampDockOffset(fromBigScreen, PHONE);
    expect(clamped.right).toBeLessThanOrEqual(PHONE.width);
    expect(clamped.bottom).toBeLessThanOrEqual(PHONE.height);
  });
});

describe("offsetFromDrag", () => {
  it("moves WITH the pointer, not against it", () => {
    // Dragging left (negative dx) increases the right-offset.
    const moved = offsetFromDrag({ right: 100, bottom: 100 }, -40, -30, DESKTOP);
    expect(moved).toEqual({ right: 140, bottom: 130 });
  });

  it("clamps mid-drag so the dock cannot be thrown off-screen", () => {
    const moved = offsetFromDrag({ right: 10, bottom: 10 }, 500, 500, DESKTOP);
    expect(moved).toEqual({ right: 0, bottom: 0 });
  });
});

describe("isDrag", () => {
  it("treats a small wobble as a click", () => {
    expect(isDrag(0, 0)).toBe(false);
    expect(isDrag(3, -2)).toBe(false);
  });

  it("treats real movement as a drag on either axis", () => {
    expect(isDrag(6, 0)).toBe(true);
    expect(isDrag(0, -9)).toBe(true);
  });
});

describe("defaultDockOffset", () => {
  it("parks the dock above the mobile composer band", () => {
    expect(defaultDockOffset(PHONE)).toEqual(DEFAULT_DOCK_OFFSET_MOBILE);
    expect(defaultDockOffset(DESKTOP)).toEqual(DEFAULT_DOCK_OFFSET);
  });
});
