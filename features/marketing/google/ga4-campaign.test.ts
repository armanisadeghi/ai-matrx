import {
  GOOGLE_ANALYTICS_CAMPAIGN_PAUSE_REASON,
  GOOGLE_ANALYTICS_CAMPAIGN_PHASE,
  assertGoogleAnalyticsCampaignActive,
  isGoogleAnalyticsCampaignActive,
} from "@/features/marketing/google/ga4-campaign";

describe("Google Analytics OAuth campaign gate", () => {
  it("stays closed while the Workspace verification is open", () => {
    expect(GOOGLE_ANALYTICS_CAMPAIGN_PHASE).toBe("workspace_review");
    expect(isGoogleAnalyticsCampaignActive()).toBe(false);
    expect(() => assertGoogleAnalyticsCampaignActive()).toThrow(
      GOOGLE_ANALYTICS_CAMPAIGN_PAUSE_REASON,
    );
  });
});
