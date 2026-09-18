/*
  THE PICTURE OBEYS THE NUMBER — round-2 verdict NEW-B3.

  The tile refuses a comparison when the two windows were not collected alike;
  the chart under it used to draw the previous window anyway, on the CURRENT
  window's index scale, so the dashed line was squeezed into the first six
  twenty-eighths of the axis and read as a collapse. These cases hold the chart
  to the tile's verdict and to date alignment:

    · a refused comparison draws NO dashed series and says why, in the tile's
      words;
    · a comparable one aligns by offset from each window's own start, so a
      previous window missing its first day starts one day in — not at x(0);
    · an uncollected day is a GAP, never a straight line across it.
*/

import { renderToStaticMarkup } from "react-dom/server";

import { AnalyticsTrendChart } from "@/features/marketing/analytics/components/AnalyticsTrendChart";
import {
  alignWindowDays,
  contiguousRuns,
  dayAtOffset,
  dayOffset,
} from "@/features/marketing/analytics/chart-alignment";
import { judgeAnalyticsComparison } from "@/features/marketing/analytics/window";
import type { AnalyticsDayPoint } from "@/features/marketing/analytics/window";

function day(date: string, sessions: number): AnalyticsDayPoint {
  return { date, sessions, users: sessions, engagedSessions: sessions, conversions: 0 };
}

/** `count` consecutive days from `start`, skipping the offsets in `skip`. */
function days(start: string, count: number, skip: number[] = []): AnalyticsDayPoint[] {
  const out: AnalyticsDayPoint[] = [];
  const [y, m, d] = start.split("-").map(Number);
  for (let offset = 0; offset < count; offset += 1) {
    if (skip.includes(offset)) continue;
    const date = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1) + offset * 86_400_000)
      .toISOString()
      .slice(0, 10);
    out.push(day(date, 100 + offset));
  }
  return out;
}

/** The `d` of every dashed (previous-period) path in the rendered markup. */
const dashed = (markup: string): string[] =>
  [...markup.matchAll(/<path\b[^>]*>/g)]
    .map((match) => match[0])
    .filter((tag) => tag.includes("stroke-dasharray"))
    .map((tag) => /\sd="([^"]+)"/.exec(tag)?.[1] ?? "");

describe("chart alignment — offsets, not array positions", () => {
  it("places a day by its offset from its own window start", () => {
    const aligned = alignWindowDays(days("2026-09-01", 3, [1]), "2026-09-01", 3);
    expect(aligned.map((entry) => entry.offset)).toEqual([0, 2]);
    expect(dayOffset("2026-09-03", "2026-09-01")).toBe(2);
  });

  it("drops days that belong to another window", () => {
    expect(
      alignWindowDays([day("2026-08-31", 5), day("2026-09-01", 5)], "2026-09-01", 2),
    ).toHaveLength(1);
  });

  it("breaks the line where a day was never collected", () => {
    const runs = contiguousRuns(
      alignWindowDays(days("2026-09-01", 5, [2]), "2026-09-01", 5),
    );
    expect(runs.map((run) => run.map((entry) => entry.offset))).toEqual([
      [0, 1],
      [3, 4],
    ]);
  });

  it("answers a hover by date offset, not by collected position", () => {
    const aligned = alignWindowDays(days("2026-09-01", 4, [0]), "2026-09-01", 4);
    // Offset 0 was never collected: the honest answer is nothing, not day two.
    expect(dayAtOffset(aligned, 0)).toBeNull();
    expect(dayAtOffset(aligned, 1)?.date).toBe("2026-09-02");
  });
});

describe("AnalyticsTrendChart — the refused comparison", () => {
  const refused = judgeAnalyticsComparison({
    currentDaysWithData: 28,
    previousDaysWithData: 6,
    windowDays: 28,
  });

  it("draws no previous series and prints the tile's reason", () => {
    const markup = renderToStaticMarkup(
      <AnalyticsTrendChart
        series={days("2026-08-21", 28)}
        previousSeries={days("2026-07-24", 6)}
        currentStart="2026-08-21"
        previousStart="2026-07-24"
        windowDays={28}
        comparison={refused}
        visible={["sessions"]}
        onToggle={() => undefined}
      />,
    );
    expect(refused.state).toBe("refused");
    expect(dashed(markup)).toHaveLength(0);
    expect(markup).toContain("Previous period hidden");
    expect(markup).toContain("only 6 of 28 days collected");
  });

  it("draws the previous series aligned to its own window start when comparable", () => {
    const comparison = judgeAnalyticsComparison({
      currentDaysWithData: 28,
      previousDaysWithData: 27,
      windowDays: 28,
    });
    const markup = renderToStaticMarkup(
      <AnalyticsTrendChart
        series={days("2026-08-21", 28)}
        // The previous window's FIRST day was never collected.
        previousSeries={days("2026-07-24", 28, [0])}
        currentStart="2026-08-21"
        previousStart="2026-07-24"
        windowDays={28}
        comparison={comparison}
        visible={["sessions"]}
        onToggle={() => undefined}
      />,
    );
    expect(comparison.state).toBe("comparable");
    const paths = dashed(markup);
    expect(paths).toHaveLength(1);
    const firstX = Number(paths[0].replace(/^M/, "").split(",")[0]);
    const solid = [...markup.matchAll(/<path\b[^>]*>/g)]
      .map((match) => match[0])
      .filter((tag) => !tag.includes("stroke-dasharray"))
      .map((tag) => /\sd="M([\d.]+),/.exec(tag)?.[1] ?? "");
    const currentFirstX = Number(solid[0]);
    // One day in, not at the current window's first day.
    expect(firstX).toBeGreaterThan(currentFirstX);
    expect(markup).toContain("Previous period");
  });
});
