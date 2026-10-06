import { buildSearchReportDraft, SEARCH_REPORT_KIND } from "../search-report-draft";

const periods = {
  current: { start: "2026-09-05", end: "2026-10-02" },
  compare: { start: "2026-08-08", end: "2026-09-04" },
};

function draft(overrides: Partial<{ ctr: number | null; avg_position: number | null }> = {}) {
  return buildSearchReportDraft({
    siteId: "site-1",
    siteLabel: "Example",
    periods,
    windowLabel: "Sep 5 – Oct 2, 2026",
    summary: {
      clicks: 120,
      cmp_clicks: 100,
      impressions: 4000,
      cmp_impressions: 5000,
      ctr: 0.03,
      cmp_ctr: 0.02,
      avg_position: 12.34,
      cmp_avg_position: 14,
      ...overrides,
    },
    findings: [{ id: "visits", finding: "More visits.", evidence: "120 visits", tone: "positive" }],
  });
}

it("carries the platform template's required sections, so the save door accepts it", () => {
  const md = draft().markdown;
  expect(md).toMatch(/^## Summary$/m);
  expect(md).toMatch(/^## Findings$/m);
  expect(md).not.toMatch(/how this (report )?was made/i);
});

it("names one job per site, kind and window", () => {
  const d = draft();
  expect(d.report_kind).toBe(SEARCH_REPORT_KIND);
  expect(d.period).toBe("2026-09-05..2026-10-02");
  expect(d.period!.length).toBeLessThanOrEqual(40);
  expect(d.site_id).toBe("site-1");
});

it("prints real numbers and never invents a missing one", () => {
  const md = draft({ ctr: null, avg_position: null }).markdown;
  expect(md).toContain("| Visits from Google | 120 | +20 |");
  expect(md).toContain("| Times shown | 4,000 | -1,000 |");
  expect(md).toContain("| Visits per appearance | not reported | — |");
  expect(md).toContain("| Average position | not reported | — |");
});
