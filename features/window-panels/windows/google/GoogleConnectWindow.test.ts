import { isGoogleAuthorizationActionDisabled } from "./authorizationReadiness";

describe("GoogleConnectWindow authorization readiness", () => {
  it("blocks every authorization action until Google Identity Services loads", () => {
    expect(isGoogleAuthorizationActionDisabled(false, null)).toBe(true);
  });

  it("blocks duplicate authorization while another action is running", () => {
    expect(isGoogleAuthorizationActionDisabled(true, "connect")).toBe(true);
  });

  it("enables authorization only when GIS is ready and the panel is idle", () => {
    expect(isGoogleAuthorizationActionDisabled(true, null)).toBe(false);
  });
});
