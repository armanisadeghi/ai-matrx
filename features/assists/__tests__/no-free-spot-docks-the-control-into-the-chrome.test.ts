/**
 * NO FREE SPOT → THE ASSISTS CONTROL DOCKS INTO THE PAGE'S CHROME (chair ruling, 2026-10-01).
 *
 * On a full-width list every row has copy + menu buttons at the right, so every lift within reach
 * covers a control. The old dock then YIELDED: faded to 30 % and click-through, half-visible over
 * the last row's actions (data home, row "Visit Log 300 1797"). The dock now rests in the pager
 * bar's empty space — or, with no footer, in the header beside its right cluster — at full
 * opacity and over nothing the bar shows.
 *
 * RED on the old dock: `data-assist-dock-yield` was set and no `--assist-dock-slot-*` was written.
 */
import { applyAssistDockLift, slotSpotFor } from "../assistClearance";

type Box = { top: number; bottom: number; left: number; right: number };
const W = 1024;
const H = 768;

function rect({ top, bottom, left, right }: Box): DOMRect {
  return { top, bottom, left, right, width: right - left, height: bottom - top, x: left, y: top, toJSON: () => ({}) } as DOMRect;
}
function el<K extends keyof HTMLElementTagNameMap>(tag: K, box: Box | null, parent: Element = document.body) {
  const node = document.createElement(tag);
  node.getBoundingClientRect = () => (box ? rect(box) : rect({ top: 0, bottom: 0, left: 0, right: 0 }));
  parent.appendChild(node);
  return node;
}
const inside = (x: number, y: number, b: Box) => x >= b.left && x <= b.right && y >= b.top && y <= b.bottom;
const rootVar = (name: string) => document.documentElement.style.getPropertyValue(name);

/** The dock pill at its floating resting place: bottom-right, just above the pager. */
const DOCK: Box = { top: 690, bottom: 720, left: W - 12 - 136, right: W - 12 };

/**
 * A full-width list: from the header down to the pager, every point is a row's button (copy + menu
 * at the right, the row's own link everywhere else), so no lift is free.
 */
function plantFullWidthList(opts: { footer: boolean }) {
  const dock = el("div", DOCK);
  dock.setAttribute("data-assists-dock", "");
  const rowButton = el("button", { top: 64, bottom: 736, left: 0, right: W });

  const header = el("header", { top: 0, bottom: 48, left: 0, right: W });
  const title = el("span", { top: 12, bottom: 36, left: 56, right: 300 }, header);
  title.textContent = "Data";
  const cluster = el("div", { top: 4, bottom: 44, left: W - 200, right: W }, header);
  cluster.setAttribute("data-header-right-set", "");
  const search = el("button", { top: 8, bottom: 40, left: W - 196, right: W - 4 }, cluster);

  let footer: HTMLElement | null = null;
  let count: HTMLElement | null = null;
  let next: HTMLButtonElement | null = null;
  if (opts.footer) {
    footer = el("div", { top: 736, bottom: 768, left: 0, right: W });
    footer.setAttribute("data-matrx-table-footer", "");
    count = el("span", { top: 744, bottom: 760, left: 16, right: 120 }, footer);
    count.textContent = "1–50 of 300";
    next = el("button", { top: 740, bottom: 764, left: 900, right: 1010 }, footer);
  }

  (document as unknown as { elementsFromPoint: (x: number, y: number) => Element[] }).elementsFromPoint = (x, y) => {
    const hits: Element[] = [];
    if (inside(x, y, DOCK)) hits.push(dock);
    if (next && inside(x, y, { top: 740, bottom: 764, left: 900, right: 1010 })) hits.push(next);
    else if (footer && y >= 736) hits.push(count && inside(x, y, { top: 744, bottom: 760, left: 16, right: 120 }) ? count : footer);
    else if (y >= 64 && y < 736) hits.push(rowButton);
    else if (y < 48) hits.push(inside(x, y, { top: 8, bottom: 40, left: W - 196, right: W - 4 }) ? search : header);
    return hits;
  };
  return { dock };
}

describe("no free spot: the assists control docks into the page's chrome", () => {
  beforeEach(() => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: W });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: H });
  });
  afterEach(() => {
    document.body.innerHTML = "";
    const root = document.documentElement;
    root.removeAttribute("style");
    root.removeAttribute("data-assist-dock-slot");
  });

  it("rests in the pager bar's empty space at full opacity on a full-width list", () => {
    const { dock } = plantFullWidthList({ footer: true });
    applyAssistDockLift();

    expect(dock.hasAttribute("data-assist-dock-yield")).toBe(false); // full opacity, takes clicks
    expect(document.documentElement.getAttribute("data-assist-dock-slot")).toBe("footer");
    const right = W - Number.parseFloat(rootVar("--assist-dock-slot-right"));
    const bottom = H - Number.parseFloat(rootVar("--assist-dock-slot-bottom"));
    const left = right - (DOCK.right - DOCK.left);
    const top = bottom - (DOCK.bottom - DOCK.top);
    // Inside the pager bar…
    expect(top).toBeGreaterThanOrEqual(736);
    expect(bottom).toBeLessThanOrEqual(768);
    // …clear of the pager buttons and the count, nearest the right edge.
    expect(right).toBeLessThan(900);
    expect(left).toBeGreaterThan(120);
    expect(right).toBeGreaterThan(860);
    expect(rootVar("--assist-dock-lift")).toBe("");
  });

  it("places the pill itself in the bar when it sits inside a padded fixed wrapper", () => {
    const { dock } = plantFullWidthList({ footer: true });
    // The desktop pill lives in a fixed wrapper with 12 px safe-area padding below it.
    const wrapper = el("div", { top: DOCK.top, bottom: DOCK.bottom + 12, left: DOCK.left, right: DOCK.right });
    wrapper.style.position = "fixed";
    wrapper.appendChild(dock);
    applyAssistDockLift();
    const wrapperBottom = H - Number.parseFloat(rootVar("--assist-dock-slot-bottom"));
    const pillBottom = wrapperBottom - 12;
    expect(pillBottom - 30).toBeGreaterThanOrEqual(736);
    expect(pillBottom).toBeLessThanOrEqual(768);
  });

  it("rests in the header beside its right cluster when the page has no footer", () => {
    const { dock } = plantFullWidthList({ footer: false });
    applyAssistDockLift();

    expect(dock.hasAttribute("data-assist-dock-yield")).toBe(false);
    expect(document.documentElement.getAttribute("data-assist-dock-slot")).toBe("header");
    const top = Number.parseFloat(rootVar("--assist-dock-slot-top"));
    expect(rootVar("--assist-dock-slot-bottom")).toBe("auto");
    const right = W - Number.parseFloat(rootVar("--assist-dock-slot-right"));
    expect(top).toBeGreaterThanOrEqual(0);
    expect(top + 30).toBeLessThanOrEqual(48);
    expect(right).toBeLessThanOrEqual(W - 200); // left of the cluster
    expect(right - 136).toBeGreaterThan(300); // right of the page title
  });

  it("keeps floating near the work when a free spot exists, and clears an earlier slot", () => {
    const { dock } = plantFullWidthList({ footer: true });
    applyAssistDockLift();
    expect(document.documentElement.getAttribute("data-assist-dock-slot")).toBe("footer");

    // The list shrinks: the spot just above the pager is now free.
    const blank = el("div", null);
    (document as unknown as { elementsFromPoint: (x: number, y: number) => Element[] }).elementsFromPoint = () => [dock, blank];
    applyAssistDockLift();
    expect(document.documentElement.hasAttribute("data-assist-dock-slot")).toBe(false);
    expect(rootVar("--assist-dock-slot-right")).toBe("");
    expect(rootVar("--assist-dock-slot-bottom")).toBe("");
    expect(dock.hasAttribute("data-assist-dock-yield")).toBe(false);
  });

  it("finds the right-most free spot in a band, or none when the band is full", () => {
    const region = { kind: "footer" as const, band: { top: 736, bottom: 768, left: 0, right: W }, startRight: W };
    const pager = (r: Box) => r.right + 6 > 900 && r.left - 6 < 1010;
    const spot = slotSpotFor(region, { width: 136, height: 30 }, pager)!;
    expect(spot.right).toBeLessThanOrEqual(894);
    expect(spot.right).toBeGreaterThan(886);
    expect(slotSpotFor(region, { width: 136, height: 30 }, () => true)).toBeNull();
  });
});
