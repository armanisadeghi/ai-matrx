import { callApi } from "@/lib/api/call-api";
import type { AppDispatch } from "@/lib/redux/store";
import { syncSiteAnalytics } from "@/features/marketing/analytics/data";
import { syncBingSearchPerformance } from "@/features/marketing/bing/service";
import { syncPagespeed } from "@/features/marketing/pagespeed/data";

jest.mock("@/lib/api/call-api", () => ({
  callApi: jest.fn((config: unknown) => config),
}));

const callApiMock = jest.mocked(callApi);

function successfulDispatch(): AppDispatch {
  return jest.fn().mockResolvedValue({ data: null }) as unknown as AppDispatch;
}

describe("marketing organization scope", () => {
  beforeEach(() => {
    callApiMock.mockClear();
  });

  it("uses the page organization for PageSpeed", async () => {
    await syncPagespeed(successfulDispatch(), "page-1", "org-page", "desktop");

    expect(callApiMock).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/seo/pages/{page_id}/pagespeed/sync",
        pathParams: { page_id: "page-1" },
        scopeOverrides: { organization_id: "org-page" },
      }),
    );
  });

  it("uses the site organization for analytics", async () => {
    await syncSiteAnalytics(successfulDispatch(), "site-1", "org-site");

    expect(callApiMock).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/seo/sites/{site_id}/analytics/sync",
        pathParams: { site_id: "site-1" },
        scopeOverrides: { organization_id: "org-site" },
      }),
    );
  });

  it("uses the site organization for Bing performance", async () => {
    await syncBingSearchPerformance(
      successfulDispatch(),
      "site-1",
      "org-site",
    );

    expect(callApiMock).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/seo/sites/{site_id}/bing/search-performance/sync",
        pathParams: { site_id: "site-1" },
        scopeOverrides: { organization_id: "org-site" },
      }),
    );
  });
});
