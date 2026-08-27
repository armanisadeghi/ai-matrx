export type GoogleYouTubeCampaignPhase = "internal_test" | "approved";

export const GOOGLE_YOUTUBE_CAMPAIGN_PHASE: GoogleYouTubeCampaignPhase =
  "approved";

export const GOOGLE_YOUTUBE_CAMPAIGN_PAUSE_REASON =
  "YouTube authorization is temporarily paused by AI Matrx.";

export function canUseGoogleYouTube(isSuperAdmin: boolean): boolean {
  return GOOGLE_YOUTUBE_CAMPAIGN_PHASE === "approved" || isSuperAdmin;
}

export function assertGoogleYouTubeCampaignActive(isSuperAdmin: boolean): void {
  if (!canUseGoogleYouTube(isSuperAdmin)) {
    throw new Error(GOOGLE_YOUTUBE_CAMPAIGN_PAUSE_REASON);
  }
}
