jest.mock("server-only", () => ({}));
import {
  drillAnswerLocally,
  drillConfigFromColumns,
  drillDroppedItems,
  drillLevelProblems,
  emptyDrillQuestion,
} from "@ai-matrx/design-system/data-table";
import { classOf } from "@/scripts/lint-debt/types";
import { LINT_DEBT_REPORT } from "../report-data";
import { LINT_DRILL } from "../lintDrill";

// The page reads the committed report; so does this test (real findings, no fixture).
const rows = LINT_DEBT_REPORT.findings.map((f) => ({ ...f, klass: classOf(f.rule) }));
const config = drillConfigFromColumns([], rows, LINT_DRILL);

describe("lint debt drill (levels read the page's own totals)", () => {
  it("declares only levels its Dimensions and Measures honour", () => {
    expect(drillLevelProblems(config.dimensions, config.measures, { attributeKeys: ["klass", "rule", "feature", "file", "route"] })).toEqual([]);
  });

  it("drops nothing it was asked to offer", () => {
    expect(drillDroppedItems(config.dimensions, LINT_DRILL)).toEqual([]);
  });

  it("a class's groups equal a hand count of the findings list", () => {
    // The committed snapshot's headline totals can disagree with its own findings list (the
    // page says so in its problems banner), so the drill is held to the list, counted by hand.
    const hand: Record<string, number> = {};
    for (const f of LINT_DEBT_REPORT.findings) hand[classOf(f.rule)] = (hand[classOf(f.rule)] ?? 0) + 1;
    const answers = drillAnswerLocally(rows, { ...emptyDrillQuestion(["count"]), by: ["klass"] }, config);
    const groups = (answers.klass ?? []) as unknown as { groups: { klass: string }; measures: { count: number } }[];
    for (const [klass, n] of Object.entries(hand)) {
      expect(groups.find((g) => g.groups.klass === klass)?.measures.count).toBe(n);
    }
    expect(groups.reduce((n, g) => n + g.measures.count, 0)).toBe(LINT_DEBT_REPORT.findings.length);
  });
});
