/*
  ONE DISCLOSURE LIST — round-2 verdict NEW-B4.

  The tile refused the comparison; the Copy / Copy-for-AI payload beside it
  printed `Sessions 14,909 (was 4,485)` — the exact pair the tile refuses — and
  appended every caveat EXCEPT `comparison.caveat`. A number is pasted into a
  document or handed to an agent far from the tile that qualified it, so the
  caveat has to be IN the payload. These cases hold the list, the chart legend
  and the copy lines to the same single source.
*/

import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  analyticsCopyLines,
  analyticsDisclosures,
  disclosedMetricLine,
  previousSeriesDisclosure,
} from "@/features/marketing/analytics/disclosures";
import { judgeAnalyticsComparison } from "@/features/marketing/analytics/window";
import type { AnalyticsTotals } from "@/features/marketing/analytics/window";

/** The live All Green shape the +232% came from: 28 of 28 now, 6 of 28 before. */
const refused = judgeAnalyticsComparison({
  currentDaysWithData: 28,
  previousDaysWithData: 6,
  windowDays: 28,
});
const comparable = judgeAnalyticsComparison({
  currentDaysWithData: 28,
  previousDaysWithData: 28,
  windowDays: 28,
});

function totals(sessions: number): AnalyticsTotals {
  return {
    sessions,
    users: sessions,
    engagedSessions: sessions,
    conversions: 0,
    keyEvents: 0,
    views: sessions,
  };
}

const windowData = (comparison: typeof refused) => ({
  comparison,
  caveats: [
    {
      id: "users-not-unique" as const,
      headline: "Users are summed, so visitors can count twice",
      detail: "…",
    },
  ],
  current: { start: "2026-08-01", end: "2026-08-28" },
  totals: totals(14_909),
  previousTotals: totals(4_485),
  daysWithData: 28,
  propertyTimezone: "America/Los_Angeles",
});

describe("analyticsDisclosures", () => {
  it("leads with the comparison caveat and keeps every GA4 caveat", () => {
    const list = analyticsDisclosures(windowData(refused));
    expect(list.map((entry) => entry.id)).toEqual(["comparison", "users-not-unique"]);
    expect(list[0].headline).toBe(refused.caveat);
  });

  it("holds no comparison entry when both windows were collected alike", () => {
    expect(
      analyticsDisclosures(windowData(comparable)).map((entry) => entry.id),
    ).toEqual(["users-not-unique"]);
  });
});

describe("the copy payload carries the refusal", () => {
  it("never prints the was-pair the tile refuses", () => {
    const lines = analyticsCopyLines({ window: windowData(refused) });
    const sessions = lines.find(([label]) => label === "Sessions")?.[1] ?? "";
    expect(sessions).toContain("14,909");
    expect(sessions).not.toContain("(was 4,485)");
    expect(sessions).toContain("no comparison");
    expect(sessions).toContain("per collected day");
  });

  it("prints the comparison caveat as a caveat line", () => {
    const lines = analyticsCopyLines({ window: windowData(refused) });
    const caveats = lines.filter(([label]) => label === "Caveat").map(([, value]) => value);
    expect(caveats).toContain(refused.caveat);
    expect(caveats).toContain("Users are summed, so visitors can count twice");
  });

  it("states both windows' collected days on the payload itself", () => {
    const lines = analyticsCopyLines({ window: windowData(refused) });
    expect(lines.find(([label]) => label === "Days collected")?.[1]).toBe(
      "28 of 28 now, 6 of 28 in the previous window",
    );
  });

  it("prints the plain comparison when the two windows ARE comparable", () => {
    const lines = analyticsCopyLines({ window: windowData(comparable) });
    expect(lines.find(([label]) => label === "Sessions")?.[1]).toBe(
      "14,909 (was 4,485)",
    );
  });
});

describe("disclosedMetricLine / previousSeriesDisclosure", () => {
  it("is the same choice the tile makes", () => {
    const line = disclosedMetricLine({
      metric: "sessions",
      totals: totals(14_909),
      previousTotals: totals(4_485),
      daysWithData: 28,
      comparison: refused,
    });
    expect(line).toContain("6 of 28 previous days collected against 28 now");
  });

  it("hides the previous series and says why when the comparison is refused", () => {
    const disclosure = previousSeriesDisclosure(refused, true);
    expect(disclosure.shown).toBe(false);
    expect(disclosure.note).toBe(refused.caveat);
  });

  it("shows it, with no note, when both windows are complete", () => {
    expect(previousSeriesDisclosure(comparable, true)).toEqual({
      shown: true,
      label: "Previous period",
      note: null,
    });
  });

  it("says nothing at all when there is no previous day stored", () => {
    expect(previousSeriesDisclosure(refused, false).note).toBeNull();
  });
});

/*
  …and the panel itself must not assemble a second list. This is a SOURCE guard
  because the defect was not in any function's behaviour: `SiteAnalyticsPanel`
  hand-built `${integer(current)} (was ${integer(previous)})` inline and appended
  `data.caveats` only, so no test of a shared helper could have caught it. It
  fails on the pre-fix bytes of that file.
*/
describe("SiteAnalyticsPanel builds its copy from the ONE list", () => {
  const source = readFileSync(
    join(__dirname, "components", "SiteAnalyticsPanel.tsx"),
    "utf8",
  );

  it("calls the shared builders", () => {
    expect(source).toContain("analyticsCopyLines(");
    expect(source).toContain("analyticsDisclosures(");
  });

  it("hand-builds no was-pair and no second caveat list", () => {
    expect(source).not.toMatch(/\(was \$\{/);
    expect(source).not.toMatch(/data\.caveats\.map/);
  });

  it("prints the comparison sentence from the comparison itself", () => {
    expect(source).toContain("{data.comparison.caveat}");
    expect(source).not.toContain("No comparison — the previous");
  });
});
