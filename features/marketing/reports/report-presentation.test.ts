import {
  buildReportRowCopy,
  formatReportPlacement,
  reportPlacementSentence,
  type ReportBreakdownRow,
} from "./report-presentation";

const rankedRow = {
  avg_position: 8.45,
  clicks: 12,
  cmp_avg_position: 9.2,
  cmp_clicks: 10,
  cmp_ctr: 0.04,
  cmp_impressions: 250,
  ctr: 0.048,
  impressions: 250,
  key: "recycle computers",
  keyword_id: "0d4ad205-895b-4e86-b3e6-6a9d996fa121",
  page_id: "2a2f0805-9929-4c14-bef1-aa4a58f86e7b",
  total_count: 2,
} satisfies ReportBreakdownRow;

const unrankedRow = {
  avg_position: null,
  clicks: 0,
  cmp_avg_position: null,
  cmp_clicks: 0,
  cmp_ctr: 0,
  cmp_impressions: 0,
  ctr: 0,
  impressions: 0,
  key: "secure electronics recycling",
  keyword_id: "96660324-e85f-476d-8337-34dd2bf5b278",
  page_id: "57d7bca6-f9ec-4734-9797-f1e442201f82",
  total_count: 2,
} satisfies ReportBreakdownRow;

describe("Marketing report placement presentation", () => {
  it.each([
    [rankedRow, "#8.4", "usually result #8.4"],
    [unrankedRow, "Not available", "placement unavailable"],
  ] as const)(
    "renders measurable and missing placement without crashing",
    (row, placement, sentence) => {
      expect(formatReportPlacement(row.avg_position)).toBe(placement);
      expect(reportPlacementSentence(row.avg_position)).toBe(sentence);
      expect(buildReportRowCopy("Search", "query", row).human()).toContain(
        `Position: ${row.avg_position === null ? "—" : placement.slice(1)}`,
      );
    },
  );
});
