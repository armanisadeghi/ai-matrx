import type { HrPlatformLawRule } from "../../types";
import { ruleClassSummary } from "../law-portal-summary";

function rule(opted_out = false): HrPlatformLawRule {
  return { opted_out } as HrPlatformLawRule;
}

describe("law portal class summaries", () => {
  it("keeps the apply and removal accounting for a jurisdiction that reaches the organization", () => {
    expect(ruleClassSummary([rule(), rule(true), rule()], true)).toBe("2 applies");
  });

  it("never says an out-of-scope library rule applies to this organization", () => {
    expect(ruleClassSummary([rule(), rule()], false)).toBe("2 tracked");
  });
});
