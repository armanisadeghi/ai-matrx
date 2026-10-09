
import {
  OUTLIER_CAP,
  formatCompact,
  formatMultiplier,
  formatPercentile,
  outlierBadgeModel,
  outlierTier,
} from "../outlier";

const base = { baselineViews: 31_000, percentile: 97, baselineWindow: 30, ageHours: 100 };

describe("outlier tiers", () => {
  it.each([
    [null, "none"],
    [0.4, "plain"],
    [1.99, "plain"],
    [2, "neutral"],
    [3.99, "neutral"],
    [4, "accent"],
    [9.99, "accent"],
    [10, "strong"],
    [250, "strong"],
  ] as const)("score %s is tier %s", (score, tier) => {
    expect(outlierTier(score)).toBe(tier);
  });
});

describe("multiplier text", () => {
  it("uses one decimal under 10x and integers from 10x", () => {
    expect(formatMultiplier(4.2)).toBe("4.2x");
    expect(formatMultiplier(2)).toBe("2.0x");
    expect(formatMultiplier(12.4)).toBe("12x");
  });
  it("rolls 9.96 up to 10x, not 10.0x", () => {
    expect(formatMultiplier(9.96)).toBe("10x");
  });
  it("caps at 99x+", () => {
    expect(formatMultiplier(OUTLIER_CAP)).toBe("99x+");
    expect(formatMultiplier(1200)).toBe("99x+");
  });
});

describe("badge model", () => {
  it("shows the multiplier, bars and the spec tooltip", () => {
    const m = outlierBadgeModel({ score: 4.2, ...base });
    expect(m.text).toBe("4.2x");
    expect(m.tier).toBe("accent");
    expect(m.bars).toBe(2);
    expect(m.tooltip).toBe("4.2x this creator's median (31K). Percentile 97 of last 30.");
  });
  it("has no baseline: em dash, never 0x or 1.0x", () => {
    const m = outlierBadgeModel({ score: null, baselineViews: null, percentile: null, baselineWindow: null, ageHours: 500 });
    expect(m.text).toBe("—");
    expect(m.tooltip).toBe("Needs 10 posts of history");
    expect(m.bars).toBe(0);
  });
  it("marks a young post with a tilde and its own tooltip", () => {
    const m = outlierBadgeModel({ score: 4.2, ...base, ageHours: 6 });
    expect(m.text).toBe("~4.2x");
    expect(m.tilde).toBe(true);
    expect(m.tooltip).toBe("Still gaining views");
  });
  it("a sub-2x score is plain text with no bars", () => {
    const m = outlierBadgeModel({ score: 1.3, ...base });
    expect(m.tier).toBe("plain");
    expect(m.bars).toBe(0);
    expect(m.text).toBe("1.3x");
  });
  it("strong tier carries three bars", () => {
    expect(outlierBadgeModel({ score: 25, ...base }).bars).toBe(3);
  });
});

describe("number formats", () => {
  it("compacts and never invents a zero", () => {
    expect(formatCompact(null)).toBe("—");
    expect(formatCompact(undefined)).toBe("—");
    expect(formatCompact(118_589_135)).toBe("119M");
    expect(formatCompact(31_000)).toBe("31K");
    expect(formatCompact(950)).toBe("950");
    expect(formatCompact(1_250)).toBe("1.3K");
  });
  it("percentile", () => {
    expect(formatPercentile(96.6)).toBe("P97");
    expect(formatPercentile(null)).toBe("—");
  });
});
