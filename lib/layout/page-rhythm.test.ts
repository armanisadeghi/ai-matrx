/**
 * PAGE RHYTHM — the scale is pinned, and the double-padding detector fires on a doubled page end
 * and stays quiet on a page that ends once (lib/layout/page-rhythm.ts).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  PAGE_RHYTHM,
  PAGE_RHYTHM_TOLERANCE_PX,
  PAGE_RHYTHM_VARS,
  PAGE_RHYTHM_WIDE_MIN_PX,
  isDoublePadded,
  measurePageEnd,
  pageRhythmFor,
} from "./page-rhythm";

const SHELL_CSS = readFileSync(resolve(__dirname, "../../styles/shell.css"), "utf8");

/** px of a `--name: <n>rem;` declaration inside the given CSS block (16px rem). */
function declaredPx(block: string, name: string): number | null {
  const m = new RegExp(`${name}:\\s*([\\d.]+)(rem|px)\\s*;`).exec(block);
  if (!m) return null;
  return m[2] === "rem" ? Number(m[1]) * 16 : Number(m[1]);
}

describe("the page-rhythm scale", () => {
  const narrowBlock = /\/\* PAGE RHYTHM[\s\S]*?:root\s*\{([\s\S]*?)\}/.exec(SHELL_CSS)?.[1] ?? "";
  const wideBlock =
    new RegExp(`@media \\(min-width: ${PAGE_RHYTHM_WIDE_MIN_PX}px\\)\\s*\\{\\s*:root\\s*\\{([\\s\\S]*?)\\}`).exec(
      SHELL_CSS.slice(SHELL_CSS.indexOf("/* PAGE RHYTHM")),
    )?.[1] ?? "";

  it("is the owner's scale: 12/16 gutter, 16/24 top, 24/32 between big blocks, end = gutter", () => {
    expect(PAGE_RHYTHM).toEqual({
      narrow: { gutter: 12, top: 16, blockGap: 24, end: 12 },
      wide: { gutter: 16, top: 24, blockGap: 32, end: 16 },
    });
    for (const scale of [PAGE_RHYTHM.narrow, PAGE_RHYTHM.wide]) expect(scale.end).toBe(scale.gutter);
  });

  it("styles/shell.css declares exactly these numbers", () => {
    for (const [key, cssVar] of [
      ["gutter", PAGE_RHYTHM_VARS.gutter],
      ["top", PAGE_RHYTHM_VARS.top],
      ["blockGap", PAGE_RHYTHM_VARS.blockGap],
    ] as const) {
      expect(declaredPx(narrowBlock, cssVar)).toBe(PAGE_RHYTHM.narrow[key]);
      expect(declaredPx(wideBlock, cssVar)).toBe(PAGE_RHYTHM.wide[key]);
    }
    expect(narrowBlock).toMatch(/--matrx-page-end:\s*var\(--matrx-page-gutter\)/);
  });

  it("the floating runway is the page end, never a constant stacked on it", () => {
    const runway = /--matrx-floating-clearance:\s*calc\(([\s\S]*?)\);/.exec(SHELL_CSS)?.[1] ?? "";
    expect(runway).toContain("var(--matrx-page-end)");
    expect(runway).not.toMatch(/\d(rem|px)\s*$/);
  });

  it("switches to the wide scale at sm", () => {
    expect(pageRhythmFor(PAGE_RHYTHM_WIDE_MIN_PX - 1)).toBe(PAGE_RHYTHM.narrow);
    expect(pageRhythmFor(PAGE_RHYTHM_WIDE_MIN_PX)).toBe(PAGE_RHYTHM.wide);
  });
});

describe("the double-padding detector", () => {
  it("flags an end space over page end + tolerance, and only that", () => {
    const allowed = PAGE_RHYTHM.wide.end + PAGE_RHYTHM_TOLERANCE_PX;
    expect(isDoublePadded(allowed, 1440)).toBe(false);
    expect(isDoublePadded(allowed + 1, 1440)).toBe(true);
    // The 2026-10-05 education sample: the shell's 24px runway on top of the page's own 16px.
    expect(isDoublePadded(40, 1440)).toBe(true);
    expect(isDoublePadded(16, 375)).toBe(false);
    expect(isDoublePadded(17, 375)).toBe(true);
  });

  function rect(top: number, bottom: number) {
    return { top, bottom, left: 0, right: 800, width: 800, height: bottom - top, x: 0, y: top, toJSON: () => ({}) } as DOMRect;
  }

  function page(lastBottom: number) {
    const scroller = document.createElement("div");
    const pager = document.createElement("button");
    pager.textContent = "Next page";
    scroller.appendChild(pager);
    document.body.appendChild(scroller);
    scroller.getBoundingClientRect = () => rect(0, 900);
    pager.getBoundingClientRect = () => rect(lastBottom - 28, lastBottom);
    return scroller;
  }

  beforeAll(() => {
    Object.defineProperty(window, "innerHeight", { value: 900, configurable: true });
  });

  it("measures the space under the last element against the visible bottom", () => {
    const doubled = page(900 - 40);
    expect(measurePageEnd(doubled, []).endSpacePx).toBe(40);
    expect(isDoublePadded(measurePageEnd(doubled, []).endSpacePx, 1440)).toBe(true);
    doubled.remove();

    const once = page(900 - 16);
    expect(measurePageEnd(once, []).endSpacePx).toBe(16);
    expect(isDoublePadded(measurePageEnd(once, []).endSpacePx, 1440)).toBe(false);
    once.remove();
  });

  it("measures against the floating chat's top when something floats over the bottom", () => {
    const scroller = page(900 - 60 - 16);
    const chat = { top: 900 - 60, bottom: 900 - 12, left: 300, right: 700 };
    expect(measurePageEnd(scroller, [chat]).endSpacePx).toBe(16);
    scroller.remove();
  });
});

describe("free space is never padding", () => {
  function box(tag: string, top: number, bottom: number) {
    const el = document.createElement(tag);
    el.getBoundingClientRect = () =>
      ({ top, bottom, left: 0, right: 800, width: 800, height: bottom - top, x: 0, y: top, toJSON: () => ({}) }) as DOMRect;
    return el;
  }

  beforeAll(() => {
    Object.defineProperty(window, "innerHeight", { value: 900, configurable: true });
  });

  // 2026-10-05 /agents/all: measured while its rows loaded, a 6-row skeleton left the pager 437px
  // above the list frame's foot; the guard called that "padded twice" and the outline stayed.
  it("a frame its content does not fill (loading, a short list) is not judged", () => {
    const surface = box("div", 213, 900);
    const column = box("div", 217, 884);
    const pager = box("button", 410, 443);
    pager.textContent = "1";
    column.appendChild(pager);
    surface.appendChild(column);
    document.body.appendChild(surface);
    const end = measurePageEnd(surface, []);
    expect(end.endSpacePx).toBeGreaterThan(400);
    expect(end.contentFills).toBe(false);
    surface.remove();
  });

  it("a frame its content fills is judged on its end space (its padding is the end)", () => {
    const surface = box("div", 213, 900);
    surface.style.paddingBottom = "40px";
    const column = box("div", 217, 860);
    const pager = box("button", 832, 860);
    pager.textContent = "1";
    column.appendChild(pager);
    surface.appendChild(column);
    document.body.appendChild(surface);
    const end = measurePageEnd(surface, []);
    expect(end.contentFills).toBe(true);
    expect(isDoublePadded(end.endSpacePx, 1440)).toBe(true);
    surface.remove();
  });
});

describe("a row's own padding is the row's, never the page's", () => {
  function box(tag: string, top: number, bottom: number, cls?: string) {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    el.getBoundingClientRect = () =>
      ({ top, bottom, left: 0, right: 800, width: 800, height: bottom - top, x: 0, y: top, toJSON: () => ({}) }) as DOMRect;
    return el;
  }

  beforeAll(() => {
    Object.defineProperty(window, "innerHeight", { value: 900, configurable: true });
  });

  // 2026-10-05 /tasks at 375: the last task title ended 28px above the foot — 16px of it the row's
  // own padding — and the guard reported a doubled page end.
  it("measures from the last ROW's bottom, not the text inside it", () => {
    const scroller = box("div", 0, 900);
    const list = box("div", 0, 888);
    const rowA = box("div", 760, 824, "task-row flex py-4");
    const rowB = box("div", 824, 888, "task-row flex py-4");
    const title = box("span", 840, 872);
    title.textContent = "Ship pricing page";
    rowB.appendChild(title);
    const titleA = box("span", 776, 808);
    titleA.textContent = "Earlier task";
    rowA.appendChild(titleA);
    list.append(rowA, rowB);
    scroller.appendChild(list);
    document.body.appendChild(scroller);
    const end = measurePageEnd(scroller, []);
    expect(end.endSpacePx).toBe(12);
    expect(isDoublePadded(end.endSpacePx, 375)).toBe(false);
    scroller.remove();
  });

  it("a page wrapper's own padding is still the page's (a lone wrapper is not a row)", () => {
    const scroller = box("div", 0, 900);
    const wrapper = box("div", 0, 900, "px-4 pb-10");
    const last = box("button", 832, 860);
    last.textContent = "Next";
    wrapper.appendChild(last);
    scroller.appendChild(wrapper);
    document.body.appendChild(scroller);
    expect(measurePageEnd(scroller, []).endSpacePx).toBe(40);
    scroller.remove();
  });
});

