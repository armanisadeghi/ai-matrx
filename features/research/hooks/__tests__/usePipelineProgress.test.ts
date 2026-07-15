import { sumCompletedAiCosts } from "../usePipelineProgress";

describe("sumCompletedAiCosts", () => {
  it("sums only catalog-derived completion costs", () => {
    expect(
      sumCompletedAiCosts([
        { status: "success", metadata: { cost_usd: 0.0042 } },
        { status: "success", metadata: { cost_usd: 0.0018 } },
        { status: "failed", metadata: {} },
      ]),
    ).toBeCloseTo(0.006);
  });

  it("returns unknown when any successful operation has no priced usage", () => {
    expect(
      sumCompletedAiCosts([
        { status: "success", metadata: { cost_usd: 0.0042 } },
        { status: "success", metadata: { cost_usd: null } },
      ]),
    ).toBeNull();
  });

  it("reports zero before any AI operation completes", () => {
    expect(sumCompletedAiCosts([])).toBe(0);
  });
});
