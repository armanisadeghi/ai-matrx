import { marketingRoutes } from "./routes";

describe("marketingRoutes.siteKeywordWorkbench", () => {
  it("keeps saved-view query state on the Workbench sub-route", () => {
    expect(
      marketingRoutes.siteKeywordWorkbench(
        "data-destruction",
        "datadestruction-com",
        "qw=shred&sv=view-1",
      ),
    ).toBe(
      "/marketing/data-destruction/seo/datadestruction-com/keywords/workbench?qw=shred&sv=view-1",
    );
  });

  it("returns the Workbench route without a trailing question mark", () => {
    expect(
      marketingRoutes.siteKeywordWorkbench(
        "data-destruction",
        "datadestruction-com",
      ),
    ).toBe(
      "/marketing/data-destruction/seo/datadestruction-com/keywords/workbench",
    );
  });

  it("keeps the compatibility address when the brand is not in scope", () => {
    expect(
      marketingRoutes.siteKeywordWorkbench(
        null,
        "38eff4c9-b021-451a-b995-7d9b3d17db5e",
        "st=traffic_class%3Aunclassified",
      ),
    ).toBe(
      "/marketing/sites/38eff4c9-b021-451a-b995-7d9b3d17db5e/keywords/workbench?st=traffic_class%3Aunclassified",
    );
  });
});
