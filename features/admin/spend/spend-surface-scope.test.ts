import { adminBillingSpendManifest } from "@/features/surfaces/manifests/admin-billing-spend.manifest";

import { buildBillingSpendDashboardScope } from "./spend-surface-scope";

describe("Billing Spend surface scope", () => {
  it("does not require or emit healthy empty error values", () => {
    const scope = buildBillingSpendDashboardScope({
      timezone: "America/Los_Angeles",
      data: null,
      loading: true,
      error: null,
      fixedMonthly: null,
      knobs: { knobs: null, loading: true, error: null },
      costSourcesExpanded: false,
      printOrdersExpanded: false,
    });

    expect(scope).toEqual({
      viewer_timezone: "America/Los_Angeles",
      overview_loading: true,
      fixed_monthly_status: "loading",
      cost_sources_expanded: false,
      print_orders_expanded: false,
    });
    expect(
      adminBillingSpendManifest.values
        .filter((value) => value.alwaysAvailable)
        .map((value) => value.name),
    ).toEqual([
      "viewer_timezone",
      "overview_loading",
      "fixed_monthly_status",
      "cost_sources_expanded",
      "print_orders_expanded",
    ]);
  });

  it("emits real overview and knob failures when they exist", () => {
    const scope = buildBillingSpendDashboardScope({
      timezone: "UTC",
      data: null,
      loading: false,
      error: new Error("overview refused"),
      fixedMonthly: "missing",
      knobs: {
        knobs: null,
        loading: false,
        error: new Error("knob refused"),
      },
      costSourcesExpanded: true,
      printOrdersExpanded: true,
    });

    expect(scope.overview_error).toBe("overview refused");
    expect(scope.spend_alarm_error).toBe("knob refused");
    expect(scope.fixed_monthly_status).toBe("unavailable");
  });
});
