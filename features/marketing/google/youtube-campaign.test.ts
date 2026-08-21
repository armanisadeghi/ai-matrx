import {
  GOOGLE_YOUTUBE_CAMPAIGN_PAUSE_REASON,
  GOOGLE_YOUTUBE_CAMPAIGN_PHASE,
  assertGoogleYouTubeCampaignActive,
  canUseGoogleYouTube,
} from "@/features/marketing/google/youtube-campaign";

describe("YouTube OAuth campaign gate", () => {
  it("allows internal testers while normal users fail closed", () => {
    expect(GOOGLE_YOUTUBE_CAMPAIGN_PHASE).toBe("internal_test");
    expect(canUseGoogleYouTube(true)).toBe(true);
    expect(canUseGoogleYouTube(false)).toBe(false);
    expect(() => assertGoogleYouTubeCampaignActive(false)).toThrow(
      GOOGLE_YOUTUBE_CAMPAIGN_PAUSE_REASON,
    );
    expect(() => assertGoogleYouTubeCampaignActive(true)).not.toThrow();
  });
});
