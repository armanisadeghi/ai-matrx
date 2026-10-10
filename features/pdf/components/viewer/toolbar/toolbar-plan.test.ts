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

import {
  planPdfToolbar,
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
