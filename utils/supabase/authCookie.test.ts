import {
  AUTH_COOKIE_NAME,
  LEGACY_AUTH_COOKIE_NAME,
  authCookieOptions,
  isCurrentAuthCookie,
  legacyAuthCookieMigration,
} from "./authCookie";

describe("auth cookie authority isolation", () => {
  it("uses a different storage key from the retired Supabase authority", () => {
    expect(AUTH_COOKIE_NAME).toBe("sb-matrx-auth-v2");
    expect(AUTH_COOKIE_NAME).not.toBe(LEGACY_AUTH_COOKIE_NAME);
    expect(authCookieOptions("www.aimatrx.com")).toEqual({
      name: AUTH_COOKIE_NAME,
      domain: ".aimatrx.com",
    });
  });

  it("renames an unchunked legacy session for validation", () => {
    expect(
      legacyAuthCookieMigration([
        { name: LEGACY_AUTH_COOKIE_NAME, value: "session" },
      ]),
    ).toEqual([{ name: AUTH_COOKIE_NAME, value: "session" }]);
  });

  it("renames every numeric session chunk and ignores lookalikes", () => {
    expect(
      legacyAuthCookieMigration([
        { name: `${LEGACY_AUTH_COOKIE_NAME}.0`, value: "first" },
        { name: `${LEGACY_AUTH_COOKIE_NAME}.1`, value: "second" },
        { name: `${LEGACY_AUTH_COOKIE_NAME}.01`, value: "bad" },
        { name: `${LEGACY_AUTH_COOKIE_NAME}-other`, value: "other" },
      ]),
    ).toEqual([
      { name: `${AUTH_COOKIE_NAME}.0`, value: "first" },
      { name: `${AUTH_COOKIE_NAME}.1`, value: "second" },
    ]);
  });

  it("never lets a legacy cookie overwrite an existing current session", () => {
    expect(
      legacyAuthCookieMigration([
        { name: `${AUTH_COOKIE_NAME}.0`, value: "current" },
        { name: `${LEGACY_AUTH_COOKIE_NAME}.0`, value: "legacy" },
      ]),
    ).toEqual([]);
  });

  it("recognizes only the current unchunked key and numeric chunks", () => {
    expect(isCurrentAuthCookie(AUTH_COOKIE_NAME)).toBe(true);
    expect(isCurrentAuthCookie(`${AUTH_COOKIE_NAME}.12`)).toBe(true);
    expect(isCurrentAuthCookie(`${AUTH_COOKIE_NAME}.01`)).toBe(false);
    expect(isCurrentAuthCookie(`${AUTH_COOKIE_NAME}-other`)).toBe(false);
  });
});
