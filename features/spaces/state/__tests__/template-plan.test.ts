/**
 * Round 18 regression (I2): Templates → "Use template" on the Traveling SMM™ OS made no copy — it opened
 * the person's existing sample page. "Use template" always opens a new page; "Add the sample" opens the one sample.
 */
import { sampleTemplatePlan } from "../template-plan";

describe("Use template on the built-in sample", () => {
  it("copies the sample when one already exists", () => {
    expect(sampleTemplatePlan(true, "sample-1", "sample-1")).toEqual({ kind: "copy", of: "sample-1" });
  });
  it("opens the sample it just made (that page is the new one)", () => {
    expect(sampleTemplatePlan(true, null, "made-1")).toEqual({ kind: "open", id: "made-1" });
  });
  it("Add the sample opens the one sample page, never a copy", () => {
    expect(sampleTemplatePlan(false, "sample-1", "sample-1")).toEqual({ kind: "open", id: "sample-1" });
  });
});
