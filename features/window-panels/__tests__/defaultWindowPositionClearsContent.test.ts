/**
 * A window nobody positioned must not open on top of the page.
 *
 * THE DEFECT (2026-09-17, found on `/exports`). `resolvePosition`'s `default`
 * arm returned the same rect as `"center"` — horizontally centred, a quarter of
 * the way down. That is precisely where every `(core)` route puts its primary
 * column, so the auto-opened "Spend so far today" window landed ON the Bring
 * your export drop zone and ate the clicks on "Choose a file"; Playwright named
 * it out loud: `WindowPanel … subtree intercepts pointer events`. Nothing about
 * it was specific to spend or to exports — every window in the registry that
 * omits `position` had the same placement, so this is guarded in the primitive
 * rather than in one window.
 *
 * The line this holds: a window that ASKED for `"center"` still gets the middle.
 * Only the ones nobody placed move.
 */

import {
  resetDefaultWindowCascade,
  resolvePosition,
} from "../hooks/useWindowPanel";

/** The content column a `(core)` route actually paints: `max-w-3xl`, centred. */
const CONTENT_COLUMN_W = 768;

function contentColumn(viewportW: number): { left: number; right: number } {
  const left = Math.max(0, (viewportW - CONTENT_COLUMN_W) / 2);
  return { left, right: left + Math.min(CONTENT_COLUMN_W, viewportW) };
}

function setViewport(width: number, height: number): void {
  Object.defineProperty(window, "innerWidth", { value: width, configurable: true });
  Object.defineProperty(window, "innerHeight", { value: height, configurable: true });
}

beforeEach(() => {
  resetDefaultWindowCascade();
  setViewport(1440, 900);
});

describe("a window nobody positioned", () => {
  it("opens clear of the page's centre line, where the primary control sits", () => {
    // The real geometry of the window that covered the drop zone.
    const w = 480;
    const h = 360;
    const { x } = resolvePosition(undefined, w, h);
    const column = contentColumn(1440);
    const centreLine = 1440 / 2;

    // THE FAILING HALF: the old default put x at (1440 - 480) / 2 = 480, so the
    // window spanned 480–960 and sat squarely over the centre line at 720 —
    // which on /exports is the "Choose a file" button.
    expect(x).toBeGreaterThan(centreLine);
    expect(x + w).toBeLessThanOrEqual(1440);

    // Honest about what this does NOT promise: a 480-wide window cannot clear a
    // 768-wide centred column on a 1440 viewport — there are only 336px of
    // gutter. It clears the centre and the whole left half; it may still overlap
    // the column's right margin, and that is a deliberate limit, not an
    // oversight. A window that must never overlap has to say where it goes.
    expect(x).toBeLessThan(column.right);
  });

  it("cascades, so the second one is not hidden behind the first", () => {
    const first = resolvePosition(undefined, 480, 360);
    const second = resolvePosition(undefined, 480, 360);

    expect(second).not.toEqual(first);
    expect(Math.abs(second.x - first.x)).toBeGreaterThan(8);
    expect(Math.abs(second.y - first.y)).toBeGreaterThan(8);
  });

  it("stays on screen on a phone, where there is no gutter to park in", () => {
    setViewport(390, 844);
    const w = 320;
    const h = 400;
    const { x, y } = resolvePosition(undefined, w, h);

    expect(x).toBeGreaterThanOrEqual(0);
    expect(y).toBeGreaterThanOrEqual(0);
    expect(x + w).toBeLessThanOrEqual(390);
    expect(y + h).toBeLessThanOrEqual(844);
    // And it is near the top rather than over the middle of the page.
    expect(y).toBeLessThan(844 / 3);
  });
});

describe("a window that asked to be centred", () => {
  it("is still centred — this fix does not overrule a window's own claim", () => {
    const w = 480;
    const h = 360;
    expect(resolvePosition("center", w, h)).toEqual({
      x: (1440 - w) / 2,
      y: (900 - h) / 4,
    });
  });

  it("still honours every explicit corner", () => {
    expect(resolvePosition("top-left", 480, 360)).toEqual({ x: 40, y: 40 });
    expect(resolvePosition("top-right", 480, 360)).toEqual({ x: 920, y: 40 });
    expect(resolvePosition("bottom-left", 480, 360)).toEqual({ x: 40, y: 500 });
    expect(resolvePosition("bottom-right", 480, 360)).toEqual({ x: 920, y: 500 });
  });
});
