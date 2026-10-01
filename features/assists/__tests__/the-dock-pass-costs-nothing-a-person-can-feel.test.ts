/**
 * THE ASSISTS DOCK'S PLACEMENT PASS COSTS NOTHING A PERSON CAN FEEL (ASSISTS-DOCK-COST, 2026-10-01).
 *
 * Measured live (1440x900, dev build): the pass was ~40 ms on the data home and ~320 ms on
 * /agents/all per occurrence, one per keystroke of a search. Three causes, each counted here on a
 * full-width list with a pager (the data home's shape) while a person types and scrolls:
 *   - layout reads: 40 lift probes × hit tests, and the pager's content re-collected (a rect per
 *     element) plus 9 more hit tests for every 8 px step of the slot scan;
 *   - restyles of the whole page: placement was written as custom properties on <html>, removed
 *     and re-written on every pass (132 ms per write on /agents/all's 20k nodes);
 *   - frequency: one pass per quiet period, never one per keystroke-induced render.
 *
 * RED on the old dock (HEAD:features/assists/assistClearance.ts, mirrored in scratch): ~45 hit
 * tests and ~90 rect reads per pass, and 4 root custom-property writes per pass.
 */
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { useAssistClearance } from "../assistClearance";

type Box = { top: number; bottom: number; left: number; right: number };
const W = 1440;
const H = 900;

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const geometry = new Map<Element, Box>();
let rectReads = 0;
let hitTests = 0;

function rect(b: Box): DOMRect {
  return { ...b, width: b.right - b.left, height: b.bottom - b.top, x: b.left, y: b.top, toJSON: () => ({}) } as DOMRect;
}
function el<K extends keyof HTMLElementTagNameMap>(tag: K, box: Box | null, parent: Element = document.body) {
  const node = document.createElement(tag);
  if (box) geometry.set(node, box);
  parent.appendChild(node);
  return node;
}
const inside = (x: number, y: number, b: Box) => x >= b.left && x <= b.right && y >= b.top && y <= b.bottom;

/** The data home at 1440: header, 20 full-width rows each with copy + menu buttons, a pager bar. */
function plantDataHome() {
  // <html> has a box like every element (and carries `data-assist-dock-slot` once docked).
  geometry.set(document.documentElement, { top: 0, bottom: H, left: 0, right: W });
  const wrapper = el("div", { top: 822, bottom: 864, left: W - 12 - 156, right: W - 12 });
  wrapper.style.position = "fixed";
  const dock = el("div", { top: 822, bottom: 852, left: W - 12 - 156, right: W - 12 }, wrapper);
  dock.setAttribute("data-assists-dock", "");

  const header = el("header", { top: 0, bottom: 44, left: 0, right: W });
  const cluster = el("div", { top: 4, bottom: 40, left: W - 240, right: W }, header);
  cluster.setAttribute("data-header-right-set", "");
  el("button", { top: 6, bottom: 38, left: W - 236, right: W - 4 }, cluster);

  const main = el("main", { top: 44, bottom: H, left: 56, right: W });
  main.className = "shell-main";
  const tbody = el("tbody", { top: 210, bottom: 850, left: 56, right: W - 12 }, main);
  const rows: HTMLElement[] = [];
  for (let i = 0; i < 20; i++) {
    const top = 210 + i * 32;
    const row = el("tr", { top, bottom: top + 32, left: 56, right: W - 12 }, tbody);
    row.setAttribute("data-row-id", `r${i}`);
    // The row's own link (its name cell to the menu), then copy + menu at the right.
    const link = el("a", { top, bottom: top + 32, left: 56, right: W - 84 }, row);
    link.setAttribute("href", `/data-v2/t/r${i}`);
    el("button", { top: top + 4, bottom: top + 28, left: W - 80, right: W - 52 }, row);
    el("button", { top: top + 4, bottom: top + 28, left: W - 48, right: W - 20 }, row);
    rows.push(row);
  }
  const footer = el("div", { top: 850, bottom: 882, left: 56, right: W - 12 }, main);
  footer.setAttribute("data-matrx-table-footer", "");
  const count = el("span", { top: 858, bottom: 874, left: 72, right: 200 }, footer);
  count.textContent = "1-25 of 616";
  for (let i = 0; i < 6; i++) el("button", { top: 854, bottom: 878, left: W - 300 + i * 40, right: W - 268 + i * 40 }, footer);

  (document as unknown as { elementsFromPoint: (x: number, y: number) => Element[] }).elementsFromPoint = (x, y) => {
    hitTests += 1;
    const stack: Element[] = [];
    for (const [node, box] of geometry) if (node.isConnected && inside(x, y, box)) stack.push(node);
    // Painted order: deepest (last planted) first, the fixed dock above everything.
    stack.reverse();
    stack.sort((a, b) => Number(Boolean(b.closest("[data-assists-dock]"))) - Number(Boolean(a.closest("[data-assists-dock]"))));
    return stack;
  };
  return { main, tbody, rows };
}

describe("the assists dock's placement pass costs nothing a person can feel", () => {
  const originalRect = Element.prototype.getBoundingClientRect;
  const originalFrame = globalThis.requestAnimationFrame;
  const originalCancel = globalThis.cancelAnimationFrame;
  let rootWrites = 0;
  let restoreRoot: () => void = () => {};

  beforeEach(() => {
    jest.useFakeTimers();
    Object.defineProperty(window, "innerWidth", { configurable: true, value: W });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: H });
    Element.prototype.getBoundingClientRect = function (this: Element) {
      rectReads += 1;
      return rect(geometry.get(this) ?? { top: 0, bottom: 0, left: 0, right: 0 });
    };
    globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16) as unknown as number;
    globalThis.cancelAnimationFrame = (id) => clearTimeout(id as unknown as ReturnType<typeof setTimeout>);
    // Every write of a custom property on <html> restyles the whole page.
    const style = document.documentElement.style;
    const set = style.setProperty.bind(style);
    const remove = style.removeProperty.bind(style);
    style.setProperty = (name: string, ...rest: [string | null, string?]) => {
      if (name.startsWith("--assist-dock")) rootWrites += 1;
      return set(name, ...rest);
    };
    style.removeProperty = (name: string) => {
      if (name.startsWith("--assist-dock") && style.getPropertyValue(name) !== "") rootWrites += 1;
      return remove(name);
    };
    restoreRoot = () => {
      style.setProperty = set;
      style.removeProperty = remove;
    };
    rectReads = 0;
    hitTests = 0;
    rootWrites = 0;
  });

  afterEach(() => {
    restoreRoot();
    Element.prototype.getBoundingClientRect = originalRect;
    globalThis.requestAnimationFrame = originalFrame;
    globalThis.cancelAnimationFrame = originalCancel;
    jest.useRealTimers();
    geometry.clear();
    document.body.innerHTML = "";
    document.documentElement.removeAttribute("style");
    document.documentElement.removeAttribute("data-assist-dock-slot");
  });

  async function mountDock() {
    function Harness() {
      useAssistClearance(true);
      return null;
    }
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(createElement(Harness));
    });
    await act(async () => {
      jest.advanceTimersByTime(400);
    });
    return root;
  }

  /** Layout reads and page restyles so far. */
  function snapshot() {
    return { rectReads, hitTests, rootWrites };
  }

  it("docks in the pager, then reads layout a handful of times per keystroke burst and never restyles the page", async () => {
    const { tbody, rows } = plantDataHome();
    const root = await mountDock();
    // Settled: the control rests in the pager bar at full opacity.
    expect(document.documentElement.getAttribute("data-assist-dock-slot")).toBe("footer");

    // A person types 8 characters, 90 ms apart; each keystroke re-renders the visible rows.
    const before = snapshot();
    for (let k = 0; k < 8; k++) {
      await act(async () => {
        const row = rows[k % rows.length]!;
        row.replaceChildren(...row.children); // React swapping the row's cells
        tbody.appendChild(row);
        await Promise.resolve();
        jest.advanceTimersByTime(90);
      });
    }
    const hitsBeforeQuiet = hitTests;
    await act(async () => {
      jest.advanceTimersByTime(400);
    });
    const typed = snapshot();

    // No pass while the keys were still coming; one once they stopped (it does run: it hit-tests).
    expect(hitsBeforeQuiet - before.hitTests).toBe(0);
    expect(typed.hitTests - before.hitTests).toBeGreaterThan(0);
    // That pass reads layout a handful of times — never a probe per step, never a rect per row.
    expect(typed.hitTests - before.hitTests).toBeLessThanOrEqual(12);
    expect(typed.rectReads - before.rectReads).toBeLessThanOrEqual(40);
    // And it restyles nothing: the placement did not change, so nothing is written on <html>.
    expect(typed.rootWrites - before.rootWrites).toBe(0);
    expect(document.documentElement.getAttribute("data-assist-dock-slot")).toBe("footer");

    // A person scrolls 30 wheel steps, 50 ms apart, then stops.
    const scrollBefore = snapshot();
    for (let s = 0; s < 30; s++) {
      await act(async () => {
        tbody.dispatchEvent(new Event("scroll"));
        jest.advanceTimersByTime(50);
      });
    }
    const hitsWhileScrolling = hitTests - scrollBefore.hitTests;
    await act(async () => {
      jest.advanceTimersByTime(400);
    });
    const scrolled = snapshot();
    expect(hitsWhileScrolling).toBe(0);
    expect(scrolled.hitTests - scrollBefore.hitTests).toBeGreaterThan(0);
    expect(scrolled.hitTests - scrollBefore.hitTests).toBeLessThanOrEqual(12);
    expect(scrolled.rectReads - scrollBefore.rectReads).toBeLessThanOrEqual(40);
    expect(scrolled.rootWrites - scrollBefore.rootWrites).toBe(0);

    act(() => root.unmount());
  });

  it("never writes padding onto the page's main area, however many passes run", async () => {
    // The cards view: the page's main area scrolls, the dock rests over it (DH3-VERIFY-2: the old
    // clearance wrote padding-bottom: 398px on main.shell-main and the cards sat in a 331 px box).
    const wrapper = el("div", { top: 822, bottom: 864, left: W - 168, right: W - 12 });
    wrapper.style.position = "fixed";
    const dock = el("div", { top: 822, bottom: 852, left: W - 168, right: W - 12 }, wrapper);
    dock.setAttribute("data-assists-dock", "");
    const main = el("main", { top: 44, bottom: H, left: 56, right: W });
    main.className = "shell-main";
    main.style.overflowY = "auto";
    main.style.paddingBottom = "16px";
    Object.defineProperty(main, "scrollHeight", { value: 4000 });
    Object.defineProperty(main, "clientHeight", { value: 856 });
    const blank = el("div", { top: 44, bottom: H, left: 56, right: W }, main);
    (document as unknown as { elementsFromPoint: (x: number, y: number) => Element[] }).elementsFromPoint = (x, y) =>
      inside(x, y, geometry.get(dock)!) ? [dock, wrapper, blank, main] : [blank, main];

    const root = await mountDock();
    for (let i = 0; i < 20; i++) {
      await act(async () => {
        blank.appendChild(document.createElement("span"));
        await Promise.resolve();
        jest.advanceTimersByTime(400);
      });
    }
    expect(main.style.paddingBottom).toBe("16px");
    expect(main.hasAttribute("data-assist-clearance")).toBe(false);
    act(() => root.unmount());
  });
});
