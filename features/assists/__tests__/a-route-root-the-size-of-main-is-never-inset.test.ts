/**
 * A ROUTE ROOT THE SIZE OF <main> IS NEVER INSET (2026-10-06).
 *
 * The agent builder renders inside one `h-full overflow-y-auto` wrapper that fills <main>. A second
 * after load the resting assists control sat over it, the wrapper got `padding-bottom` as tall as
 * the overlap, and both `h-full` columns shrank — a ~100 px empty band at the bottom of the page.
 * A box that IS main's box is the page's main area: never inset. An inner scroller still is.
 *
 * RED on the old code: only <main> and its ancestors were exempt, so the wrapper got "98px".
 */
import { applyAssistClearance } from "../assistClearance";

function rect(top: number, bottom: number, left: number, right: number): DOMRect {
  return { top, bottom, left, right, width: right - left, height: bottom - top, x: left, y: top, toJSON: () => ({}) } as DOMRect;
}

function asScroller(el: HTMLElement, box: DOMRect) {
  el.style.overflowY = "auto";
  Object.defineProperty(el, "scrollHeight", { value: 2000 });
  Object.defineProperty(el, "clientHeight", { value: box.height });
  el.getBoundingClientRect = () => box;
}

describe("a route root the size of main is never inset", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  function mount(rootBox: DOMRect) {
    const main = document.createElement("main");
    main.getBoundingClientRect = () => rect(0, 1150, 80, 2000);
    const root = document.createElement("div");
    const column = document.createElement("div");
    root.appendChild(column);
    main.appendChild(root);
    document.body.appendChild(main);
    const dock = document.createElement("button");
    dock.setAttribute("data-assists-dock", "");
    document.body.appendChild(dock);
    asScroller(root, rootBox);
    dock.getBoundingClientRect = () => rect(1060, 1090, 1845, 1985);
    Object.defineProperty(window, "innerHeight", { value: 1150, configurable: true });
    (document as unknown as { elementsFromPoint: (x: number, y: number) => Element[] }).elementsFromPoint = () => [
      dock,
      column,
      root,
      main,
    ];
    return root;
  }

  it("leaves the wrapper that fills <main> alone", () => {
    const root = mount(rect(0, 1150, 80, 2000));
    applyAssistClearance();
    expect(root.style.paddingBottom).toBe("");
  });

  it("still insets a real inner scroller under the control", () => {
    const inner = mount(rect(200, 1150, 1000, 2000));
    applyAssistClearance();
    expect(inner.style.paddingBottom).toBe("98px");
  });
});
