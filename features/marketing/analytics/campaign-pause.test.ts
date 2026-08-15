import { callApi } from "@/lib/api/call-api";
import type { AppDispatch } from "@/lib/redux/store";
import { syncSiteAnalytics } from "@/features/marketing/analytics/data";
import { GOOGLE_ANALYTICS_CAMPAIGN_PAUSE_REASON } from "@/features/marketing/google/ga4-campaign";

jest.mock("@/lib/api/call-api", () => ({
  callApi: jest.fn((config: unknown) => config),
}));

describe("GA4 collection campaign pause", () => {
  it("refuses a stale manual caller before dispatch", async () => {
    const dispatch = jest.fn() as unknown as AppDispatch;

    await expect(
      syncSiteAnalytics(dispatch, "site-1", "org-1"),
    ).rejects.toThrow(GOOGLE_ANALYTICS_CAMPAIGN_PAUSE_REASON);

    expect(dispatch).not.toHaveBeenCalled();
    expect(callApi).not.toHaveBeenCalled();
  });
});
