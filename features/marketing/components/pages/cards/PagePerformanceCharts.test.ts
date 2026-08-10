import { buildPerformanceHistoryPoints } from "@/features/marketing/components/pages/cards/PagePerformanceCharts";
import type { PagePerformanceSample } from "@/features/marketing/pagespeed/data";

function sample(
  strategy: "mobile" | "desktop",
  observedAt: string,
  score: number,
): PagePerformanceSample {
  return {
    id: `${strategy}-${observedAt}`,
    run_id: `run-${strategy}`,
    provider: "pagespeed_insights",
    strategy,
    observed_at: observedAt,
    performance_score: score,
  };
}

describe("buildPerformanceHistoryPoints", () => {
  it("sorts oldest first and keeps one line value per strategy", () => {
    expect(
      buildPerformanceHistoryPoints([
        sample("desktop", "2026-08-09T12:00:00Z", 0.92),
        sample("mobile", "2026-08-08T12:00:00Z", 0.71),
      ]),
    ).toEqual([
      {
        observedAt: "2026-08-08T12:00:00Z",
        mobile: 71,
        desktop: null,
      },
      {
        observedAt: "2026-08-09T12:00:00Z",
        mobile: null,
        desktop: 92,
      },
    ]);
  });
});
