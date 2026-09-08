/**
 * The sentences the app says when a browser's auth cookies cannot be trusted.
 *
 * A PLAIN MODULE, deliberately: the proxy needs the ambiguous sentence too, and
 * the proxy cannot import a `"use client"` file. Two copies of a sentence is
 * how one of them ends up false.
 */

/**
 * WHETHER TO SPEAK, AND WHAT TO SAY — pure, so the three cases can be driven
 * without a DOM. They are genuinely different situations and each has to get
 * the true sentence:
 *
 *  · ambiguous  — the proxy refused BOTH copies of an auth cookie that arrived
 *                 unchunked AND chunked, because nothing in a `Cookie` header
 *                 says which is current and guessing means guessing whose
 *                 session to serve. It expired them, so this tab has no session
 *                 LEFT — which is exactly why this case must not require one.
 *                 Silent otherwise (2026-09-08, R-O3).
 *  · split jar  — the same name arrived at two Domain scopes; the tab still
 *                 holds a session the server could not read.
 *  · neither    — the server saw nobody while this tab has somebody.
 */
export function sessionIntegrityNotice(input: {
  splitCookieJar: boolean;
  ambiguousAuthCookies: boolean;
  clientHasSession: boolean;
}): { title: string; description: string } | null {
  if (input.ambiguousAuthCookies) {
    return {
      title:
        "We signed you out of this browser — its sign-in cookies could have belonged to two different people",
      description:
        "This browser held two sign-in cookies for this site in shapes that cannot both be current, and nothing in them says which one is yours. Rather than risk showing you someone else's account, we cleared both and ended the session. Nothing you saved is affected. Signing in again is all that is needed.",
    };
  }
  if (!input.clientHasSession) return null;
  return {
    title: "This browser's session cookies are inconsistent — sign in again",
    description: input.splitCookieJar
      ? "This browser sent two different copies of the sign-in cookie, so the server could not tell who you are. Anything on this page that needs your account will look empty or refuse to save, no matter how many times you retry. We have cleared the stale copy; signing in again restores the page."
      : "This tab is signed in, but the server did not recognise the session on this request, so anything that needs your account will look empty or refuse to save. Signing in again restores the page.",
  };
}
