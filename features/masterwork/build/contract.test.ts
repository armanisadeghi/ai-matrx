import {
  buildDeliverableValue,
  isBuildDeliverableValid,
  MASTERWORK_DELIVERABLE_MAX_LENGTH,
} from "./contract";

describe("Masterwork Build deliverable contract", () => {
  it("accepts the API boundary and rejects descriptions beyond it", () => {
    expect(isBuildDeliverableValid("x".repeat(MASTERWORK_DELIVERABLE_MAX_LENGTH))).toBe(true);
    expect(isBuildDeliverableValid("x".repeat(MASTERWORK_DELIVERABLE_MAX_LENGTH + 1))).toBe(
      false,
    );
  });

  it("omits blank optional descriptions and trims submitted text", () => {
    expect(buildDeliverableValue("   ")).toBeUndefined();
    expect(buildDeliverableValue("  a finished keyword plan  ")).toBe(
      "a finished keyword plan",
    );
  });
});
