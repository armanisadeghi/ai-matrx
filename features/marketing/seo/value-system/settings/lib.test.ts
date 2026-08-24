import type { ValueLevel } from "./data";
import { findValueLevelIssues, mayRemoveValueLevel } from "./lib";

const coherent: ValueLevel[] = [
  { value: "platinum", label: "Platinum", min_score: 200 },
  { value: "minimal", label: "Minimal", min_score: 0 },
  { value: "negative", label: "Negative", min_score: null },
];

describe("value settings level contract", () => {
  it("accepts the baseline-era score scale and reserved guard", () => {
    expect(findValueLevelIssues(coherent)).toEqual([]);
  });

  it("prevents removing the reserved guard at every rung", () => {
    const negative = coherent[2];
    expect(mayRemoveValueLevel("org", negative)).toBe(false);
    expect(mayRemoveValueLevel("site", negative)).toBe(false);
  });

  it("keeps platform vocabulary identities out of the settings editor", () => {
    expect(mayRemoveValueLevel("platform", coherent[0])).toBe(false);
    expect(mayRemoveValueLevel("brand", coherent[0])).toBe(true);
  });

  it("blocks a draft that lost the reserved guard", () => {
    expect(findValueLevelIssues(coherent.slice(0, 2))).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining("reserved Negative band must stay"),
        }),
      ]),
    );
  });
});
