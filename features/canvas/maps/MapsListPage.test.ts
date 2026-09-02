import { canLoadMaps } from "./MapsListPage";

describe("canLoadMaps", () => {
  it.each([
    { authReady: false, userId: null, accessToken: null },
    { authReady: true, userId: null, accessToken: "token" },
    { authReady: true, userId: "user-1", accessToken: null },
  ])("blocks list reads until the browser session is usable", (auth) => {
    expect(canLoadMaps(auth)).toBe(false);
  });

  it("permits list reads after identity and token adoption", () => {
    expect(
      canLoadMaps({
        authReady: true,
        userId: "user-1",
        accessToken: "token",
      }),
    ).toBe(true);
  });
});
