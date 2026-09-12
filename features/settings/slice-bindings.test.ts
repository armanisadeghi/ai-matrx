import { applyPrePaintDescriptors } from "@/lib/sync/engine/applyPrePaint";
import themeReducer, { themePolicy } from "@/styles/themes/themeSlice";
import { sliceBindings } from "./slice-bindings";

const originalMatchMedia = window.matchMedia;

afterEach(() => {
  document.documentElement.className = "";
  document.documentElement.removeAttribute("data-theme");
  Object.defineProperty(window, "matchMedia", {
    value: originalMatchMedia,
    configurable: true,
    writable: true,
  });
});

describe.each([
  ["light", true, "dark"],
  ["light", false, "dark"],
  ["dark", true, "light"],
  ["dark", false, "light"],
  ["system", true, "light"],
  ["system", false, "dark"],
] as const)("theme.toggle (%s preference, OS dark=%s)", (mode, osDark, expected) => {
  it("uses the effective painted mode for the binding and Redux action", () => {
    Object.defineProperty(window, "matchMedia", {
      value: () => ({ matches: osDark } as MediaQueryList),
      configurable: true,
      writable: true,
    });
    applyPrePaintDescriptors(themePolicy.prePaintDescriptors, { mode });

    const action = sliceBindings.theme.write("toggle", undefined);
    const next = themeReducer({ mode }, action);

    expect(next.mode).toBe(expected);
  });
});
