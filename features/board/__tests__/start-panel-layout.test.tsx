// At ~800 px the Start panel (empty board) overlapped the Add toolbar: its frame was centred over
// the whole board with only p-4. The frame now reserves the chrome band the viewport insets name
// (72 px top for the Add toolbar + zoom bar, 56 px bottom) and the panel scrolls inside what is
// left, so at any width (and height) it cannot sit under the chrome. jsdom has no layout; the guard
// reads the classes that do the work.

import { act } from "react";
import { createRoot } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { StartPanel } from "../home/AddMenu";

describe("Start panel clears the board chrome", () => {
  it("reserves the top chrome band and scrolls inside the remaining space", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    act(() => createRoot(el).render(<StartPanel types={[]} onStartNew={jest.fn()} onBringIn={jest.fn()} />));
    const frame = el.querySelector("[data-start-panel-frame]") as HTMLElement;
    expect(frame.className).toContain("pt-[72px]"); // the toolbar's 16px top + ~40px height + gap
    expect(frame.className).toContain("pb-14");
    // md up the minimap (200px, bottom-right) would meet the 672px panel until the viewport is 1104px wide
    expect(frame.className).toContain("md:pb-40");
    expect(frame.className).toContain("min-[1104px]:pb-14");
    expect(frame.className).not.toMatch(/(^|\s)p-4(\s|$)/);
    const panel = frame.querySelector("section") as HTMLElement;
    expect(panel.className).toContain("max-h-full");
    expect(panel.className).toContain("overflow-y-auto");
  });
});
