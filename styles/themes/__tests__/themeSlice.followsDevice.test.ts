/**
 * THE THEME CONTRACT (2026-10-01 phone run): the app follows the device unless
 * the person chose a theme. A fresh browser — no saved `matrx:theme` — must
 * hold "system" in Redux and paint whatever the device prefers; a saved
 * explicit choice wins over the device.
 *
 * Mutation: set the slice's initialState (or `deserialize`'s fallback) back to
 * "dark" — the first two cases go RED.
 */
import { applyPrePaintDescriptors } from "@/lib/sync/engine/applyPrePaint";
import themeReducer, { themePolicy } from "@/styles/themes/themeSlice";

const originalMatchMedia = window.matchMedia;

function deviceIs(dark: boolean) {
  Object.defineProperty(window, "matchMedia", {
    value: (query: string) =>
      ({ matches: query.includes("dark") ? dark : false, media: query } as MediaQueryList),
    configurable: true,
    writable: true,
  });
}

afterEach(() => {
  document.documentElement.className = "";
  document.documentElement.removeAttribute("data-theme");
  Object.defineProperty(window, "matchMedia", {
    value: originalMatchMedia,
    configurable: true,
    writable: true,
  });
});

describe("theme follows the device unless the person chose", () => {
  it("a fresh browser holds the 'system' preference", () => {
    const state = themeReducer(undefined, { type: "@@INIT" });
    expect(state.mode).toBe("system");
  });

  it("an unreadable saved value falls back to 'system', never a hardcoded colour", () => {
    expect(themePolicy.config.deserialize?.(undefined)).toEqual({ mode: "system" });
    expect(themePolicy.config.deserialize?.({ mode: "purple" })).toEqual({ mode: "system" });
  });

  it.each([
    [true, "dark"],
    [false, "light"],
  ] as const)("device dark=%s paints %s for a fresh browser", (dark, painted) => {
    deviceIs(dark);
    const state = themeReducer(undefined, { type: "@@INIT" });
    applyPrePaintDescriptors(themePolicy.prePaintDescriptors, state as unknown as Record<string, unknown>);
    expect(document.documentElement.getAttribute("data-theme")).toBe(painted);
    expect(document.documentElement.classList.contains("dark")).toBe(dark);
  });

  it("an explicit choice wins over the device", () => {
    deviceIs(true);
    applyPrePaintDescriptors(themePolicy.prePaintDescriptors, { mode: "light" });
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });
});
