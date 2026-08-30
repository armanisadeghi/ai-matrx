/**
 * The auth-cookie BINDING, not the cookie algorithm.
 *
 * The algorithm (domain-wide span, the rename migration, chunk-suffix
 * recognition) lives in `@ai-matrx/data` and is tested there. What only THIS
 * repo can get wrong is the binding: our apex domain, our current cookie name,
 * and the superseded name we migrate from and clear.
 */
import {
  AUTH_COOKIE_NAME,
  LEGACY_AUTH_COOKIE_NAME,
  authCookieOptions,
  isCurrentAuthCookie,
  supabaseNext,
} from "./authCookie";

describe("this app's auth-cookie binding", () => {
  it("binds the current name, the superseded name, and our apex", () => {
    expect(AUTH_COOKIE_NAME).toBe("sb-matrx-auth-v2");
    expect(AUTH_COOKIE_NAME).not.toBe(LEGACY_AUTH_COOKIE_NAME);
    expect(supabaseNext.authCookie.legacyCookieName).toBe(
      LEGACY_AUTH_COOKIE_NAME,
    );
    expect(authCookieOptions("www.aimatrx.com")).toEqual({
      name: AUTH_COOKIE_NAME,
      domain: ".aimatrx.com",
    });
    // Off-apex hosts must stay host-only — a browser silently rejects a
    // Set-Cookie whose Domain does not cover the current host.
    expect(authCookieOptions("localhost:3000")).toEqual({
      name: AUTH_COOKIE_NAME,
    });
  });

  it("migrates the superseded key onto ours, chunks included, absent-only", () => {
    expect(
      supabaseNext.authCookie.migrateLegacyCookies([
        { name: `${LEGACY_AUTH_COOKIE_NAME}.0`, value: "first" },
        { name: `${LEGACY_AUTH_COOKIE_NAME}.1`, value: "second" },
        { name: `${LEGACY_AUTH_COOKIE_NAME}.01`, value: "bad" },
        { name: `${LEGACY_AUTH_COOKIE_NAME}-other`, value: "other" },
      ]),
    ).toEqual([
      { name: `${AUTH_COOKIE_NAME}.0`, value: "first" },
      { name: `${AUTH_COOKIE_NAME}.1`, value: "second" },
    ]);
    // A live session under the current key is never overwritten.
    expect(
      supabaseNext.authCookie.migrateLegacyCookies([
        { name: `${AUTH_COOKIE_NAME}.0`, value: "current" },
        { name: `${LEGACY_AUTH_COOKIE_NAME}.0`, value: "legacy" },
      ]),
    ).toEqual([]);
  });

  it("recognizes our current cookie and nothing that merely shares its prefix", () => {
    expect(isCurrentAuthCookie(AUTH_COOKIE_NAME)).toBe(true);
    expect(isCurrentAuthCookie(`${AUTH_COOKIE_NAME}.12`)).toBe(true);
    expect(isCurrentAuthCookie(`${AUTH_COOKIE_NAME}.01`)).toBe(false);
    expect(isCurrentAuthCookie(`${AUTH_COOKIE_NAME}-other`)).toBe(false);
  });
});
