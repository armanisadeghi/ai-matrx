/**
 * One code-controlled gate for the Google Contacts sensitive-scope campaign.
 *
 * Same shape as `features/marketing/google/ga4-campaign.ts`, and intentionally
 * not an environment variable: a missing production value must never silently
 * let a normal user request an OAuth scope Google has not approved. The
 * `contacts.readonly` scope is registered (lib/googleScopes.ts) but is NOT in
 * the approved verification campaign — until its own campaign closes, only
 * internal testers (platform super admins) may run the authorize step. Every
 * other user sees the Google Contacts source with an explicit "awaiting Google
 * verification" status — a real status, never a decorative tile.
 *
 * Advancing the phase is an explicit reviewed release after Google approves
 * the scope (`common-docs/projects/google-oauth-verification/PLAN.md`).
 */

export type GoogleContactsCampaignPhase = "internal_test" | "approved";

export const GOOGLE_CONTACTS_CAMPAIGN_PHASE: GoogleContactsCampaignPhase =
  "internal_test";

export const GOOGLE_CONTACTS_CAMPAIGN_PAUSE_REASON =
  "Google is still reviewing AI Matrx's contacts permission. Until it is approved, connecting Google Contacts is limited to internal test accounts — your CSV/vCard export imports the same contacts today.";

/** May THIS user run the authorize step for the unapproved scope? */
export function canRequestGoogleContactsScope(isSuperAdmin: boolean): boolean {
  return GOOGLE_CONTACTS_CAMPAIGN_PHASE === "approved" || isSuperAdmin;
}
