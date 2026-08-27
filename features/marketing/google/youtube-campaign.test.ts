import {
  GOOGLE_YOUTUBE_CAMPAIGN_PAUSE_REASON,
  GOOGLE_YOUTUBE_CAMPAIGN_PHASE,
  assertGoogleYouTubeCampaignActive,
  canUseGoogleYouTube,
} from "@/features/marketing/google/youtube-campaign";

describe("YouTube OAuth campaign gate", () => {
  it("allows every signed-in user after Google approval", () => {
    expect(GOOGLE_YOUTUBE_CAMPAIGN_PHASE).toBe("approved");
    expect(canUseGoogleYouTube(true)).toBe(true);
    expect(canUseGoogleYouTube(false)).toBe(true);
    expect(() => assertGoogleYouTubeCampaignActive(false)).not.toThrow();
    expect(() => assertGoogleYouTubeCampaignActive(true)).not.toThrow();
    expect(GOOGLE_YOUTUBE_CAMPAIGN_PAUSE_REASON).toBeTruthy();
  });
});
