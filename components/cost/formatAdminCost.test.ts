import { formatAdminCost, formatAdminUsd } from "./formatAdminCost";


// The points rate is the billing.points_per_usd knob; this suite runs with no
// knob snapshot, so it pins the rate to a fixture (the platform default).
jest.mock("@/components/cost/pointsRate", () => ({
  ...jest.requireActual("@/components/cost/pointsRate"),
  currentPointsRate: () => 20_000,
  usePointsRate: () => 20_000,
}));

describe("admin cost display", () => {
  it("shows the recorded dollar cost and its points equivalent together", () => {
    expect(formatAdminCost(0.004, { rate: 20_000 })).toBe("$0.004000 · 80 points");
  });

  it("keeps an unmeasured cost distinct from zero", () => {
    expect(formatAdminCost(null, { rate: 20_000 })).toBe("—");
    expect(formatAdminCost(null, { rate: 20_000, unknown: "not measured" })).toBe("not measured");
    expect(formatAdminCost(0, { rate: 20_000 })).toBe("$0.00 · 0 points");
  });
});

describe("the rate is the caller's, never a silent read (VERIFY-DRILL-FINAL L-b)", () => {
  it("a missing rate is an unmeasured points half, said with the dollars", () => {
    expect(formatAdminCost(0.0204, { rate: null })).toBe("$0.0204 · —");
  });
});

describe("formatAdminUsd threshold voice", () => {
  it("prints a limit in whole dollars when it is one, cents when it is not", () => {
    expect(formatAdminUsd(1, { digits: "whole" })).toBe("$1");
    expect(formatAdminUsd(0.5, { digits: "whole" })).toBe("$0.50");
    expect(formatAdminUsd(2.25, { digits: "whole" })).toBe("$2.25");
    expect(formatAdminUsd(null, { digits: "whole" })).toBe("—");
  });
});
