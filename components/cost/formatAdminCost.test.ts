import { formatAdminCost } from "./formatAdminCost";


// The points rate is the billing.points_per_usd knob; this suite runs with no
// knob snapshot, so it pins the rate to a fixture (the platform default).
jest.mock("@/components/cost/pointsRate", () => ({
  ...jest.requireActual("@/components/cost/pointsRate"),
  currentPointsRate: () => 20_000,
  usePointsRate: () => 20_000,
}));

describe("admin cost display", () => {
  it("shows the recorded dollar cost and its points equivalent together", () => {
    expect(formatAdminCost(0.004)).toBe("$0.004000 · 80 points");
  });

  it("keeps an unmeasured cost distinct from zero", () => {
    expect(formatAdminCost(null)).toBe("—");
    expect(formatAdminCost(null, { unknown: "not measured" })).toBe("not measured");
    expect(formatAdminCost(0)).toBe("$0.00 · 0 points");
  });
});
