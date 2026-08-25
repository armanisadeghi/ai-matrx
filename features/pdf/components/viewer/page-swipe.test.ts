import { resolvePageSwipe } from "./page-swipe";

describe("resolvePageSwipe", () => {
  it("advances on a decisive finger-left swipe", () => {
    expect(
      resolvePageSwipe({
        startX: 240,
        startY: 200,
        endX: 150,
        endY: 208,
        startedAt: 100,
        endedAt: 360,
      }),
    ).toBe(1);
  });

  it("goes back on a decisive finger-right swipe", () => {
    expect(
      resolvePageSwipe({
        startX: 120,
        startY: 200,
        endX: 190,
        endY: 194,
        startedAt: 100,
        endedAt: 300,
      }),
    ).toBe(-1);
  });

  it.each([
    ["short", 120, 100, 155, 102, 100, 250],
    ["vertical", 120, 100, 170, 190, 100, 250],
    ["slow", 220, 100, 120, 104, 100, 1_000],
  ])("ignores a %s gesture", (_label, startX, startY, endX, endY, startedAt, endedAt) => {
    expect(
      resolvePageSwipe({ startX, startY, endX, endY, startedAt, endedAt }),
    ).toBe(0);
  });
});
