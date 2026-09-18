/**
 * THE READINESS WAIT IS BOUNDED (V-24 NEW-4, lane F-111).
 *
 * `checkGoogleLoaded()` used to re-schedule itself every 100 ms forever, and
 * `script.onerror` only fires when the REQUEST errors. A Google Identity
 * Services script that is served but never defines `window.google.accounts` —
 * a content blocker, a corporate filter, an enterprise proxy that strips the
 * body, a Google outage — left the poll running for the life of the tab, so
 * `?panels=google_connect` sat at "Loading Google API…" past 120 s with no
 * Connect control, no error and no remedy. Law 4: nothing fails silently; a
 * screen is absent or honest, never dead.
 *
 * These are CAPS constants, not organization knobs. The bound is a TECHNICAL
 * readiness limit on a third-party script — how long a browser can plausibly
 * still be fetching `accounts.google.com/gsi/client` — not a behavioural
 * opinion an organization would ever want to hold a different view about
 * (`common-docs/policies/limits-are-knobs-agents-set-them.md` governs ceilings
 * a person or an org chooses; this is neither).
 */

/**
 * How long the provider waits for `window.google.accounts` to exist before it
 * says so. 20 s covers a cold DNS + TLS + ~100 KB fetch on a bad mobile
 * connection with room to spare; past that, a person is reading a lie.
 */
export const GOOGLE_IDENTITY_READY_TIMEOUT_MS = 20_000;

/** How often the provider looks for the namespace while inside the bound. */
export const GOOGLE_IDENTITY_POLL_INTERVAL_MS = 100;

/** The ONE src every loader and every guard means by "the Google sign-in script". */
export const GOOGLE_IDENTITY_SCRIPT_SRC = "https://accounts.google.com/gsi/client";

/**
 * The failed state's sentence — it lives HERE, once, and every surface that
 * reads the provider renders this string rather than spelling its own.
 */
export const GOOGLE_IDENTITY_UNAVAILABLE_MESSAGE =
  "Google's sign-in script did not load. A content blocker, a network filter, or an outage can cause this.";

/** Where "Open Google's status" goes. */
export const GOOGLE_STATUS_DASHBOARD_URL =
  "https://www.google.com/appsstatus/dashboard/";

/**
 * True when the provider's `error` is the readiness failure rather than an
 * authorization error, so a surface can show the notice with its remedy
 * instead of a generic auth message.
 */
export function isGoogleIdentityUnavailable(error: string | null): boolean {
  return error === GOOGLE_IDENTITY_UNAVAILABLE_MESSAGE;
}
