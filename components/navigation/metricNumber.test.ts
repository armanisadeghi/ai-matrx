import { formatMetricNumber } from "./metricNumber";

describe("formatMetricNumber", () => {
  it("keeps five-digit metrics exact and compactly formats six-digit metrics", () => {
    expect(formatMetricNumber(99_999)).toBe("99,999");
    expect(formatMetricNumber(100_000)).toBe("100K");
    expect(formatMetricNumber(128_567)).toBe("128.6K");
  });

  it("scales through millions and billions", () => {
    expect(formatMetricNumber(1_000_000)).toBe("1M");
    expect(formatMetricNumber(1_250_000)).toBe("1.3M");
    expect(formatMetricNumber(2_000_000_000)).toBe("2B");
  });
});
