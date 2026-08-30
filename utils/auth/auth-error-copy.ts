const SIGNUP_EMAIL_RATE_LIMIT_MESSAGE =
  "We couldn't send another confirmation email right now. Check whether an earlier confirmation email arrived, or wait a little while and try again.";

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
