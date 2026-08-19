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

  test("parses a valid session and revalidates its return path", () => {
    expect(
      parseGitHubOAuthSession(
        JSON.stringify({
          state: "csrf-state",
          redirectUri: "https://www.aimatrx.com/api/github/oauth/callback",
          returnUrl: "//attacker.example/steal",
        }),
      ),
    ).toEqual({
      state: "csrf-state",
      redirectUri: "https://www.aimatrx.com/api/github/oauth/callback",
      returnUrl: "/code",
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
