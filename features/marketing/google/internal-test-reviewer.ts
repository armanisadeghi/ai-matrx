/** Client parity for the server-owned Google OAuth review policy. */
const GOOGLE_OAUTH_INTERNAL_TEST_REVIEWER_EMAILS = new Set([
  "oauth-review@aimatrx.com",
]);

/** This controls visibility only; aidream independently authorizes every call. */
export function canUseGoogleOAuthInternalTest(
  isSuperAdmin: boolean,
  email: string | null,
): boolean {
  return (
    isSuperAdmin ||
    GOOGLE_OAUTH_INTERNAL_TEST_REVIEWER_EMAILS.has(email?.trim().toLowerCase() ?? "")
  );
}
