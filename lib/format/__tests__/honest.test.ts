import {
  clampedBarWidth,
  formatCount,
  formatPercentFromFraction,
  formatUsd,
  isKnownNumber,
  safeRatio,
} from "@/lib/format/honest";

describe("isKnownNumber", () => {
  it("accepts a measured zero and rejects every flavour of unknown", () => {
    expect(isKnownNumber(0)).toBe(true);
    expect(isKnownNumber(-1.5)).toBe(true);
    expect(isKnownNumber(null)).toBe(false);
    expect(isKnownNumber(undefined)).toBe(false);
    expect(isKnownNumber(Number.NaN)).toBe(false);
    expect(isKnownNumber(Number.POSITIVE_INFINITY)).toBe(false);
    expect(isKnownNumber("0")).toBe(false);
  });
});

describe("formatUsd", () => {
  it("never turns an unknown cost into money", () => {
    expect(formatUsd(null, { digits: 4 })).toBe("—");
    expect(formatUsd(undefined, { digits: 4 })).toBe("—");
    expect(formatUsd(Number.NaN, { digits: 4 })).toBe("—");
  });
  it("prints a measured zero as zero", () => {
    expect(formatUsd(0, { digits: 4 })).toBe("$0.0000");
    expect(formatUsd(0)).toBe("$0.00");
  });
  it("prints a real cost", () => {
    expect(formatUsd(1.23456, { digits: 4 })).toBe("$1.2346");
  });
});

describe("formatCount", () => {
  it("separates a measured zero from an unmeasured one", () => {
    expect(formatCount(0)).toBe("0");
    expect(formatCount(null)).toBe("—");
    expect(formatCount(1234)).toBe((1234).toLocaleString());
  });
});

describe("safeRatio", () => {
  it("returns null for an indeterminate division", () => {
    expect(safeRatio(0, 0)).toBeNull();
    expect(safeRatio(5, 0)).toBeNull();
    expect(safeRatio(null, 10)).toBeNull();
    expect(safeRatio(10, null)).toBeNull();
    expect(safeRatio(Number.NaN, 10)).toBeNull();
  });
  it("returns a real ratio, including a real zero", () => {
    expect(safeRatio(0, 10)).toBe(0);
    expect(safeRatio(250, 1000)).toBe(0.25);
  });
});

describe("formatPercentFromFraction", () => {
  it("renders unknown as an em-dash and a real zero as 0%", () => {
    expect(formatPercentFromFraction(null)).toBe("—");
    expect(formatPercentFromFraction(0)).toBe("0%");
    expect(formatPercentFromFraction(0.25)).toBe("25%");
    expect(formatPercentFromFraction(0.256, { digits: 2 })).toBe("25.60%");
  });
  it("does NOT hide a percentage over 100 — that is a real signal", () => {
    expect(formatPercentFromFraction(1.5)).toBe("150%");
  });
});

describe("clampedBarWidth", () => {
  it("draws nothing for an unknown fraction", () => {
    expect(clampedBarWidth(null)).toBe("0%");
    expect(clampedBarWidth(Number.NaN)).toBe("0%");
  });
  it("clamps out-of-range fractions into the track", () => {
    expect(clampedBarWidth(1.5)).toBe("100%");
    expect(clampedBarWidth(-0.2)).toBe("0%");
    expect(clampedBarWidth(0.25)).toBe("25%");
  });
});
