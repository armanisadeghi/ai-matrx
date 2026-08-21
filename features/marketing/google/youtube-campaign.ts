export type GoogleYouTubeCampaignPhase = "internal_test" | "approved";

export const GOOGLE_YOUTUBE_CAMPAIGN_PHASE: GoogleYouTubeCampaignPhase =
  "internal_test";

export const GOOGLE_YOUTUBE_CAMPAIGN_PAUSE_REASON =
  "Google has not approved AI Matrx's YouTube permission yet. YouTube account authorization and reads are limited to internal test accounts.";

export function canUseGoogleYouTube(isSuperAdmin: boolean): boolean {
  return GOOGLE_YOUTUBE_CAMPAIGN_PHASE === "approved" || isSuperAdmin;
}

export function assertGoogleYouTubeCampaignActive(isSuperAdmin: boolean): void {
  if (!canUseGoogleYouTube(isSuperAdmin)) {
    throw new Error(GOOGLE_YOUTUBE_CAMPAIGN_PAUSE_REASON);
  }
}
