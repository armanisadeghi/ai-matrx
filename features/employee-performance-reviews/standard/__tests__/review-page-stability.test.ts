// HR-REVIEW-FIXES: the five defects of the standard performance review browser test, each pinned so it
// goes red when the defect returns. Red before: (1) the template editor replaced the list in place,
// (2) the cycle page shifted as matches, chips and refusals arrived, (3) a created cycle never reached the
// list on screen, (4) the review pages padded their foot on top of the shell's runway, (5) /hr/performance
// had no door to the 360 trial.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { hrPerformance360Href } from "@/features/hr/routes";

import { createCycle, listCycles, saveResponse } from "../service";
import { notifyReviewsChanged, useReloadOnReviewsChanged } from "../invalidation";

const rpc = jest.fn();
jest.mock("@/utils/supabase/client", () => ({ supabase: { schema: () => ({ rpc: (...a: unknown[]) => rpc(...a) }) } }));

const ROOT = resolve(__dirname, "../../../..");
const src = (rel: string) => readFileSync(resolve(ROOT, rel), "utf8");

describe("3. a write that changes a list reaches every mounted list", () => {
  const seen = jest.fn();
  let unsubscribe: () => void;
  beforeEach(() => {
    rpc.mockReset();
    seen.mockReset();
    // the hook registers in an effect; the same registry is reachable through notify, so register by hand
    const react = jest.requireActual<typeof import("react")>("react");
    const spy = jest.spyOn(react, "useEffect").mockImplementation((effect) => {
      const cleanup = effect();
      unsubscribe = typeof cleanup === "function" ? cleanup : () => undefined;
    });
    useReloadOnReviewsChanged(seen);
    spy.mockRestore();
  });
  afterEach(() => unsubscribe?.());

  it("creating a cycle announces itself", async () => {
    rpc.mockResolvedValueOnce({ data: { ok: true }, error: null }); // template_ensure_default
    rpc.mockResolvedValueOnce({ data: { ok: true, cycle_id: "c1" }, error: null });
    const r = await createCycle({ organizationId: "o1", name: "H2", periodStart: "2026-07-01", periodEnd: "2026-12-31" });
    expect(r.ok).toBe(true);
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it("a refused write, a read and a draft autosave do not", async () => {
    rpc.mockResolvedValueOnce({ data: { ok: true }, error: null });
    rpc.mockResolvedValueOnce({ data: { ok: false, reason: "name_taken" }, error: null });
    await createCycle({ organizationId: "o1", name: "H2", periodStart: "2026-07-01", periodEnd: "2026-12-31" });
    rpc.mockResolvedValueOnce({ data: { ok: true, cycles: [] }, error: null });
    await listCycles("o1");
    rpc.mockResolvedValueOnce({ data: { ok: true, version: 2 }, error: null });
    await saveResponse("r1", "self", { accomplishments: [] } as never, 1);
    expect(seen).not.toHaveBeenCalled();
  });

  it("notifyReviewsChanged reaches a mounted list", () => {
    notifyReviewsChanged();
    expect(seen).toHaveBeenCalledTimes(1);
  });
});

describe("4. a scrolling review page takes the shell's runway and pads no bottom of its own", () => {
  const BOTTOM = /(^|\s)(-?m|-?p|-?my|-?py|-?mb|-?pb)-(\d|\[)/;
  const files = [
    "features/employee-performance-reviews/standard/ReviewWorkspace.tsx",
    "features/employee-performance-reviews/standard/CyclePage.tsx",
    "features/employee-performance-reviews/standard/StandardHome.tsx",
    "features/employee-performance-reviews/standard/GoalsPage.tsx",
    "features/employee-performance-reviews/review-360/Review360InPerson.tsx",
    "features/employee-performance-reviews/review-360/Review360Pages.tsx",
  ];
  it.each(files)("%s: the first box inside the scroller has no bottom margin or padding", (rel) => {
    const lines = src(rel).split("\n");
    let checked = 0;
    lines.forEach((line, i) => {
      if (!line.includes("overflow-y-auto pt-[var(--shell-header-h)]")) return;
      const next = lines.slice(i, i + 6).join("\n").match(/<div className="([^"]*)"/g)?.slice(1, 2)[0] ?? "";
      const classes = /className="([^"]*)"/.exec(next)?.[1] ?? "";
      checked += 1;
      expect({ rel, line: i + 1, classes, padded: BOTTOM.test(classes) }).toMatchObject({ padded: false });
    });
    expect(checked).toBeGreaterThan(0);
  });

  it("the 360 pages' own page boxes pad only the top and sides", () => {
    const text = src("features/employee-performance-reviews/review-360/Review360Pages.tsx");
    expect(text).not.toMatch(/className="m-3"/);
    expect(text).not.toMatch(/className="space-y-3 p-3"/);
  });
});

describe("5. /hr/performance opens the 360 trial", () => {
  it("StandardHome carries a Goals chip and a 360 chip beside it", () => {
    const text = src("features/employee-performance-reviews/standard/StandardHome.tsx");
    expect(text).toContain("hrPerformance360Href(orgRef)");
    expect(text).toContain("360 review (trial)");
    expect(hrPerformance360Href(null)).toBe("/hr/performance/360");
  });
});

describe("1. the template editor opens over the list and the settings below do not move", () => {
  it("the editor is a dialog, never an early return that swaps the list out", () => {
    const text = src("features/employee-performance-reviews/standard/TemplatesPanel.tsx");
    expect(text).not.toMatch(/if \(editing\) \{\s*return/);
    expect(text).toContain("<Dialog open={editorOpen}");
  });
  it("the templates list sits after the settings so a row added or a list that loads late pushes nothing", () => {
    expect(src("app/(core)/hr/settings/review-templates/page.tsx")).toContain('childrenPlacement="after"');
  });
});

describe("2. the cycle page does not shift as people are found, added and refused", () => {
  const text = src("features/employee-performance-reviews/standard/CyclePage.tsx");
  it("matches float over what is below the picker", () => {
    expect(text.match(/resultsPlacement="overlay"/g)).toHaveLength(2);
  });
  it("the three modes share one fixed height", () => {
    expect(text).toMatch(/min-h-\[[\d.]+rem\] sm:min-h-\[[\d.]+rem\]/);
  });
  it("refusals arrive below the list, never above it", () => {
    expect(text.indexOf("<MatrxDataTable")).toBeGreaterThan(-1);
    expect(text.indexOf("Not added")).toBeGreaterThan(text.indexOf("<MatrxDataTable"));
  });
});
