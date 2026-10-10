import { formatAdminCost, formatAdminUsd, formatSpendUsd, formatViewerCost } from "./formatAdminCost";


// The points rate is the billing.points_per_usd knob; this suite runs with no
// knob snapshot, so it pins the rate to a fixture (the platform default).
jest.mock("@/components/cost/pointsRate", () => ({
  ...jest.requireActual("@/components/cost/pointsRate"),
  currentPointsRate: () => 20_000,
  usePointsRate: () => 20_000,
}));

describe("admin cost display", () => {
  it("shows the recorded dollar cost and its points equivalent together", () => {
    expect(formatAdminCost(1.2345, { rate: 20_000 })).toBe("$1.23 · 24,690 points");
  });

  it("keeps an unmeasured cost distinct from zero", () => {
    expect(formatAdminCost(null, { rate: 20_000 })).toBe("—");
    expect(formatAdminCost(null, { rate: 20_000, unknown: "not measured" })).toBe("not measured");
    expect(formatAdminCost(0, { rate: 20_000 })).toBe("$0.00 · 0 points");
  });
});

describe("the rate is the caller's, never a silent read (VERIFY-DRILL-FINAL L-b)", () => {
  it("a missing rate is an unmeasured points half, said with the dollars", () => {
    expect(formatAdminCost(0.0204, { rate: null })).toBe("$0.02 · —");
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

describe("spend reads in cents (Arman, 2026-10-10)", () => {
  it("rounds every spend figure to the nearest cent", () => {
    expect(formatSpendUsd(0.003766 * 10)).toBe("$0.04");
    expect(formatSpendUsd(7.5349)).toBe("$7.53");
    expect(formatSpendUsd(1045.776)).toBe("$1,045.78");
    expect(formatAdminUsd(0.0256)).toBe("$0.03");
  });

  it("a real amount under half a cent is <$0.01, never a confident $0.00", () => {
    expect(formatSpendUsd(0.003766)).toBe("<$0.01");
    expect(formatSpendUsd(0.000004)).toBe("<$0.01");
    expect(formatSpendUsd(0)).toBe("$0.00");
    expect(formatSpendUsd(null)).toBe("—");
  });

  it("a price someone compares keeps its exact figure", () => {
    expect(formatAdminUsd(0.075, { digits: "price" })).toBe("$0.075");
  });

  it("the viewer formatter rounds dollars and leaves points alone", () => {
    expect(formatViewerCost(0.0256, { unit: "usd", rate: 20_000 })).toBe("$0.03");
    expect(formatViewerCost(0.0256, { unit: "points", rate: 20_000 })).toBe("512 points");
  });
});
