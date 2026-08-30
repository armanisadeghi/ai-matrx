import {
  githubAuthorizationUrl,
  parseGitHubOAuthSession,
  safeReturnUrl,
} from "./session";

describe("GitHub OAuth session", () => {
  test("accepts only local return paths", () => {
    expect(safeReturnUrl("/code?tab=source")).toBe("/code?tab=source");
    expect(safeReturnUrl("https://attacker.example/steal")).toBe("/code");
    expect(safeReturnUrl("//attacker.example/steal")).toBe("/code");
  });

  test("rejects incomplete state cookies", () => {
    expect(parseGitHubOAuthSession("not-json")).toBeNull();
    expect(
      parseGitHubOAuthSession(JSON.stringify({ state: "only-state" })),
    ).toBeNull();
  });

  // REFUSAL: a cookie minted before organization threading existed (or one
  // tampered with to drop it) must not be treated as a valid session - the
  // eventual exchange call would 400 server-side (organization_required)
  // with no clear path back for the user. Paired CONTROL below.
  test("REFUSAL: rejects a session cookie with no organizationId", () => {
    expect(
      parseGitHubOAuthSession(
        JSON.stringify({
          state: "csrf-state",
          redirectUri: "https://www.aimatrx.com/api/github/oauth/callback",
          returnUrl: "/code",
        }),
      ),
    ).toBeNull();
  });

  test("CONTROL: parses a valid session (with organizationId) and revalidates its return path", () => {
    expect(
      parseGitHubOAuthSession(
        JSON.stringify({
          state: "csrf-state",
          redirectUri: "https://www.aimatrx.com/api/github/oauth/callback",
          returnUrl: "//attacker.example/steal",
          organizationId: "5dc930e9-bd65-44a1-8369-af773f6e1a5b",
        }),
      ),
    ).toEqual({
      state: "csrf-state",
      redirectUri: "https://www.aimatrx.com/api/github/oauth/callback",
      returnUrl: "/code",
      organizationId: "5dc930e9-bd65-44a1-8369-af773f6e1a5b",
    });
  });
});

describe("githubAuthorizationUrl", () => {
  test("starts user authorization instead of opening installation settings", () => {
    const url = githubAuthorizationUrl(
      "client-id",
      "https://www.aimatrx.com/api/github/oauth/callback",
      "csrf-state",
    );

    expect(url.origin + url.pathname).toBe(
      "https://github.com/login/oauth/authorize",
    );
    expect(url.searchParams.get("client_id")).toBe("client-id");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://www.aimatrx.com/api/github/oauth/callback",
    );
    expect(url.searchParams.get("state")).toBe("csrf-state");
  });
});
