/**
 * Canonical frontend registry for first-party Google OAuth.
 *
 * Keep scope strings here and nowhere else. The backend mirror is
 * `aidream/services/google_integrations/scopes.py`; the campaign contract is
 * `common-docs/projects/google-oauth-verification/PLAN.md`.
 */

export const GOOGLE_SCOPE = {
  openid: "openid",
  email: "email",
  profile: "profile",
  userinfoEmail: "https://www.googleapis.com/auth/userinfo.email",
  userinfoProfile: "https://www.googleapis.com/auth/userinfo.profile",
  driveFile: "https://www.googleapis.com/auth/drive.file",
  gmailSend: "https://www.googleapis.com/auth/gmail.send",
  gmailReadonly: "https://www.googleapis.com/auth/gmail.readonly",
  webmastersReadonly: "https://www.googleapis.com/auth/webmasters.readonly",
  analyticsReadonly: "https://www.googleapis.com/auth/analytics.readonly",
  youtubeReadonly: "https://www.googleapis.com/auth/youtube.readonly",
  contactsReadonly: "https://www.googleapis.com/auth/contacts.readonly",
} as const;

export type GoogleScope = (typeof GOOGLE_SCOPE)[keyof typeof GOOGLE_SCOPE];

export const GOOGLE_IDENTITY_SCOPES = [
  GOOGLE_SCOPE.openid,
  GOOGLE_SCOPE.email,
  GOOGLE_SCOPE.profile,
] as const;

/** Selected Docs/Sheets only. Never grants account-wide Drive discovery. */
export const GOOGLE_WORKSPACE_FILE_SCOPES = [
  ...GOOGLE_IDENTITY_SCOPES,
  GOOGLE_SCOPE.driveFile,
] as const;

/**
 * Cumulative incremental request used only after the reviewed-send disclosure.
 * Keeping drive.file in the request preserves the existing Workspace grant.
 */
export const GOOGLE_WORKSPACE_SEND_SCOPES = [
  ...GOOGLE_WORKSPACE_FILE_SCOPES,
  GOOGLE_SCOPE.gmailSend,
] as const;

/** Separate non-sensitive marketing authorization; never bundled into review. */
export const GOOGLE_SEARCH_CONSOLE_SCOPES = [
  ...GOOGLE_IDENTITY_SCOPES,
  GOOGLE_SCOPE.webmastersReadonly,
] as const;

/** Incremental GA4 authorization; Search Console stays granted and usable. */
export const GOOGLE_ANALYTICS_SCOPES = [
  ...GOOGLE_SEARCH_CONSOLE_SCOPES,
  GOOGLE_SCOPE.analyticsReadonly,
] as const;

/** Focused owned-channel read; never bundled into Search Console or Workspace. */
export const GOOGLE_YOUTUBE_SCOPES = [
  ...GOOGLE_IDENTITY_SCOPES,
  GOOGLE_SCOPE.youtubeReadonly,
] as const;

/**
 * First verification campaign target in Google Cloud Data Access. Identity
 * aliases are listed as the URLs Google Cloud displays, not GIS shorthand.
 */
export const GOOGLE_FIRST_CAMPAIGN_CLOUD_SCOPES = [
  GOOGLE_SCOPE.userinfoEmail,
  GOOGLE_SCOPE.userinfoProfile,
  GOOGLE_SCOPE.driveFile,
  GOOGLE_SCOPE.gmailSend,
  GOOGLE_SCOPE.webmastersReadonly,
] as const;

/** Implemented elsewhere, but deliberately excluded from this campaign. */
export const GOOGLE_DEFERRED_SENSITIVE_SCOPES = [
  GOOGLE_SCOPE.analyticsReadonly,
  GOOGLE_SCOPE.youtubeReadonly,
] as const;

/**
 * 🚨 NOT REQUESTED FROM ANY USER YET — and it is SCHEDULED, not optional.
 *
 * RULED BY ARMAN 2026-08-15: `gmail.readonly` is added AFTER the current Google
 * verification round closes, as its own focused campaign. Do NOT move it into
 * `GOOGLE_FIRST_CAMPAIGN_CLOUD_SCOPES` before that round closes; do NOT quietly
 * drop it either — outreach reply ingestion is already built and deployed and
 * reads nothing without it. Queued in
 * `common-docs/projects/google-oauth-verification/PLAN.md` (status header,
 * frozen scope table, § "Later restricted access", execution row 12).
 *
 * Outreach reply ingestion (G6) is built and live server-side
 * (`aidream/services/outreach_inbound/`), and it needs `gmail.readonly` on the
 * sending mailbox's connection. The scope is registered here so the server and
 * client mirrors agree, and for NO other reason.
 *
 * It is deliberately absent from `GOOGLE_FIRST_CAMPAIGN_CLOUD_SCOPES` because
 * that submission is mid-review with an open Google thread and currently
 * declares **no restricted scopes at all**. `gmail.readonly` is RESTRICTED —
 * a tier above the deferred sensitive scopes above. Adding it to the campaign
 * path would recreate the exact code/console mismatch that campaign just
 * finished fixing, and this project already has a recorded production failure
 * where `include_granted_scopes=true` merged an extra grant and Google REJECTED
 * the authorization outright. The shared OAuth client is the platform's one
 * blast radius that is NOT contained to the customer who causes it
 * (outreach-system §5.3), so it does not get widened as a side effect of
 * shipping a feature.
 *
 * Until it is granted, an identity without the scope surfaces the ordinary
 * fixable refusal (`mailbox_cannot_read_replies` → `reconnect_mailbox`) — the
 * cadence still refuses to run un-listened, which is the correct failure.
 *
 * Decision + steps: `common-docs/projects/outreach-system/DECISION_LOG.md`
 * (D-W1-10) and `common-docs/projects/google-oauth-verification/PLAN.md`.
 */
export const GOOGLE_OUTREACH_INBOX_SCOPES = [
  ...GOOGLE_WORKSPACE_SEND_SCOPES,
  GOOGLE_SCOPE.gmailReadonly,
] as const;

/**
 * 🚨 SENSITIVE, and NOT in the approved campaign set — its own future campaign.
 *
 * CRM contact import through the Google People API (read-only). RULED BY ARMAN
 * 2026-08-19 (`common-docs/projects/crm/STATE.md` Q3): the Google People
 * connector is the FIRST API contact connector — the consumer is real, so this
 * is registered here (and in the aidream mirror) like `gmail.readonly` was.
 *
 * It is deliberately absent from `GOOGLE_FIRST_CAMPAIGN_CLOUD_SCOPES`: that
 * submission is APPROVED and frozen, and adding an unapproved sensitive scope
 * to the production consent path is the exact code/console mismatch the
 * campaign existed to remove. Until Google approves this scope in its own
 * campaign, ONLY the internal-test gate may request it
 * (`features/crm/import/connectors/campaign.ts` — super-admin testers see the
 * connect action; everyone else sees an explicit "awaiting Google
 * verification" status on the /crm/import source tile). Queue + process:
 * `common-docs/projects/google-oauth-verification/PLAN.md`.
 */
export const GOOGLE_CONTACTS_IMPORT_SCOPES = [
  ...GOOGLE_IDENTITY_SCOPES,
  GOOGLE_SCOPE.contactsReadonly,
] as const;

export const googleServices = {
  workspace_files: {
    name: "Google Docs & Sheets",
    scope: GOOGLE_SCOPE.driveFile,
    description: "Work only with files the user explicitly selects.",
    classification: "non-sensitive",
  },
  gmail_send: {
    name: "Reviewed Gmail sending",
    scope: GOOGLE_SCOPE.gmailSend,
    description:
      "Send only a message the user reviews and explicitly approves.",
    classification: "sensitive",
  },
  search_console: {
    name: "Search Console",
    scope: GOOGLE_SCOPE.webmastersReadonly,
    description: "Read Search Console data for the user's verified sites.",
    classification: "non-sensitive",
  },
  contacts_import: {
    name: "Google Contacts import",
    scope: GOOGLE_SCOPE.contactsReadonly,
    description:
      "Read the user's Google Contacts to import them into their CRM.",
    classification: "sensitive",
  },
} as const;

export type GoogleServiceKey = keyof typeof googleServices;
