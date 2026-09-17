/*
  THE TWO ACCURACY RULES, proven on rows shaped exactly like the live table.

  Rule 1 exists because `seo.web_analytics_daily.dedup_key` is scoped to the
  collection RUN: live site d0aff5b6-… carries up to FIVE runs on 31 of its 34
  days, and the card this panel replaced summed all of them — up to five times
  the site's real traffic. Rule 2 exists because the row grain is
  date × landing page × source × medium × campaign × device, so `users` cannot
  be added up without double-counting a visitor.
*/

import {
  aggregateAnalyticsRows,
  type RawRow,
} from "@/features/marketing/analytics/window";

const bounds = {
  start: "2026-09-08",
  end: "2026-09-09",
  previousStart: "2026-09-06",
  previousEnd: "2026-09-07",
  days: 2,
  metadata: { timeZone: "America/Los_Angeles", currencyCode: "USD" },
};

function row(over: Partial<RawRow>): RawRow {
  return {
    id: Math.random().toString(36).slice(2),
    date: "2026-09-08",
    run_id: "run-a",
    created_at: "2026-09-09T02:00:00Z",
    landing_page: "/",
    page_id: null,
    sessions: 10,
    users: 8,
    engaged_sessions: 6,
    conversions: 1,
    key_events: 1,
    views: 12,
    ...over,
  };
}

describe("aggregateAnalyticsRows — winning-run dedup", () => {
  it("counts only the newest run's rows for a day that was synced twice", () => {
    const result = aggregateAnalyticsRows(
      [
        row({ run_id: "run-old", created_at: "2026-09-09T01:00:00Z", sessions: 10 }),
        row({ run_id: "run-new", created_at: "2026-09-09T05:00:00Z", sessions: 12 }),
      ],
      bounds,
    );
    // 22 would be the old card's answer, and it was wrong.
    expect(result.totals.sessions).toBe(12);
    expect(result.rowsSuperseded).toBe(1);
  });

  it("picks the winning run PER DAY, not per site", () => {
    const result = aggregateAnalyticsRows(
      [
        row({ date: "2026-09-08", run_id: "run-a", created_at: "2026-09-08T05:00:00Z", sessions: 5 }),
        row({ date: "2026-09-09", run_id: "run-b", created_at: "2026-09-09T05:00:00Z", sessions: 7 }),
      ],
      bounds,
    );
    expect(result.totals.sessions).toBe(12);
    expect(result.rowsSuperseded).toBe(0);
    expect(result.series.map((point) => point.date)).toEqual([
      "2026-09-08",
      "2026-09-09",
    ]);
  });

  it("splits the current and previous windows on the window start", () => {
    const result = aggregateAnalyticsRows(
      [
        row({ date: "2026-09-08", sessions: 4 }),
        row({ date: "2026-09-07", run_id: "run-p", sessions: 9 }),
      ],
      bounds,
    );
    expect(result.totals.sessions).toBe(4);
    expect(result.previousTotals.sessions).toBe(9);
    expect(result.previousSeries).toHaveLength(1);
  });
});

describe("aggregateAnalyticsRows — landing pages and caveats", () => {
  it("sums a landing page across the finer dimensions and keeps its page door", () => {
    const result = aggregateAnalyticsRows(
      [
        row({ landing_page: "/pricing", page_id: null, sessions: 3 }),
        row({ landing_page: "/pricing", page_id: "page-1", sessions: 4 }),
        row({ landing_page: "/", sessions: 1 }),
      ],
      bounds,
    );
    const pricing = result.landingPages[0];
    expect(pricing.landingPage).toBe("/pricing");
    expect(pricing.sessions).toBe(7);
    expect(pricing.pageId).toBe("page-1");
  });

  it("always prints the users-are-summed caveat when users were counted", () => {
    const result = aggregateAnalyticsRows([row({})], bounds);
    expect(result.caveats.map((c) => c.id)).toContain("users-not-unique");
  });

  it("prints the (other) caveat only when an (other) row is really there", () => {
    expect(
      aggregateAnalyticsRows([row({})], bounds).caveats.map((c) => c.id),
    ).not.toContain("other-row");
    expect(
      aggregateAnalyticsRows([row({ landing_page: "(other)" })], bounds).caveats.map(
        (c) => c.id,
      ),
    ).toContain("other-row");
  });

  it("invents no thresholding or sampling caveat when Google reported none", () => {
    const ids = aggregateAnalyticsRows([row({})], bounds).caveats.map((c) => c.id);
    expect(ids).not.toContain("thresholding");
    expect(ids).not.toContain("sampling");
  });

  it("prints thresholding and sampling when Google DID report them", () => {
    const ids = aggregateAnalyticsRows([row({})], {
      ...bounds,
      metadata: {
        ...bounds.metadata,
        subjectToThresholding: true,
        samplingMetadatas: [{ samplesReadCount: "1", samplingSpaceSize: "10" }],
      },
    }).caveats.map((c) => c.id);
    expect(ids).toContain("thresholding");
    expect(ids).toContain("sampling");
  });
});
