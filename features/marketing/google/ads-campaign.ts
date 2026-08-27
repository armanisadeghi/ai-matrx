export type GoogleAdsCampaignPhase = "internal_test" | "approved";

export const GOOGLE_ADS_CAMPAIGN_PHASE: GoogleAdsCampaignPhase =
  "internal_test";

export const GOOGLE_ADS_CAMPAIGN_PAUSE_REASON =
  "Google Ads is available only to AI Matrx internal reviewers while its reporting-only integration is being certified.";

export function canUseGoogleAds(isSuperAdmin: boolean): boolean {
  return GOOGLE_ADS_CAMPAIGN_PHASE === "approved" || isSuperAdmin;
}

export function assertGoogleAdsCampaignActive(isSuperAdmin: boolean): void {
  if (!canUseGoogleAds(isSuperAdmin)) {
    throw new Error(GOOGLE_ADS_CAMPAIGN_PAUSE_REASON);
  }
}
