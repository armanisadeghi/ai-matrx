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
  webmastersReadonly: "https://www.googleapis.com/auth/webmasters.readonly",
  analyticsReadonly: "https://www.googleapis.com/auth/analytics.readonly",
  youtubeReadonly: "https://www.googleapis.com/auth/youtube.readonly",
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
} as const;

export type GoogleServiceKey = keyof typeof googleServices;
