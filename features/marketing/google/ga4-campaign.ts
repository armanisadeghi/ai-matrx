/**
 * One code-controlled gate for the GA4 sensitive-scope campaign.
 *
 * This is intentionally not an environment variable: a missing production
 * value must never silently expose an unapproved OAuth scope or start Google
 * data collection. Advancing the phase is an explicit reviewed release after
 * the Workspace verification is stable.
 */

export type GoogleAnalyticsCampaignPhase =
  "workspace_review" | "analytics_verification" | "approved";

export const GOOGLE_ANALYTICS_CAMPAIGN_PHASE: GoogleAnalyticsCampaignPhase =
  "workspace_review";

export const GOOGLE_ANALYTICS_CAMPAIGN_PAUSE_REASON =
  "Google Analytics activation is paused while the separate Google Workspace verification remains open. No Analytics authorization or data collection will run.";

export function isGoogleAnalyticsCampaignActive(): boolean {
  return GOOGLE_ANALYTICS_CAMPAIGN_PHASE !== "workspace_review";
}

export function assertGoogleAnalyticsCampaignActive(): void {
  if (!isGoogleAnalyticsCampaignActive()) {
    throw new Error(GOOGLE_ANALYTICS_CAMPAIGN_PAUSE_REASON);
  }
}
