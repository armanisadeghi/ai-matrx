/**
 * A SCREEN NEVER LIES — applet KPI strips.
 *
 * `total_cost` is nullable on `aga_apps`. A null there means "nobody knows
 * what this app cost", and `?? 0` turned that into the confident sentence
 * "$0.0000" — a user reading it believes the app was free. Money is the
 * worst place in the product to guess.
 *
 * A REAL zero still prints as a zero: 0 known-to-be-0 is information.
 */

import { appletAdminKpis, appletKpis } from "@/features/applets/format";


// The points rate is the billing.points_per_usd knob; this suite runs with no
// knob snapshot, so it pins the rate to a fixture (the platform default).
jest.mock("@/components/cost/pointsRate", () => ({
  ...jest.requireActual("@/components/cost/pointsRate"),
  currentPointsRate: () => 20_000,
  usePointsRate: () => 20_000,
}));

describe("appletAdminKpis — unknown must not read as a number", () => {
  it("renders an unknown cost as an em-dash, not $0.0000", () => {
    expect(appletAdminKpis({ total_cost: null }).cost).toBe("—");
    expect(appletAdminKpis({}).cost).toBe("—");
  });

  it("still renders a REAL zero cost as $0.0000", () => {
    expect(appletAdminKpis({ total_cost: 0 }).cost).toBe("0 points");
  });

  it("renders a real cost unchanged", () => {
    expect(appletAdminKpis({ total_cost: 1.23456 }).cost).toBe("24,692 points");
    expect(appletAdminKpis({ total_cost: 1.23456 }, "usd").cost).toBe("$1.23");
  });

  it("renders unknown runs / users / success rate as em-dashes", () => {
    const kpis = appletAdminKpis({});
    expect(kpis.runs).toBe("—");
    expect(kpis.users).toBe("—");
    expect(kpis.success).toBe("—");
  });

  it("still renders real zeroes for runs / users / success rate", () => {
    const kpis = appletAdminKpis({
      total_executions: 0,
      unique_users_count: 0,
      success_rate: 0,
    });
    expect(kpis.runs).toBe("0");
    expect(kpis.users).toBe("0");
    expect(kpis.success).toBe("0%");
  });
});

describe("appletKpis — the entity stat strip", () => {
  it("omits cost when unknown and shows a real zero when known", () => {
    expect(appletKpis({ total_cost: null }).cost).toBeUndefined();
    expect(appletKpis({ total_cost: 0 }).cost).toBe("0 points");
  });
});
