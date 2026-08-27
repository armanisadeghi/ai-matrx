import {
  GOOGLE_ANALYTICS_CAMPAIGN_PAUSE_REASON,
  GOOGLE_ANALYTICS_CAMPAIGN_PHASE,
  assertGoogleAnalyticsCampaignActive,
  canUseGoogleAnalytics,
} from "@/features/marketing/google/ga4-campaign";

describe("Google Analytics OAuth campaign gate", () => {
  it("allows every signed-in user after Google approval", () => {
    expect(GOOGLE_ANALYTICS_CAMPAIGN_PHASE).toBe("approved");
    expect(canUseGoogleAnalytics(true)).toBe(true);
    expect(canUseGoogleAnalytics(false)).toBe(true);
    expect(() => assertGoogleAnalyticsCampaignActive(false)).not.toThrow();
    expect(() => assertGoogleAnalyticsCampaignActive(true)).not.toThrow();
    expect(GOOGLE_ANALYTICS_CAMPAIGN_PAUSE_REASON).toBeTruthy();
  });
});
