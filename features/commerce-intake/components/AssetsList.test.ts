import { intakeAssetsLoadKey } from "./AssetsList";

describe("intakeAssetsLoadKey", () => {
  const authenticated = {
    authReady: true,
    userId: "user-1",
    accessToken: "access-token",
  };

  it.each([
    ["auth is still hydrating", { authReady: false }],
    ["the session is anonymous", { userId: null }],
    ["the browser token is not available", { accessToken: null }],
  ])("refuses a read when %s", (_label, override) => {
    expect(intakeAssetsLoadKey({ ...authenticated, ...override })).toBeNull();
  });

  it("allows the read once auth is ready — the selected organization never gates it", () => {
    expect(intakeAssetsLoadKey(authenticated)).toBe("user-1");
  });
});
