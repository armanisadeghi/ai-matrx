/**
 * What is left of this suite after the honest-number formatters moved into
 * `@ai-matrx/kit/format` (kit 0.12.0, 2026-09-12).
 *
 * The assertions for `formatUsd`, `formatCount`, `formatPercentFromFraction`,
 * `safeRatio` and `isKnownNumber` moved WITH the code and now live in the
 * package's own suite, widened there to cover `sumKnown` and the
 * all-zero-versus-nothing-measured distinction. Re-asserting them here would
 * test a re-export, not a behaviour.
 *
 * `clampedBarWidth` stayed host-local on purpose — it CLAMPS, which is the
 * opposite of the contract the moved functions carry, and is defensible only
 * because a progress bar is decoration. So its test stayed too.
 */

import { clampedBarWidth } from "@/lib/format/honest";

describe("clampedBarWidth", () => {
  it("draws nothing for an unknown fraction", () => {
    expect(clampedBarWidth(null)).toBe("0%");
    expect(clampedBarWidth(undefined)).toBe("0%");
    expect(clampedBarWidth(Number.NaN)).toBe("0%");
  });
  it("clamps out-of-range fractions into the track", () => {
    expect(clampedBarWidth(1.5)).toBe("100%");
    expect(clampedBarWidth(-0.2)).toBe("0%");
    expect(clampedBarWidth(0.25)).toBe("25%");
  });
  it("keeps a measured zero at zero rather than treating it as unknown", () => {
    expect(clampedBarWidth(0)).toBe("0%");
  });
});
