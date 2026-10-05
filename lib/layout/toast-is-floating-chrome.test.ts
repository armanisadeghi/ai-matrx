/**
 * A toast is floating chrome (round-3 final check, 2026-10-05: the usage-limit toast covered /cms
 * cards at 375 with nothing else floating). While it shows, the page's runway grows by it; the
 * toast itself rests on a measure that excludes the toasts, or it would lift itself without end.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { FLOATING_BELOW_TOASTS_VAR, FLOATING_BOTTOM_SELECTOR, FLOATING_TOAST_SELECTOR, floatingBottomBoxes, measureFloatingClearance } from "./floating-chrome";

const SHELL_CSS = readFileSync(resolve(__dirname, "../../styles/shell.css"), "utf8");
const SONNER = readFileSync(resolve(__dirname, "../../components/ui/sonner.tsx"), "utf8");

describe("a toast is floating chrome", () => {
  it("a showing toast counts toward the page's runway", () => {
    Object.defineProperty(window, "innerHeight", { value: 812, configurable: true });
    const toast = document.createElement("li");
    toast.setAttribute("data-sonner-toast", "");
    toast.getBoundingClientRect = () =>
      ({ top: 720, bottom: 796, left: 16, right: 359, width: 343, height: 76, x: 16, y: 720, toJSON: () => ({}) }) as DOMRect;
    document.body.appendChild(toast);
    expect(toast.matches(FLOATING_BOTTOM_SELECTOR)).toBe(true);
    expect(measureFloatingClearance(floatingBottomBoxes(), 812)).toBe(92);
    toast.setAttribute("data-removed", "true");
    expect(toast.matches(FLOATING_BOTTOM_SELECTOR)).toBe(false);
    toast.remove();
  });

  it("the toast stack rests on the measure WITHOUT the toasts", () => {
    expect(FLOATING_TOAST_SELECTOR).toBe("[data-sonner-toast]");
    const block = /--matrx-toast-clearance:\s*calc\(([\s\S]*?)\);/.exec(SHELL_CSS)?.[1] ?? "";
    expect(block).toContain(`var(${FLOATING_BELOW_TOASTS_VAR}`);
    expect(block).not.toContain("--matrx-floating-measured");
    expect(SONNER.match(/var\(--matrx-toast-clearance\)/g)?.length).toBe(2);
    expect(SONNER).not.toMatch(/bottom:\s*"max\([^"]*--matrx-floating-clearance/);
  });
});
