/**
 * A SCREEN NEVER LIES — Local Storage admin usage meter.
 *
 * The meter divided `used / (used + remaining)`. When both readings are 0
 * (nothing stored and no quota reported) that is 0/0 = NaN, and the tooltip
 * rendered the sentence "NaN% used". An indeterminate ratio is unknown, and
 * unknown reads as an em-dash — never as a number.
 */

import {
  storageUsageBarWidth,
  storageUsagePercentLabel,
} from "@/features/administration/local-storage/storage-usage";

describe("storageUsagePercentLabel", () => {
  it("reads as unknown when the denominator is zero (0/0)", () => {
    expect(storageUsagePercentLabel({ used: 0, remaining: 0 })).toBe(
      "— used (total capacity unknown)",
    );
  });

  it("reads as unknown when a reading is not a finite number", () => {
    expect(
      storageUsagePercentLabel({ used: Number.NaN, remaining: 100 }),
    ).toBe("— used (total capacity unknown)");
    expect(
      storageUsagePercentLabel({ used: 10, remaining: Number.NaN }),
    ).toBe("— used (total capacity unknown)");
  });

  it("still reads 0.0% when nothing is used but capacity IS known", () => {
    expect(storageUsagePercentLabel({ used: 0, remaining: 1000 })).toBe(
      "0.0% used",
    );
  });

  it("renders a real ratio", () => {
    expect(storageUsagePercentLabel({ used: 250, remaining: 750 })).toBe(
      "25.0% used",
    );
  });
});

describe("storageUsageBarWidth", () => {
  it("draws nothing when the ratio is indeterminate", () => {
    expect(storageUsageBarWidth({ used: 0, remaining: 0 })).toBe("0%");
    expect(storageUsageBarWidth({ used: Number.NaN, remaining: 0 })).toBe("0%");
  });

  it("clamps an over-quota reading to a full bar instead of overflowing", () => {
    // `remaining` is 5MB-minus-used, so an over-quota origin makes it
    // negative and the raw ratio exceeds 100%.
    expect(storageUsageBarWidth({ used: 150, remaining: -50 })).toBe("100%");
  });

  it("renders a real ratio", () => {
    expect(storageUsageBarWidth({ used: 250, remaining: 750 })).toBe("25%");
  });
});
