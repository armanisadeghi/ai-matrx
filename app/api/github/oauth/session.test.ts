import { parseGitHubOAuthSession, safeReturnUrl } from "./session";

describe("GitHub OAuth session", () => {
  test("accepts only local return paths", () => {
    expect(safeReturnUrl("/code?tab=source")).toBe("/code?tab=source");
    expect(safeReturnUrl("https://attacker.example/steal")).toBe("/code");
    expect(safeReturnUrl("//attacker.example/steal")).toBe("/code");
  });

  test("rejects incomplete state cookies", () => {
    expect(parseGitHubOAuthSession("not-json")).toBeNull();
    expect(parseGitHubOAuthSession(JSON.stringify({ state: "only-state" }))).toBeNull();
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
