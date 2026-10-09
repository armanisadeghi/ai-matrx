/**
 * Social cost words (Arman, 2026-10-09): a provider charge is a hard cost charged in points
 * (20,000 points = $1), shown like an AI cost — only when worth a warning, never as credits.
 */
jest.mock("@/components/dialogs/confirm/ConfirmDialogHost", () => ({ confirm: jest.fn() }));
jest.mock("@/components/cost/useCostDisplay", () => ({ useCostDisplay: jest.fn() }));
jest.mock("../server", () => ({ getCosts: jest.fn() }));

import { actionUsd, formatPointsCost } from "../cost";

const RATE = 20_000;
const display = {
  format: (usd: number) => `${Math.ceil(usd * RATE).toLocaleString("en-US")} points`,
  toPoints: (usd: number) => Math.ceil(usd * RATE),
};
const costs = { call_usd: 0.00188, operations: { post: 0.00188, track: 0.00376, ads_search: 0.00188 } };

describe("social cost words", () => {
  it("prices an action from the server's numbers", () => {
    expect(actionUsd(costs, "track", 3)).toBeCloseTo(0.01128);
    expect(actionUsd(costs, "comments")).toBeNull();
    expect(actionUsd(null, "post")).toBeNull();
    expect(actionUsd(costs, "post", 0)).toBeNull();
  });

  it("says nothing for a trivial cost (one fetch is 38 points)", () => {
    expect(display.toPoints(0.00188)).toBe(38);
    expect(formatPointsCost(0.00188, display)).toBeNull();
  });

  it("names a cost worth a warning in points, never credits", () => {
    const words = formatPointsCost(0.00188 * 3000, display); // 3,000 posts
    expect(words).toBe("≈ 112,800 points");
    expect(words).not.toMatch(/credit/i);
  });

  it("unknown stays unknown", () => {
    expect(formatPointsCost(null, display)).toBeNull();
  });
});
