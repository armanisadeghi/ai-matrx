import { resolveActiveRouteMode } from "@/features/shell/components/header/route-mode-match";
import { marketingRoutes } from "@/features/marketing/lib/routes";

import { CONNECTIONS_HUB_ROUTES } from "./ConnectionsHubHeader";

describe("ConnectionsHubHeader", () => {
  it.each([
    [marketingRoutes.connections(), "Overview"],
    [marketingRoutes.connectionsGoogle(), "Google"],
    [marketingRoutes.connectionsBing(), "Bing"],
  ])("selects %s as %s", (pathname, expectedName) => {
    expect(resolveActiveRouteMode(CONNECTIONS_HUB_ROUTES, pathname)?.name).toBe(
      expectedName,
    );
  });

  it("does not mislabel an unregistered connection child as Overview", () => {
    expect(
      resolveActiveRouteMode(
        CONNECTIONS_HUB_ROUTES,
        "/marketing/connections/unregistered",
      ),
    ).toBeUndefined();
  });
});
