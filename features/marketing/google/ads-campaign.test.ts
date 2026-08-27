import {
  GOOGLE_ADS_CAMPAIGN_PHASE,
  assertGoogleAdsCampaignActive,
  canUseGoogleAds,
} from "./ads-campaign";

describe("Google Ads campaign gate", () => {
  it("stays internal-only before provider approval", () => {
    expect(GOOGLE_ADS_CAMPAIGN_PHASE).toBe("internal_test");
    expect(canUseGoogleAds(true)).toBe(true);
    expect(canUseGoogleAds(false)).toBe(false);
    expect(() => assertGoogleAdsCampaignActive(false)).toThrow(
      "internal reviewers",
    );
  });
});
