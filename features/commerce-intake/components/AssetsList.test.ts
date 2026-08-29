import { intakeAssetsLoadKey } from "./AssetsList";

describe("intakeAssetsLoadKey", () => {
  const authenticated = {
    authReady: true,
    userId: "user-1",
    accessToken: "access-token",
    organizationId: "org-1",
  };

  it.each([
    ["auth is still hydrating", { authReady: false }],
    ["the session is anonymous", { userId: null }],
    ["the browser token is not available", { accessToken: null }],
    ["the organization is not selected", { organizationId: null }],
  ])("refuses a read when %s", (_label, override) => {
    expect(intakeAssetsLoadKey({ ...authenticated, ...override })).toBeNull();
  });

  it("allows the read only after auth and organization context agree", () => {
    expect(intakeAssetsLoadKey(authenticated)).toBe("user-1:org-1");
  });
});
