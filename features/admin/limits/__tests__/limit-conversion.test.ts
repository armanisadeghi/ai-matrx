/**
 * The two facts this admin surface can get catastrophically wrong, guarded.
 *
 * These numbers are what `billing.resolve_capability` hands to every gate on
 * the platform, so a rounding slip or a blank read as a zero changes what a
 * paying customer is allowed to do.
 */

import {
  MICRO_USD_PER_USD,
  limitToDisplay,
  limitToStored,
} from "@/features/admin/limits/types";

const MONEY = "seo.provider_spend";
const COUNT = "outreach.send_volume";

describe("blank is unlimited and 0 is not", () => {
  it("renders unlimited as blank, never as 0", () => {
    expect(limitToDisplay(MONEY, null)).toBe("");
    expect(limitToDisplay(COUNT, null)).toBe("");
    // 0 is a real, different fact: the plan does not include this at all.
    expect(limitToDisplay(COUNT, 0)).toBe("0");
  });

  it("stores blank as null and 0 as 0", () => {
    expect(limitToStored(MONEY, "")).toBeNull();
    expect(limitToStored(MONEY, "   ")).toBeNull();
    expect(limitToStored(COUNT, "0")).toBe(0);
  });
});

describe("money dimensions round-trip through micro-dollars", () => {
  it("shows dollars and stores micro-dollars", () => {
    expect(limitToDisplay(MONEY, 5_000_000)).toBe("5");
    expect(limitToStored(MONEY, "5")).toBe(5 * MICRO_USD_PER_USD);
    expect(limitToStored(MONEY, "12.50")).toBe(12_500_000);
  });

  it("survives a round trip without drift", () => {
    for (const dollars of ["5", "15", "0.25", "0.01", "400"]) {
      const stored = limitToStored(MONEY, dollars);
      expect(stored).not.toBeUndefined();
      expect(Number(limitToDisplay(MONEY, stored as number))).toBeCloseTo(
        Number(dollars),
        6,
      );
    }
  });

  it("leaves non-money dimensions alone", () => {
    expect(limitToStored(COUNT, "1500")).toBe(1500);
    expect(limitToDisplay(COUNT, 1500)).toBe("1500");
  });
});

describe("a value we cannot store is refused, never guessed", () => {
  it.each(["abc", "-1", "NaN", "1e999", "Infinity"])("refuses %s", (raw) => {
    expect(limitToStored(MONEY, raw)).toBeUndefined();
  });
});
