/**
 * A SCREEN NEVER LIES — pie-slice labels.
 *
 * Recharts omits `percent` when it cannot compute one (a zero-sum data set,
 * a non-numeric value). The label rendered "0%" for that, which tells the
 * reader the slice is empty when in truth nobody knows its share.
 */

import { pieSliceLabel } from "@/components/mardown-display/blocks/chart/labels";

describe("pieSliceLabel", () => {
  it("renders an unknown share as an em-dash, not 0%", () => {
    expect(pieSliceLabel({ name: "Alpha" })).toBe("Alpha —");
    expect(pieSliceLabel({ name: "Alpha", percent: undefined })).toBe("Alpha —");
    expect(pieSliceLabel({ name: "Alpha", percent: Number.NaN })).toBe(
      "Alpha —",
    );
  });

  it("still renders a REAL zero share as 0%", () => {
    expect(pieSliceLabel({ name: "Alpha", percent: 0 })).toBe("Alpha 0%");
  });

  it("renders a real share", () => {
    expect(pieSliceLabel({ name: "Alpha", percent: 0.25 })).toBe("Alpha 25%");
  });
});
