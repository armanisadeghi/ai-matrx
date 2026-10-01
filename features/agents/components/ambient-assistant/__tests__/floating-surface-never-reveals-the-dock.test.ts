/**
 * THE PAGE ASSISTANT REVEALS ONLY FOR THE PAGE.
 *
 * Blind run PB-03 (/notes, 2026-10-01): after a right-click shortcut's window
 * closed, the page assistant's chat dock ("Type your message…") sat at the
 * bottom of the page — absent before the right-click. The reveal listens to
 * scroll in the CAPTURE phase, so the window's transcript auto-scrolling while
 * the reply streamed counted as "the person scrolled the page".
 *
 * Break it names: dropping the floating-surface check → every "inside a …"
 * case red.
 */
import { isOnFloatingSurface } from "../ScrollAssistantLauncher";

jest.mock("next/dynamic", () => () => () => null);

function inside(attrs: Record<string, string>): HTMLElement {
  const host = document.createElement("div");
  for (const [k, v] of Object.entries(attrs)) host.setAttribute(k, v);
  const scroller = document.createElement("div");
  host.appendChild(scroller);
  document.body.appendChild(host);
  return scroller;
}

describe("isOnFloatingSurface", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it.each([
    ["a dialog", { role: "dialog" }],
    ["a window panel", { "data-window-panel": "" }],
    ["a menu", { role: "menu" }],
    ["a popover", { "data-radix-popper-content-wrapper": "" }],
    ["a modal scrim", { "data-slot": "dialog-overlay" }],
  ])("ignores a scroll inside %s", (_name, attrs) => {
    expect(isOnFloatingSurface(inside(attrs))).toBe(true);
  });

  it("counts the page's own scroller", () => {
    expect(isOnFloatingSurface(inside({ class: "shell-main" }))).toBe(false);
    expect(isOnFloatingSurface(document)).toBe(false);
    expect(isOnFloatingSurface(null)).toBe(false);
  });
});
