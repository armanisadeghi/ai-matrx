import {
  GOOGLE_ANALYTICS_CAMPAIGN_PAUSE_REASON,
  GOOGLE_ANALYTICS_CAMPAIGN_PHASE,
  assertGoogleAnalyticsCampaignActive,
  canUseGoogleAnalytics,
} from "@/features/marketing/google/ga4-campaign";

describe("Google Analytics OAuth campaign gate", () => {
  it("allows internal testers while keeping normal users closed", () => {
    expect(GOOGLE_ANALYTICS_CAMPAIGN_PHASE).toBe("internal_test");
    expect(canUseGoogleAnalytics(true)).toBe(true);
    expect(canUseGoogleAnalytics(false)).toBe(false);
    expect(() => assertGoogleAnalyticsCampaignActive(false)).toThrow(
      GOOGLE_ANALYTICS_CAMPAIGN_PAUSE_REASON,
    );
    expect(() => assertGoogleAnalyticsCampaignActive(true)).not.toThrow();
  });
});
