import { authenticatedStudyMediaLoadKey } from "./authLoad";

describe("authenticatedStudyMediaLoadKey", () => {
  it.each([
    ["hydrating auth", false, "user-1", "token-1"],
    ["signed out", true, null, null],
    ["session not restored", true, "user-1", null],
  ])("blocks a study-media read while %s", (_case, authReady, userId, accessToken) => {
    expect(
      authenticatedStudyMediaLoadKey({ authReady, userId, accessToken }),
    ).toBeNull();
  });

  it("permits the RLS-scoped read only after a usable authenticated session", () => {
    expect(
      authenticatedStudyMediaLoadKey({
        authReady: true,
        userId: "user-1",
        accessToken: "token-1",
      }),
    ).toBe("user-1");
  });
});
