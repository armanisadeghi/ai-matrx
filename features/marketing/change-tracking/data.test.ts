import { evaluateMetricVerdict } from "./data";

const baseRule = {
  minimum_data_days: 7,
  target_value: null,
  target_change_pct: 10,
  direction: "increase",
};

describe("evaluateMetricVerdict", () => {
  it("refuses to call a theory before its minimum evidence window", () => {
    expect(evaluateMetricVerdict(baseRule, 100, 140, 6)).toBe("too_early");
  });

  it("supports an increase only when its declared threshold is reached", () => {
    expect(evaluateMetricVerdict(baseRule, 100, 110, 7)).toBe("supported");
    expect(evaluateMetricVerdict(baseRule, 100, 109, 7)).toBe("refuted");
  });

  it("handles lower-is-better measures such as average position", () => {
    const rule = { ...baseRule, direction: "decrease", target_change_pct: 15 };
    expect(evaluateMetricVerdict(rule, 20, 16, 7)).toBe("supported");
    expect(evaluateMetricVerdict(rule, 20, 18, 7)).toBe("refuted");
  });

  it("keeps missing evidence visibly inconclusive", () => {
    expect(evaluateMetricVerdict(baseRule, null, 120, 7)).toBe("inconclusive");
  });
});
