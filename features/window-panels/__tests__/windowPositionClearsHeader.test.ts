/**
 * A window that opens at the top clears the shell header — the same way every
 * time (page-pass 2026-09-27: the Feedback window opened at y=40 under a 44px
 * header, then at y=68). Break: a top pad below the header height → red.
 */
import { resolvePosition, resetDefaultWindowCascade } from "../hooks/useWindowPanel";

describe("window open position vs the shell header", () => {
  beforeEach(() => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1280 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 800 });
    document.documentElement.style.setProperty("--shell-header-h", "44px");
    resetDefaultWindowCascade();
  });

  it("top-right opens below the header, identically each time", () => {
    const a = resolvePosition("top-right", 480, 420);
    const b = resolvePosition("top-right", 480, 420);
    expect(a.y).toBeGreaterThanOrEqual(44);
    expect(b).toEqual(a);
  });

  it("the unplaced default never starts inside the header", () => {
    expect(resolvePosition(undefined, 480, 420).y).toBeGreaterThanOrEqual(44);
  });

  it("reads the header height in rem, as the shell declares it", () => {
    document.documentElement.style.setProperty("--shell-header-h", "2.75rem");
    document.documentElement.style.fontSize = "16px";
    expect(resolvePosition("top-right", 480, 420).y).toBe(44 + 12);
  });
});

it("a centred window taller than the gap never opens under the header", () => {
  Object.defineProperty(window, "innerHeight", { configurable: true, value: 800 });
  document.documentElement.style.setProperty("--shell-header-h", "44px");
  expect(resolvePosition("center", 920, 720).y).toBeGreaterThanOrEqual(44);
});
