/**
 * A LIST WITHOUT A PAGER STILL DOCKS THE ASSISTS CONTROL IN A SLOT, NEVER OVER A ROW (DH3-VERIFY-2).
 *
 * The data home's grouped view and cards view render no pager bar. The old dock only avoided
 * CONTROLS, so on the grouped table it rested over a group header's empty end ("Checklist 7 items",
 * admin, 1440) and on the cards view over a card's text: both are rows of the list. A row is never
 * a free spot; with no pager the control rests in the header beside its right cluster, at full
 * opacity.
 *
 * RED on the old dock: no `data-assist-dock-slot`; the control stayed floating over the row.
 */
import { applyAssistDockLift, dockPlacementVar } from "../assistClearance";

type Box = { top: number; bottom: number; left: number; right: number };
const W = 1440;
const H = 900;
const geometry = new Map<Element, Box>();

function rect(b: Box): DOMRect {
  return { ...b, width: b.right - b.left, height: b.bottom - b.top, x: b.left, y: b.top, toJSON: () => ({}) } as DOMRect;
}
function el<K extends keyof HTMLElementTagNameMap>(tag: K, box: Box, parent: Element = document.body) {
  const node = document.createElement(tag);
  geometry.set(node, box);
  node.getBoundingClientRect = () => rect(box);
  parent.appendChild(node);
  return node;
}
const inside = (x: number, y: number, b: Box) => x >= b.left && x <= b.right && y >= b.top && y <= b.bottom;

/** Header with a title and its right cluster; the dock floating bottom-right. */
function plantChrome() {
  const header = el("header", { top: 0, bottom: 44, left: 0, right: W });
  const title = el("span", { top: 12, bottom: 32, left: 56, right: 200 }, header);
  title.textContent = "Data";
  const cluster = el("div", { top: 4, bottom: 40, left: W - 240, right: W }, header);
  cluster.setAttribute("data-header-right-set", "");
  el("button", { top: 6, bottom: 38, left: W - 236, right: W - 4 }, cluster);
  const dock = el("div", { top: 750, bottom: 780, left: W - 168, right: W - 12 });
  dock.setAttribute("data-assists-dock", "");
  (document as unknown as { elementsFromPoint: (x: number, y: number) => Element[] }).elementsFromPoint = (x, y) => {
    const stack: Element[] = [];
    for (const [node, box] of geometry) if (node.isConnected && inside(x, y, box)) stack.push(node);
    stack.reverse();
    stack.sort((a, b) => Number(Boolean(b.closest("[data-assists-dock]"))) - Number(Boolean(a.closest("[data-assists-dock]"))));
    return stack;
  };
  return { dock };
}

function expectHeaderSlot(dock: Element) {
  expect(dock.hasAttribute("data-assist-dock-yield")).toBe(false); // full opacity, takes clicks
  expect(document.documentElement.getAttribute("data-assist-dock-slot")).toBe("header");
  const top = Number.parseFloat(dockPlacementVar("--assist-dock-slot-top"));
  const right = W - Number.parseFloat(dockPlacementVar("--assist-dock-slot-right"));
  expect(top).toBeGreaterThanOrEqual(0);
  expect(top + 30).toBeLessThanOrEqual(44);
  expect(right).toBeLessThanOrEqual(W - 240); // left of the right cluster
  expect(right - 156).toBeGreaterThan(200); // right of the title
}

describe("a list without a pager docks the assists control in a slot", () => {
  beforeEach(() => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: W });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: H });
  });
  afterEach(() => {
    geometry.clear();
    document.body.innerHTML = "";
    document.documentElement.removeAttribute("style");
    document.documentElement.removeAttribute("data-assist-dock-slot");
  });

  it("grouped table: never rests on a group header's empty end", () => {
    const { dock } = plantChrome();
    const tbody = el("tbody", { top: 212, bottom: 900, left: 56, right: W - 12 });
    for (let i = 0; i < 17; i++) {
      const top = 212 + i * 41;
      const group = i === 13 || i % 6 === 0;
      const row = el("tr", { top, bottom: top + 41, left: 56, right: W - 12 }, tbody);
      if (group) {
        // "Checklist  7 items": a toggle at the left, nothing at the right end.
        row.setAttribute("data-matrx-table-group-row", "");
        el("button", { top: top + 8, bottom: top + 32, left: 64, right: 220 }, row);
      } else {
        row.setAttribute("data-row-id", `r${i}`);
        el("button", { top: top + 8, bottom: top + 32, left: W - 64, right: W - 40 }, row);
      }
    }
    // The dock's resting place falls on a group header's empty end (no control under it).
    const restingRow = [...tbody.children].find((r) => {
      const b = geometry.get(r)!;
      return b.top <= 750 && b.bottom >= 780;
    });
    expect(restingRow?.hasAttribute("data-matrx-table-group-row") || restingRow?.hasAttribute("data-row-id")).toBe(true);

    applyAssistDockLift();
    expectHeaderSlot(dock);
  });

  it("cards view: never rests on a card", () => {
    const { dock } = plantChrome();
    const grid = el("div", { top: 172, bottom: 1400, left: 56, right: W - 12 });
    for (let r = 0; r < 12; r++) {
      for (let c = 0; c < 4; c++) {
        const left = 56 + c * 345;
        const top = 172 + r * 102;
        const card = el("div", { top, bottom: top + 92, left, right: left + 336 }, grid);
        card.setAttribute("data-row-id", `c${r}-${c}`);
        el("button", { top: top + 14, bottom: top + 38, left: left + 260, right: left + 284 }, card);
        el("button", { top: top + 14, bottom: top + 38, left: left + 296, right: left + 320 }, card);
      }
    }
    applyAssistDockLift();
    expectHeaderSlot(dock);
  });
});
