/*
  THE SEARCH CONSOLE DELTA IS JUDGED ON BOTH WINDOWS (round-3 verdict B-N1).

  Live on 2026-09-17, five managed sites sat at 8 of 28 CURRENT days against 23
  of 28 previous days. The old rule (`prevDays >= 21`, hardcoded in
  `SiteKpiPeeks.trendPercent` and again inside `SearchConsolePortfolio`) looked
  only at the previous window, so the sites list, the site peek and the Search
  Console portfolio each printed −54.3% … −72.6% over sites whose traffic PER
  COLLECTED DAY was flat or UP. The numbers below are those live rows.
*/

import {
  GSC_KPI_WINDOW_DAYS,
  gscDeltaRefusalLabel,
  judgeGscWindowDelta,
  siteKpiDelta,
} from "@/features/marketing/analytics/gsc-delta";
import type { SiteListRow } from "@/features/marketing/types";

/** The five live sites, exactly as `web.v_site_kpis` reported them. */
const LIVE_UNDER_COLLECTED = [
  { site: "05d822cd", clicks: 117, prevClicks: 256 },
  { site: "0fdcd5ea", clicks: 17, prevClicks: 20 },
  { site: "38eff4c9", clicks: 81, prevClicks: 270 },
  { site: "54f57ada", clicks: 110, prevClicks: 370 },
  { site: "57711943", clicks: 19, prevClicks: 60 },
];

describe("judgeGscWindowDelta — the live under-collected current window", () => {
  it.each(LIVE_UNDER_COLLECTED)(
    "refuses the percentage for site $site (8 of 28 now against 23 of 28 before)",
    ({ clicks, prevClicks }) => {
      const delta = judgeGscWindowDelta({
        current: clicks,
        previous: prevClicks,
        currentDaysWithData: 8,
        previousDaysWithData: 23,
      });
      expect(delta.comparison.state).toBe("refused");
      expect(delta.percent).toBeNull();
      // The caveat names BOTH day counts — a refusal that does not say how
      // short each window is cannot be acted on.
      expect(delta.caveat).toContain("8 of 28");
      expect(delta.caveat).toContain("23 of 28");
    },
  );

  it("still says which way it moved, per collected day", () => {
    const delta = judgeGscWindowDelta({
      current: 117,
      previous: 256,
      currentDaysWithData: 8,
      previousDaysWithData: 23,
    });
    // 14.6 now against 11.1 before — UP, while the old rule printed −54.3%.
    expect(delta.currentPerDay).toBeCloseTo(14.625, 3);
    expect(delta.previousPerDay).toBeCloseTo(11.130, 3);
  });

  it("uses the 28-day KPI window the view computes", () => {
    expect(GSC_KPI_WINDOW_DAYS).toBe(28);
  });
});

describe("judgeGscWindowDelta — the pairs it still answers", () => {
  it("compares two fully collected windows", () => {
    const delta = judgeGscWindowDelta({
      current: 120,
      previous: 100,
      currentDaysWithData: 28,
      previousDaysWithData: 28,
    });
    expect(delta.comparison.state).toBe("comparable");
    expect(delta.percent).toBeCloseTo(20, 6);
    expect(delta.caveat).toBeNull();
  });

  it("carries the coverage caveat on a short-but-comparable pair", () => {
    const delta = judgeGscWindowDelta({
      current: 120,
      previous: 100,
      currentDaysWithData: 26,
      previousDaysWithData: 24,
    });
    expect(delta.comparison.state).toBe("comparable");
    expect(delta.percent).toBeCloseTo(20, 6);
    expect(delta.caveat).toContain("26 of 28");
  });

  it("refuses a thin previous window, the case the old rule did catch", () => {
    const delta = judgeGscWindowDelta({
      current: 120,
      previous: 10,
      currentDaysWithData: 28,
      previousDaysWithData: 6,
    });
    expect(delta.percent).toBeNull();
    expect(delta.caveat).toContain("6 of 28");
  });

  it("has no percentage to give when a total is missing or the base is zero", () => {
    expect(
      judgeGscWindowDelta({
        current: null,
        previous: 100,
        currentDaysWithData: 28,
        previousDaysWithData: 28,
      }).percent,
    ).toBeNull();
    expect(
      judgeGscWindowDelta({
        current: 100,
        previous: 0,
        currentDaysWithData: 28,
        previousDaysWithData: 28,
      }).percent,
    ).toBeNull();
  });
});

describe("siteKpiDelta — the list row, judged on the coverage it carries", () => {
  const row = {
    gsc_clicks_28d: 117,
    gsc_clicks_prev_28d: 256,
    gsc_impressions_28d: 4_000,
    gsc_impressions_prev_28d: 12_000,
    gsc_cur_days: 8,
    gsc_prev_days: 23,
  } as SiteListRow;

  it("refuses both metrics on the live row", () => {
    expect(siteKpiDelta(row, "clicks").percent).toBeNull();
    expect(siteKpiDelta(row, "impressions").percent).toBeNull();
    expect(siteKpiDelta(row, "clicks").caveat).toContain("8 of 28");
  });

  it("answers both metrics when the two windows were collected alike", () => {
    const even = { ...row, gsc_cur_days: 28, gsc_prev_days: 28 } as SiteListRow;
    expect(siteKpiDelta(even, "clicks").percent).toBeCloseTo(-54.296875, 6);
    expect(siteKpiDelta(even, "impressions").percent).toBeCloseTo(-66.666667, 5);
  });
});

/*
  THE CLASS GUARD. Three implementations of one rule is how the previous
  window's coverage came to be judged twice by hand and the current window's not
  at all. There is ONE judge (`judgeAnalyticsComparison`, composed here) and the
  `21`-day threshold is derived from `COMPARISON_COVERAGE_MIN_SHARE`, never
  typed into a component.
*/
describe("one comparison judge, no second copy", () => {
  const fs = require("node:fs") as typeof import("node:fs");
  const path = require("node:path") as typeof import("node:path");
  const root = path.join(__dirname, "..");

  function walk(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return walk(full);
      return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)
        ? [full]
        : [];
    });
  }

  /** Code only: the rule is allowed to be DESCRIBED in a comment (this file
   *  and two components say what the old threshold was and why it went). */
  function withoutComments(text: string): string {
    return text
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
  }

  const sources = walk(root).map((file) => ({
    file: path.relative(root, file),
    text: withoutComments(fs.readFileSync(file, "utf8")),
  }));

  it("carries no hand-typed coverage threshold in any marketing surface", () => {
    const offenders = sources
      .filter(({ text }) => /(prev_days|prevDays)\s*(>=|<)\s*\d+/.test(text))
      .map(({ file }) => file);
    expect(offenders).toEqual([]);
  });

  it("declares `trendPercent` nowhere — the judge is the only entry point", () => {
    const offenders = sources
      .filter(({ text }) => /function trendPercent/.test(text))
      .map(({ file }) => file);
    expect(offenders).toEqual([]);
  });
});

/*
  A ZERO BASELINE IS ITS OWN VERDICT (round-4 finding V14-8, 2026-09-17).

  `percent` was set to null whenever `previous <= 0` while the comparison stayed
  `comparable` and its caveat stayed null — so both pills took the refusal branch
  and printed **"no comparison · 28 of 28 days now vs 28 of 28"** with the tooltip
  *"The two windows were not collected alike."* They were collected identically.
  The verifier measured exactly that on five live sites. Growth from zero has no
  percentage; that is a different fact from a coverage gap, and the reader is owed
  the right one.
*/
describe("a zero previous total", () => {
  const zeroBaseline = judgeGscWindowDelta({
    current: 143,
    previous: 0,
    currentDaysWithData: 28,
    previousDaysWithData: 28,
  });

  it("is `no_baseline`, never a coverage refusal", () => {
    expect(zeroBaseline.verdict).toBe("no_baseline");
    expect(zeroBaseline.percent).toBeNull();
    // The coverage judge is untouched and still says the windows agree.
    expect(zeroBaseline.comparison.state).toBe("comparable");
  });

  it("says there is no previous period to compare, and never the coverage line", () => {
    expect(zeroBaseline.caveat).toContain("no previous period to compare");
    expect(zeroBaseline.caveat).not.toContain("were not collected alike");
    expect(zeroBaseline.caveat).not.toContain("of 28 days collected");
    // It still tells the reader what happened: 0 before, 143 now.
    expect(zeroBaseline.caveat).toContain("143");
  });

  it("labels the pill for what it is — the sentence the five live sites got wrong", () => {
    expect(gscDeltaRefusalLabel(zeroBaseline)).not.toContain("no comparison");
    expect(gscDeltaRefusalLabel(zeroBaseline)).toContain("no previous period");
  });

  it("is still a coverage refusal when the coverage IS the problem", () => {
    const thin = judgeGscWindowDelta({
      current: 143,
      previous: 0,
      currentDaysWithData: 28,
      previousDaysWithData: 4,
    });
    // Coverage outranks the zero: with 4 of 28 previous days the zero itself is
    // not a measurement, so claiming "nothing happened before" would be a guess.
    expect(thin.verdict).toBe("coverage_refused");
    expect(thin.caveat).toContain("4 of 28");
  });

  it("a total that was never returned says THAT, not that the base was zero", () => {
    const missing = judgeGscWindowDelta({
      current: null,
      previous: 100,
      currentDaysWithData: 28,
      previousDaysWithData: 28,
    });
    expect(missing.verdict).toBe("unknown_totals");
    expect(missing.caveat).toContain("not returned");
    expect(gscDeltaRefusalLabel(missing)).toContain("no number");
  });

  it("every refused delta carries its own sentence — no pill needs a fallback", () => {
    // The two pills print `delta.caveat ?? "The two windows were not collected
    // alike."`; that fallback is the V14-8 sentence, and it must be unreachable.
    for (const delta of [
      zeroBaseline,
      judgeGscWindowDelta({
        current: 1,
        previous: null,
        currentDaysWithData: 28,
        previousDaysWithData: 28,
      }),
      judgeGscWindowDelta({
        current: 110,
        previous: 370,
        currentDaysWithData: 8,
        previousDaysWithData: 23,
      }),
      judgeGscWindowDelta({
        current: 0,
        previous: 0,
        currentDaysWithData: 28,
        previousDaysWithData: 28,
      }),
    ]) {
      expect(delta.percent).toBeNull();
      expect(delta.caveat).toBeTruthy();
    }
  });

  it("two zero windows say nothing has been recorded either side", () => {
    const both = judgeGscWindowDelta({
      current: 0,
      previous: 0,
      currentDaysWithData: 28,
      previousDaysWithData: 28,
    });
    expect(both.verdict).toBe("no_baseline");
    expect(both.caveat).toContain("no previous period to compare");
    expect(both.caveat).toContain("nothing in this one either");
  });
});
