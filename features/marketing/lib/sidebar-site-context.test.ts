import { resolveMarketingSidebarSiteContext } from "./sidebar-site-context";

describe("resolveMarketingSidebarSiteContext", () => {
  it("keeps canonical website routes in the website sidebar", () => {
    expect(
      resolveMarketingSidebarSiteContext(
        "/marketing/brands/brand-1/sites/site-1/pages/page-1",
      ),
    ).toEqual({ brandId: "brand-1", siteId: "site-1" });
  });

  it("keeps legacy website links in the website sidebar while they redirect", () => {
    expect(
      resolveMarketingSidebarSiteContext(
        "/marketing/sites/site-1/crawls/crawl-1",
      ),
    ).toEqual({ brandId: null, siteId: "site-1" });
  });

  it("keeps a website's Content Plan in the website sidebar", () => {
    expect(
      resolveMarketingSidebarSiteContext("/marketing/content-plan/site-1"),
    ).toEqual({ brandId: null, siteId: "site-1" });
  });

  it.each(["/marketing/search-console", "/marketing/capabilities"])(
    "keeps a selected website on %s in the website sidebar",
    (pathname) => {
      expect(resolveMarketingSidebarSiteContext(pathname, "site-1")).toEqual({
        brandId: null,
        siteId: "site-1",
      });
    },
  );

  it.each([
    ["/marketing", null],
    ["/marketing/sites", null],
    ["/marketing/sites/new", null],
    ["/marketing/content-plan", null],
    ["/marketing/content-plan/nodes/node-1", null],
    ["/marketing/search-console", null],
    ["/marketing/reports", "site-1"],
  ])(
    "leaves non-site context %s in the general Marketing sidebar",
    (pathname, siteId) => {
      expect(resolveMarketingSidebarSiteContext(pathname, siteId)).toBeNull();
    },
  );
});
