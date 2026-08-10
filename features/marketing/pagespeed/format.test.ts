import {
  fieldCategoryTone,
  lighthouseScore,
  lighthouseTone,
  metricTone,
  regressionVerdict,
} from "@/features/marketing/pagespeed/format";
import type { PagePerformanceRegression } from "@/features/marketing/pagespeed/data";

describe("PageSpeed presentation rules", () => {
  it("uses Google's Lighthouse 90/50 thresholds", () => {
    expect(lighthouseScore(0.901)).toBe(90);
    expect(lighthouseTone(0.9)).toBe("good");
    expect(lighthouseTone(0.89)).toBe("warning");
    expect(lighthouseTone(0.5)).toBe("warning");
    expect(lighthouseTone(0.49)).toBe("bad");
  });

  it("uses inclusive Core Web Vitals boundaries", () => {
    expect(metricTone(2500, 2500, 4000)).toBe("good");
    expect(metricTone(4000, 2500, 4000)).toBe("warning");
    expect(metricTone(4001, 2500, 4000)).toBe("bad");
    expect(fieldCategoryTone("NEEDS_IMPROVEMENT")).toBe("warning");
  });

  it("states score drops as an explicit verdict", () => {
    const regression: PagePerformanceRegression = {
      strategy: "mobile",
      metric: "performance_score",
      data_kind: "lab",
      previous_observed_at: "2026-08-08T12:00:00Z",
      current_observed_at: "2026-08-09T12:00:00Z",
      previous_value: 0.91,
      current_value: 0.74,
      delta: -0.17,
    };
    expect(regressionVerdict(regression)).toContain(
      "Mobile lab performance dropped 17 points",
    );
    expect(regressionVerdict(regression)).toContain("91 → 74");
  });
});
