jest.mock("server-only", () => ({}));
import {
  drillAnswerLocally,
  drillConfigFromColumns,
  drillDroppedItems,
  drillLevelProblems,
  emptyDrillQuestion,
} from "@ai-matrx/design-system/data-table";
import { DEAD_END_REPORT } from "../report-data";
import { DEAD_ENDS_DRILL } from "../deadEndsDrill";

const rows = DEAD_END_REPORT.findings;
const config = drillConfigFromColumns([], rows, DEAD_ENDS_DRILL);

describe("dead ends drill (levels read the page's own totals)", () => {
  it("declares only levels its Dimensions and Measures honour", () => {
    expect(drillLevelProblems(config.dimensions, config.measures, { attributeKeys: ["severity", "rule", "entity", "feature", "file"] })).toEqual([]);
  });

  it("drops nothing it was asked to offer", () => {
    expect(drillDroppedItems(config.dimensions, DEAD_ENDS_DRILL)).toEqual([]);
  });

  it("the severity groups add up to the report's finding total", () => {
    const answers = drillAnswerLocally(rows, { ...emptyDrillQuestion(["count"]), by: ["severity"] }, config);
    const groups = (answers.severity ?? []) as unknown as { measures: { count: number } }[];
    expect(groups.reduce((n, g) => n + g.measures.count, 0)).toBe(DEAD_END_REPORT.totals.findings);
  });
});
