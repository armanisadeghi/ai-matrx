import { formatAdminCost } from "./formatAdminCost";

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
