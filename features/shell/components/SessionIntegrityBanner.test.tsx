/**
 * The banner must speak for the case where the user has NO session left —
 * because we ended it.
 *
 * R-O3 (2026-09-08): when a browser holds one auth cookie name both unchunked
 * and chunked, `@ai-matrx/data/next` refuses BOTH copies rather than risk
 * resolving the wrong person, and expires them. The browser's own read is then
 * anonymous too, so the original `if (!clientHasSession) return null` guard
 * made that intervention completely invisible — a login screen and no reason.
 */
import { sessionIntegrityNotice } from "./SessionIntegrityBanner";

describe("sessionIntegrityNotice", () => {
  it("speaks when the jar was ambiguous even though the tab has NO session", () => {
    const notice = sessionIntegrityNotice({
      splitCookieJar: true,
      ambiguousAuthCookies: true,
      clientHasSession: false,
    });
    expect(notice).not.toBeNull();
    expect(notice?.title).toMatch(/We signed you out of this browser/i);
    // It must say who did it, why, and that nothing was lost.
    expect(notice?.description).toMatch(/we cleared both and ended the session/i);
    expect(notice?.description).toMatch(/Nothing you saved is affected/i);
    expect(notice?.description).toMatch(/Signing in again/i);
  });

  it("says nothing when there is no session and nothing was refused", () => {
    expect(
      sessionIntegrityNotice({
        splitCookieJar: false,
        ambiguousAuthCookies: false,
        clientHasSession: false,
      }),
    ).toBeNull();
    // ...including when a plain split jar left the tab signed out
    expect(
      sessionIntegrityNotice({
        splitCookieJar: true,
        ambiguousAuthCookies: false,
        clientHasSession: false,
      }),
    ).toBeNull();
  });

  it("keeps the split-jar sentence, and does not claim we signed anyone out", () => {
    const notice = sessionIntegrityNotice({
      splitCookieJar: true,
      ambiguousAuthCookies: false,
      clientHasSession: true,
    });
    expect(notice?.title).toMatch(/session cookies are inconsistent/i);
    expect(notice?.description).toMatch(/two different copies/i);
    expect(notice?.title).not.toMatch(/signed you out/i);
  });

  it("falls back to the server-saw-nobody sentence", () => {
    const notice = sessionIntegrityNotice({
      splitCookieJar: false,
      ambiguousAuthCookies: false,
      clientHasSession: true,
    });
    expect(notice?.description).toMatch(/did not recognise the session/i);
  });

  /**
   * VERIFIER-17 M1 (2026-09-24). The first load of a cold function spent the
   * server's 2.5s identity budget, so `getServerAuth()` answered
   * `authUnavailable` — "we could not tell", NOT "nobody". The gate read that
   * as "the server saw nobody while this tab has somebody" and told a
   * signed-in person on a public booking page that her session cookies were
   * inconsistent. Nothing was wrong with her cookies; the next load was clean.
   */
  it("says nothing about cookies when the server could not reach a verdict", () => {
    expect(
      sessionIntegrityNotice({
        splitCookieJar: false,
        ambiguousAuthCookies: false,
        clientHasSession: true,
        serverAuthUnavailable: true,
      }),
    ).toBeNull();
  });

  it("still speaks for a sign-out WE made, whatever the server could verify", () => {
    const notice = sessionIntegrityNotice({
      splitCookieJar: false,
      ambiguousAuthCookies: true,
      clientHasSession: false,
      serverAuthUnavailable: true,
    });
    expect(notice?.title).toMatch(/We signed you out of this browser/i);
  });
});
