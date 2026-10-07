// features/hr/people/org-chart/__tests__/org-chart-csv.test.ts
//
// The org-chart CSV is a strict CSV: line one is the header row, and the as-of
// date travels in the `as_of` column and the filename. RED on the version that
// wrote a `# Org chart as of …` line above the header (a strict reader took the
// comment as the header and shifted every column).

import { buildOrgChartCsv, orgChartExportName } from "../orgChartExport";
import type { HrOrgChart, HrOrgChartNode } from "../../../types";

const chart = {
  as_of: "2026-10-01",
  nodes: [
    { employment_id: "e1", employee_id: "p1", display_name: "Ada Park", manager_employment_id: null },
  ] as unknown as HrOrgChartNode[],
  unplaced: [],
  cycles: [],
} as unknown as HrOrgChart;

describe("buildOrgChartCsv", () => {
  it("starts with the header row and carries the date in every row", () => {
    const lines = buildOrgChartCsv(chart).split("\n");
    expect(lines[0]?.startsWith("as_of,level,display_name")).toBe(true);
    expect(lines.some((line) => line.startsWith("#"))).toBe(false);
    expect(lines[1]?.startsWith("2026-10-01,")).toBe(true);
  });

  it("names the file with the date", () => {
    expect(orgChartExportName("2026-10-01", "csv")).toBe("org-chart-as-of-2026-10-01.csv");
  });
});
