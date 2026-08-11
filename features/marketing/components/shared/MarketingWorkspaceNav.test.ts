import { resolveActiveRouteMode } from "@/features/shell/components/header/route-mode-match";
import { MARKETING_WORKSPACE_ROUTES } from "./MarketingWorkspaceNav";

describe("MarketingWorkspaceNav", () => {
  it("identifies every workspace that renders the shared navigation", () => {
    for (const route of MARKETING_WORKSPACE_ROUTES) {
      expect(
        resolveActiveRouteMode(MARKETING_WORKSPACE_ROUTES, route.href),
      ).toBe(route);
    }
  });

  it("keeps the cross-site ranks workspace connected", () => {
    expect(
      resolveActiveRouteMode(MARKETING_WORKSPACE_ROUTES, "/marketing/ranks")
        ?.name,
    ).toBe("Ranks");
  });
});
