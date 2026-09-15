import { parseGitHubOAuthSession, safeReturnUrl } from "./session";

describe("GitHub OAuth session", () => {
  test("accepts only local return paths", () => {
    expect(safeReturnUrl("/code?tab=source")).toBe("/code?tab=source");
    expect(safeReturnUrl("https://attacker.example/steal")).toBe("/code");
    expect(safeReturnUrl("//attacker.example/steal")).toBe("/code");
    expect(safeReturnUrl("/\\attacker.example/steal")).toBe("/code");
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
          returnUrl: "//attacker.example/steal",
          browserProof: "browser-proof",
          flow: "authorize",
          organizationId: "5dc930e9-bd65-44a1-8369-af773f6e1a5b",
        }),
      ),
    ).toEqual({
        state: "csrf-state",
        returnUrl: "/code",
        browserProof: "browser-proof",
        flow: "authorize",
      organizationId: "5dc930e9-bd65-44a1-8369-af773f6e1a5b",
    });
  });
});
