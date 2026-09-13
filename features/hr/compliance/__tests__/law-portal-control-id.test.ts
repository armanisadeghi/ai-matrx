import { platformRuleAppliesControlId } from "../law-portal-control-id";

describe("law portal applies control ids", () => {
  it("gives six retention rows in the same federal decision scope distinct DOM ids", () => {
    const ids = [
      "retention-federal-01",
      "retention-federal-02",
      "retention-federal-03",
      "retention-federal-04",
      "retention-federal-05",
      "retention-federal-06",
    ].map((id) =>
      platformRuleAppliesControlId({
        id,
        rule_class: "retention-period",
        jurisdiction_key: "US",
      }),
    );

    expect(ids).toEqual([
      "applies-retention-period-US-retention-federal-01",
      "applies-retention-period-US-retention-federal-02",
      "applies-retention-period-US-retention-federal-03",
      "applies-retention-period-US-retention-federal-04",
      "applies-retention-period-US-retention-federal-05",
      "applies-retention-period-US-retention-federal-06",
    ]);
    expect(new Set(ids).size).toBe(6);
  });
});
