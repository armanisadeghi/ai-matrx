/**
 * lib/email/error-message.ts — THE ONE COERCION for a mail-send failure into a
 * sentence a human can read.
 *
 * Deliberately its own module with NO imports: the routes reach it through
 * `lib/email/client.ts` (which pulls in the Resend SDK), while client-side
 * services import it directly and must never drag that SDK into the browser
 * bundle.
 */

/**
 * 🚨 `sendEmail` NEVER returns a string error. All three of its failure returns
 * are objects: `new Error("EMAIL_FROM is not configured")`, Resend's
 * `ErrorResponse` (`{name, message}`), and whatever the `catch` caught — which
 * is where a missing `RESEND_API_KEY` lands. Every one of them is truthy, so an
 * `error || "fallback"` leaves an OBJECT in the field, `JSON.stringify` turns
 * an `Error` into `{}` across the fetch boundary, and React then throws
 * "Objects are not valid as a React child" while rendering the honest
 * failure banner — the screen dying in exactly the failure it exists to
 * report (DD-091 verification finding I1, 2026-09-11). TypeScript cannot see
 * this: the lie crosses a `fetch`.
 *
 * So every route that reports a delivery failure to a client passes the error
 * through HERE first. Returns a non-empty string, always.
 */
export function emailErrorMessage(
  error: unknown,
  fallback = "The email provider rejected the send",
): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error.trim()) return error.trim();
  if (error && typeof error === "object") {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message.trim();
    const name = (error as { name?: unknown }).name;
    if (typeof name === "string" && name.trim()) return name.trim();
  }
  return fallback;
}
