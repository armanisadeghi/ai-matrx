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
  perCollectedDay,
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

/*
  RULE 3 — THE COMPARISON IS REFUSED WHEN THE TWO WINDOWS WERE NOT COLLECTED
  ALIKE. Reconstructed from the live shape the zero-authorship verifier
  measured on 2026-09-17 (All Green Recycling, site
  `d0aff5b6-0710-4848-8304-164db3c80ab7`, org `5dc930e9-…`): the current 28-day
  window had 28 of 28 days stored totalling 14,909 winning-run sessions, the
  previous window had 6 of 28 days totalling 4,485. The panel printed about
  +232%, while per collected day the site had gone from ~748/day to ~532/day —
  a ~29% FALL. Rows below are written by hand in that shape; the numbers are the
  verifier's.
*/
describe("rule 3 — an uncollected previous window refuses the comparison", () => {
  const WINDOW_DAYS = 28;
  const currentStart = "2026-08-01";
  const currentEnd = "2026-08-28";
  const previousStart = "2026-07-04";
  const previousEnd = "2026-07-31";

  function day(start: string, offset: number): string {
    const [y, m, d] = start.split("-").map(Number);
    return new Date(Date.UTC(y, (m ?? 1) - 1, (d ?? 1) + offset))
      .toISOString()
      .slice(0, 10);
  }

  /** 28 collected days now (14,909 sessions), 6 collected days before (4,485). */
  function liveShapedRows(): RawRow[] {
    const rows: RawRow[] = [];
    for (let offset = 0; offset < 28; offset += 1) {
      rows.push(
        row({
          date: day(currentStart, offset),
          run_id: `cur-${offset}`,
          created_at: `2026-08-29T0${offset % 10}:00:00Z`,
          sessions: offset === 27 ? 14_909 - 532 * 27 : 532,
          users: 400,
        }),
      );
    }
    for (let offset = 0; offset < 6; offset += 1) {
      rows.push(
        row({
          date: day(previousStart, offset),
          run_id: `prev-${offset}`,
          created_at: `2026-07-12T0${offset}:00:00Z`,
          sessions: offset === 5 ? 4_485 - 748 * 5 : 748,
          users: 500,
        }),
      );
    }
    return rows;
  }

  const liveBounds = {
    start: currentStart,
    end: currentEnd,
    previousStart,
    previousEnd,
    days: WINDOW_DAYS,
    metadata: { timeZone: "America/Los_Angeles", currencyCode: "USD" },
  };

  it("reproduces the live totals the +232% was computed from", () => {
    const result = aggregateAnalyticsRows(liveShapedRows(), liveBounds);
    expect(result.totals.sessions).toBe(14_909);
    expect(result.previousTotals.sessions).toBe(4_485);
    expect(result.daysWithData).toBe(28);
    expect(result.previousDaysWithData).toBe(6);
  });

  it("refuses the comparison and says which window is short", () => {
    const result = aggregateAnalyticsRows(liveShapedRows(), liveBounds);
    expect(result.comparison.state).toBe("refused");
    expect(result.comparison.caveat).toContain("6 of 28");
    expect(result.comparison.caveat).toContain("28 of 28");
  });

  it("the per-collected-day figures move the OTHER WAY from the raw totals", () => {
    const result = aggregateAnalyticsRows(liveShapedRows(), liveBounds);
    const now = perCollectedDay(result.totals.sessions, result.daysWithData);
    const then = perCollectedDay(
      result.previousTotals.sessions,
      result.previousDaysWithData,
    );
    expect(now).not.toBeNull();
    expect(then).not.toBeNull();
    // +232% on the totals; ~-29% per collected day. The direction of the
    // number the panel used to print was wrong, not just its precision.
    expect(Math.round(((14_909 - 4_485) / 4_485) * 100)).toBe(232);
    expect((now as number) < (then as number)).toBe(true);
    expect(
      Math.round((((now as number) - (then as number)) / (then as number)) * 100),
    ).toBe(-29);
  });

  it("allows the comparison when both windows are fully collected", () => {
    const rows: RawRow[] = [];
    for (let offset = 0; offset < 28; offset += 1) {
      rows.push(
        row({ date: day(currentStart, offset), run_id: `c${offset}`, sessions: 500 }),
      );
      rows.push(
        row({ date: day(previousStart, offset), run_id: `p${offset}`, sessions: 700 }),
      );
    }
    const result = aggregateAnalyticsRows(rows, liveBounds);
    expect(result.comparison.state).toBe("comparable");
    expect(result.comparison.caveat).toBeNull();
  });

  it("tolerates a couple of missing days rather than refusing everything", () => {
    const rows: RawRow[] = [];
    for (let offset = 0; offset < 27; offset += 1) {
      rows.push(
        row({ date: day(currentStart, offset), run_id: `c${offset}`, sessions: 500 }),
      );
    }
    for (let offset = 0; offset < 26; offset += 1) {
      rows.push(
        row({ date: day(previousStart, offset), run_id: `p${offset}`, sessions: 700 }),
      );
    }
    const result = aggregateAnalyticsRows(rows, liveBounds);
    expect(result.comparison.state).toBe("comparable");
    // …and it still says both windows are short, ON the number.
    expect(result.comparison.caveat).toContain("27 of 28");
    expect(result.comparison.caveat).toContain("26 of 28");
  });

  it("refuses when the PREVIOUS window has nothing at all", () => {
    const rows: RawRow[] = [];
    for (let offset = 0; offset < 28; offset += 1) {
      rows.push(
        row({ date: day(currentStart, offset), run_id: `c${offset}`, sessions: 500 }),
      );
    }
    const result = aggregateAnalyticsRows(rows, liveBounds);
    expect(result.comparison.state).toBe("refused");
    expect(result.comparison.previousDaysWithData).toBe(0);
  });
});
