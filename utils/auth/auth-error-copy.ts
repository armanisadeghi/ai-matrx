const SIGNUP_EMAIL_RATE_LIMIT_MESSAGE =
  "We couldn't create this account because too many confirmation emails were requested recently. No account was created by this attempt. Please wait a few minutes, then try again.";

/** Keep provider diagnostics in logs while giving signup users actionable copy. */
export function signupErrorMessage(
  code: string | undefined,
  fallback: string,
): string {
  if (code === "over_email_send_rate_limit") {
    return SIGNUP_EMAIL_RATE_LIMIT_MESSAGE;
  }

  return fallback || "Authentication failed. Please try again.";
}
