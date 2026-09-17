/**
 * A DOOR THAT HANDS OUT A LIVE CREDENTIAL MUST NEVER ANSWER A BROWSER
 * NAVIGATION.
 *
 * 🚨 THE CLASS (2026-09-17). `/api/session-token` returned the live Supabase
 * access_token as the response BODY and answered a plain top-level navigation
 * exactly as it answered the SSO bridge's `fetch()`. So typing the URL into a
 * signed-in browser RENDERED a working admin JWT as page text — and on
 * 2026-09-17 it did: a reviewer opened it to check which identity its browser
 * held (a legitimate question) and a live `admin@admin.com` token, good for
 * days, landed in an agent transcript. Anything that reads a page — a
 * screenshot, a text extractor, a shared recording — captures the credential.
 *
 * This is the SAME class matrx-frontend already closed for `?token=` dev-login
 * (see the header of `app/api/dev-login/route.ts`: two transcript leaks,
 * 2026-08-31 and 2026-09-11). There the fix was to remove the door. Here the
 * door is load-bearing — the cross-app SSO bridge genuinely needs it — so what
 * is removed is the NAVIGATION lane into it.
 *
 * THE RULE. A credential door answers a script's `fetch()` and nothing else.
 * The browser itself tells us which is which, and cannot be talked out of it:
 * `Sec-Fetch-Dest`/`Sec-Fetch-Mode` are forbidden header names, so no page,
 * no extension content script and no `fetch()` option can forge them.
 *
 *   · `fetch()` / XHR / EventSource → `Sec-Fetch-Dest: empty`      → ALLOWED
 *   · address bar, link, redirect   → `Sec-Fetch-Mode: navigate`   → REFUSED
 *     (`Dest: document`)
 *   · `<iframe>`, `<img>`, `<script src>`, prefetch → `Dest: iframe`/`image`/
 *     `script`/… → REFUSED (none of them can read JSON anyway; answering them
 *     only paints the token somewhere a person or a tool can see).
 *
 * WHAT THIS DELIBERATELY DOES NOT DO. A request with NO `Sec-Fetch-*` headers
 * at all (curl, a server-side client, a pre-2020 browser) is allowed through.
 * It is not the leak class: those callers must already hold the httpOnly
 * session cookie, which only a signed-in browser jar has, and refusing them
 * would break non-browser callers to prove nothing. Every browser that can
 * render a page to a person sends these headers.
 *
 * THE FORWARD LANE (`X-Matrx-Session-Bridge`). The bridges in
 * `aidream/apps/{workflow-studio,dashboard}/src/lib/session-bridge.ts` now
 * send it, and it is advertised in the CORS allow-list, so a future change can
 * make it MANDATORY and reduce the door to "a caller that meant it". It is not
 * required yet: both repos deploy on their own trains, and a requirement that
 * lands before the callers do is an outage, not a fix.
 *
 * The guard for all of this is `app/api/session-token/route.test.ts`.
 */

/** The custom header the first-party SSO bridges send. Accepted and advertised
 *  today; the hook for making "a caller that meant it" mandatory later. */
export const BRIDGE_HEADER = "X-Matrx-Session-Bridge";

/**
 * True when this request is a browser NAVIGATION or a subresource load — i.e.
 * something whose result a person or a page-reading tool can see — rather than
 * the scripted `fetch()` a credential door exists to serve.
 */
export function isDocumentRequest(headers: Headers): boolean {
  const mode = headers.get("sec-fetch-mode");
  if (mode === "navigate") return true;
  const dest = headers.get("sec-fetch-dest");
  // Absent → a non-browser client; see "WHAT THIS DELIBERATELY DOES NOT DO".
  if (!dest) return false;
  return dest !== "empty";
}

/**
 * The refusal. It never renders the credential, it says WHY in full, and — the
 * fourth law — it hands over the remedy, because the honest question behind
 * almost every navigation here is "who am I signed in as?", which `/api/whoami`
 * answers with no credential in it at all.
 */
export function documentRequestRefusal(doorName: string): {
  error: string;
  message: string;
} {
  return {
    error: "navigation_not_allowed",
    message:
      `${doorName} returns a LIVE credential, so it answers a script's fetch() ` +
      "and nothing else. This request arrived as a browser navigation or " +
      "subresource load (Sec-Fetch-Dest/Mode), which would have painted a " +
      "working access token onto a page where a screenshot, a text extractor " +
      "or an agent transcript captures it — that happened on 2026-09-17, and " +
      "the same failure cost this repo two dev-login credentials before that. " +
      "If you are checking WHICH IDENTITY this browser holds, open " +
      "/api/whoami: it returns your user id and email and carries no " +
      "credential. If you are a first-party app bridging a session, call this " +
      "URL from fetch() with credentials: 'include' — that is the only " +
      "supported caller.",
  };
}
