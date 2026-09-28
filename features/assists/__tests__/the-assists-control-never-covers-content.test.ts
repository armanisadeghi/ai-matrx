/**
 * THE FLOATING ASSISTS CONTROL NEVER COVERS CONTENT (list-shell fix D, 2026-09-28).
 *
 * Blind judges: the desktop pill sat on the last row's ⋮ and the phone launcher
 * on card answers (/education/quizzes, /education/flashcards). The scroll area
 * under the control now gets a bottom inset as tall as the overlap, so its last
 * item scrolls fully above the control — and loses it when the control leaves.
 *
 * RED on the old code: no clearance existed (this module did not exist, and
 * the dock added no inset), so the scroller's padding stayed "".
 */
import { applyAssistClearance, clearanceFor } from "../assistClearance";

function rect(top: number, bottom: number, left: number, right: number): DOMRect {
  return { top, bottom, left, right, width: right - left, height: bottom - top, x: left, y: top, toJSON: () => ({}) } as DOMRect;
}

describe("the assists control never covers content", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("computes the overlap of a scroller's visible bottom edge with the dock", () => {
    expect(clearanceFor(rect(100, 740, 0, 1280), rect(700, 732, 1120, 1268), 800)).toBe(48);
    // A dock beside (not over) the scroller needs nothing.
    expect(clearanceFor(rect(100, 740, 0, 900), rect(700, 732, 1120, 1268), 800)).toBe(0);
  });

  it("insets the scroller under the dock and removes it when the dock goes", () => {
    const scroller = document.createElement("div");
    scroller.style.overflowY = "auto";
    const row = document.createElement("div");
    scroller.appendChild(row);
    document.body.appendChild(scroller);
    const dock = document.createElement("button");
    dock.setAttribute("data-assists-dock", "");
    document.body.appendChild(dock);

    Object.defineProperty(scroller, "scrollHeight", { value: 2000 });
    Object.defineProperty(scroller, "clientHeight", { value: 640 });
    scroller.getBoundingClientRect = () => rect(100, 740, 0, 1280);
    dock.getBoundingClientRect = () => rect(700, 732, 1120, 1268);
    Object.defineProperty(window, "innerHeight", { value: 800, configurable: true });
    (document as unknown as { elementsFromPoint: (x: number, y: number) => Element[] }).elementsFromPoint = () => [dock, row, scroller];

    applyAssistClearance();
    expect(scroller.style.paddingBottom).toBe("48px");

    dock.remove();
    applyAssistClearance();
    expect(scroller.style.paddingBottom).toBe("");
  });
});
