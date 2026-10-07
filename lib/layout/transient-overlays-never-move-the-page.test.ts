/**
 * Transient overlays never move the page (owner, 2026-10-06: toasts and the open assists panel
 * added an empty band at the bottom of every page while they showed). Only chrome that stays put
 * is measured into the page's runway; a toast or an open panel floats OVER the page.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { FLOATING_BOTTOM_SELECTOR, TRANSIENT_OVERLAY_SELECTOR, floatingBottomBoxes, measureFloatingClearance } from "./floating-chrome";

const ASSISTS_DOCK = readFileSync(resolve(__dirname, "../../features/assists/components/AssistsDock.tsx"), "utf8");
const SONNER = readFileSync(resolve(__dirname, "../../components/ui/sonner.tsx"), "utf8");

describe("transient overlays never move the page", () => {
  it("a showing toast adds nothing to the page's runway", () => {
    Object.defineProperty(window, "innerHeight", { value: 812, configurable: true });
    const toaster = document.createElement("ol");
    toaster.setAttribute("data-sonner-toaster", "");
    const toast = document.createElement("li");
    toast.setAttribute("data-sonner-toast", "");
    toast.getBoundingClientRect = () =>
      ({ top: 720, bottom: 796, left: 16, right: 359, width: 343, height: 76, x: 16, y: 720, toJSON: () => ({}) }) as DOMRect;
    toaster.appendChild(toast);
    document.body.appendChild(toaster);
    expect(toast.matches(TRANSIENT_OVERLAY_SELECTOR)).toBe(true);
    expect(toast.matches(FLOATING_BOTTOM_SELECTOR)).toBe(false);
    expect(measureFloatingClearance(floatingBottomBoxes(), 812)).toBe(0);
    toaster.remove();
  });

  it("no transient overlay carries the floating-chrome marker", () => {
    for (const marker of ["data-sonner-toast", "data-sonner-toaster"]) {
      expect(FLOATING_BOTTOM_SELECTOR).not.toContain(marker);
    }
    expect(SONNER).not.toMatch(/data-matrx-floating-bottom/);
  });

  it("the assists dock measures its pill, never the container that holds the open panel", () => {
    const container = /"pointer-events-none fixed z-40 hidden flex-col[\s\S]*?>\n/.exec(ASSISTS_DOCK)?.[0] ?? "";
    expect(container).not.toBe("");
    expect(container).not.toContain("data-matrx-floating-bottom");
    const pill = /<div\s+data-assists-dock=""[\s\S]*?className=/.exec(ASSISTS_DOCK)?.[0] ?? "";
    expect(pill).toContain('data-matrx-floating-bottom=""');
  });
});
