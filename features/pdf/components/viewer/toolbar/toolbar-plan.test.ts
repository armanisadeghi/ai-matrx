/**
 * The PDF viewer toolbar works at ANY width — forcing-function test.
 *
 * Review 2026-10-10 of c66b1c9de19/dee22531ce3: the container-query toolbar
 * overlapped itself in the extractor tool's 209px PDF column (zoom in, ···
 * and previous page drawn on top of each other, ··· unclickable) and, at
 * 306px on a phone, squeezed ··· to 0px so fit / actual / rotate were
 * unreachable. CSS could not see the pager or the host's docked chrome, so
 * the fold was decided blind. The row is now rendered FROM this plan, so a
 * plan whose row fits is a row that fits.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  planPdfToolbar,
  TOOLBAR_METRICS,
  TOOLBAR_CONTROLS,
  type PdfToolbarPlanInput,
} from "./toolbar-plan";

const WIDTHS = [200, 209, 260, 306, 340, 390, 416, 480, 640, 1236];

function cases(): PdfToolbarPlanInput[] {
  const out: PdfToolbarPlanInput[] = [];
  for (const width of WIDTHS)
    for (const coarse of [true, false])
      for (const pages of [1, 12, 248])
        for (const endWidth of [0, 28, 44])
          out.push({ width, coarse, pages, pageNav: true, endWidth });
  return out;
}

describe("PDF toolbar fold plan", () => {
  it.each(cases().map((c) => [JSON.stringify(c), c]))(
    "the row fits its container: %s",
    (_label, input) => {
      const plan = planPdfToolbar(input as PdfToolbarPlanInput);
      expect(plan.rowWidth).toBeLessThanOrEqual((input as PdfToolbarPlanInput).width);
    },
  );

  it("every control lives in exactly one place (row XOR menu)", () => {
    for (const input of cases()) {
      const plan = planPdfToolbar(input);
      for (const c of TOOLBAR_CONTROLS) {
        if (c === "pager" && input.pages <= 1) continue;
        const inRow = c === "pager" ? plan.pager === "full" : plan.row.includes(c);
        const inMenu = plan.menu.includes(c);
        expect([c, input.width, inRow !== inMenu]).toEqual([c, input.width, true]);
      }
    }
  });

  it("the overflow trigger exists whenever anything folded, and is a full target", () => {
    for (const input of cases()) {
      const plan = planPdfToolbar(input);
      expect(plan.showMore).toBe(plan.menu.length > 0);
      expect(plan.target).toBe(input.coarse ? 44 : 28);
    }
  });

  it("a multi-page document always shows where you are", () => {
    for (const input of cases().filter((c) => c.pages > 1)) {
      expect(planPdfToolbar(input).pager).not.toBe("none");
    }
  });

  it("nothing folds when there is room (desktop full width)", () => {
    const plan = planPdfToolbar({ width: 1236, coarse: false, pages: 48, pageNav: true });
    expect(plan.menu).toEqual([]);
    expect(plan.pager).toBe("full");
  });

  it("an unmeasured container (0px) renders the full row, never an empty one", () => {
    const plan = planPdfToolbar({ width: 0, coarse: false, pages: 48, pageNav: true });
    expect(plan.menu).toEqual([]);
  });
});

/**
 * ONE source for the row's sizes: the plan's numbers are only true if the
 * renderer draws with them. A Tailwind size class in the row (px-2, gap-1,
 * h-11, w-[3.25rem] …) would let the row drift while every case above stays
 * green — and `overflow-hidden` would clip it silently.
 */
describe("the renderer draws the toolbar with the plan's sizes", () => {
  const src = readFileSync(join(__dirname, "../PdfDocumentRenderer.tsx"), "utf8");
  const start = src.indexOf("Toolbar — rendered FROM the fold plan");
  const end = src.indexOf("Viewport frame keeps floating deck controls");
  const block = src.slice(start, end);

  it("finds the toolbar block", () => {
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
  });

  it("uses no Tailwind size / spacing class inside the row", () => {
    const SIZE = /^-?(m[trblxyse]?|p[trblxyse]?|gap(-[xy])?|space-[xy]|w|h|size|min-w|min-h|max-w|max-h)-/;
    // Icon glyph sizes (inside fixed-size buttons) and the menu popover's
    // own width + its label alignment (portalled, not in the row) are the only exceptions.
    const ALLOWED = new Set(["h-3.5", "w-3.5", "h-5", "w-5", "min-w-0", "min-w-44", "ml-auto"]);
    const strings = [...block.matchAll(/className=(?:"([^"]*)"|\{cn\(([^)]*)\))/g)]
      .flatMap((m) => [m[1] ?? "", ...[...(m[2] ?? "").matchAll(/"([^"]*)"/g)].map((x) => x[1])]);
    const offenders = strings
      .flatMap((c) => c.split(/\s+/))
      .map((t) => t.replace(/^[a-z-]+:/, ""))
      .filter((t) => SIZE.test(t) && !ALLOWED.has(t));
    expect(offenders).toEqual([]);
  });

  it("takes padding, gaps, separators, label and targets from TOOLBAR_METRICS / the plan", () => {
    for (const needle of [
      "TOOLBAR_METRICS.groupGap",
      "TOOLBAR_METRICS.padding",
      "TOOLBAR_METRICS.zoomLabel",
      "style={ITEM_GROUP_STYLE}",
      "style={SEPARATOR_STYLE}",
      "style={buttonStyle}",
      "width: plan.counterWidth",
    ]) {
      expect([needle, block.includes(needle)]).toEqual([needle, true]);
    }
    expect(src).toMatch(/columnGap: TOOLBAR_METRICS\.itemGap/);
    expect(src).toMatch(/marginInline: \(TOOLBAR_METRICS\.separator - 1\) \/ 2/);
    expect(src).toMatch(/const buttonStyle = \{ width: plan\.target, height: plan\.target \}/);
    // Every icon button in the row carries the plan's size.
    const buttons = (block.match(/className=\{toolButton\}|className=\{cn\(toolButton,/g) ?? []).length;
    const sized = (block.match(/style=\{buttonStyle\}/g) ?? []).length;
    expect(sized).toBe(buttons);
    expect(TOOLBAR_METRICS.targetCoarse).toBe(44);
  });
});
