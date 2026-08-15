import { buildReportFindings } from "./report-narrative";

describe("buildReportFindings", () => {
  it("leads with a plain-language verdict before the metric evidence", () => {
    const findings = buildReportFindings(
      {
        avg_position: 8.4,
        clicks: 120,
        cmp_avg_position: 9.1,
        cmp_clicks: 100,
        cmp_ctr: 0.04,
        cmp_impressions: 2500,
        ctr: 0.048,
        impressions: 2500,
      },
      [
        {
          clicks: 70,
          cmp_clicks: 50,
          cmp_impressions: 1000,
          cmp_queries: 20,
          impressions: 1100,
          queries: 22,
          traffic_class: "money",
        },
      ],
    );
    expect(findings[0]?.finding).toContain("sent more people");
    expect(findings[0]?.evidence).toContain("120 visits");
    expect(findings[1]?.finding).toContain("High-value searches");
    expect(findings[2]?.evidence).toContain("visits per 100");
  });
});
