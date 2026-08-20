/**
 * One code-controlled gate for the GA4 sensitive-scope campaign.
 *
 * This is intentionally not an environment variable: a missing production
 * value must never silently expose an unapproved OAuth scope or start Google
 * data collection. Advancing the phase is an explicit reviewed release after
 * the Workspace verification is stable.
 */

export type GoogleAnalyticsCampaignPhase = "internal_test" | "approved";

export const GOOGLE_ANALYTICS_CAMPAIGN_PHASE: GoogleAnalyticsCampaignPhase =
  "internal_test";

export const GOOGLE_ANALYTICS_CAMPAIGN_PAUSE_REASON =
  "Google is still reviewing AI Matrx's Analytics permission. Until it is approved, connecting and refreshing Google Analytics is limited to internal test accounts.";

/** May THIS user authorize or manually refresh the unapproved GA4 scope? */
export function canUseGoogleAnalytics(isSuperAdmin: boolean): boolean {
  return GOOGLE_ANALYTICS_CAMPAIGN_PHASE === "approved" || isSuperAdmin;
}

export function assertGoogleAnalyticsCampaignActive(
  isSuperAdmin: boolean,
): void {
  if (!canUseGoogleAnalytics(isSuperAdmin)) {
    throw new Error(GOOGLE_ANALYTICS_CAMPAIGN_PAUSE_REASON);
  }
}
