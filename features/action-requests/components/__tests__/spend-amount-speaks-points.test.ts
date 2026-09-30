/**
 * A member approving an agent's SEO keyword pull types POINTS; the server
 * records USD to the cent and must never record less than was typed.
 * A system admin who flipped "Show costs in dollars" types dollars.
 */
import {
  MAX_APPROVAL_USD,
  initialAmountText,
  parseApprovalUsd,
} from "../spendAmount";


// The points rate is the billing.points_per_usd knob; this suite runs with no
// knob snapshot, so it pins the rate to a fixture (the platform default).
jest.mock("@/components/cost/pointsRate", () => ({
  ...jest.requireActual("@/components/cost/pointsRate"),
  currentPointsRate: () => 20_000,
  usePointsRate: () => 20_000,
}));

describe("approve_spend amount in the viewer's unit", () => {
  it("suggests whole points to a member and dollars to an admin", () => {
    expect(initialAmountText(0.29, "points")).toBe("5800");
    expect(initialAmountText(0.29, "usd")).toBe("0.29");
  });

  it("reads typed points as USD, rounded UP to the cent", () => {
    expect(parseApprovalUsd("5800", "points")).toBe(0.29);
    expect(parseApprovalUsd("5,800 points", "points")).toBe(0.29);
    // 150 points = $0.0075 — recorded as $0.01, never $0.00.
    expect(parseApprovalUsd("150", "points")).toBe(0.01);
    expect(parseApprovalUsd("1 pts", "points")).toBe(0.01);
  });

  it("refuses what is not an amount", () => {
    expect(parseApprovalUsd("$0.29", "points")).toBeNull();
    expect(parseApprovalUsd("12.5", "points")).toBeNull();
    expect(parseApprovalUsd("abc", "usd")).toBeNull();
    expect(parseApprovalUsd(String(MAX_APPROVAL_USD * 20_000 + 20_000), "points")).toBeNull();
  });

  it("keeps the admin's dollar parsing", () => {
    expect(parseApprovalUsd("$1,250.50", "usd")).toBe(1250.5);
    expect(parseApprovalUsd(".5", "usd")).toBe(0.5);
  });
});
