import { isSocialCallbackOrigin, isSocialProvider, parseSocialBrowserSession, safeSocialReturn } from "./session";

describe("social OAuth browser session", () => {
  test("routes each customer provider through the browser consent bridge", () => {
    for (const provider of ["reddit", "discord", "twitch", "bluesky", "mastodon", "snapchat"]) {
      expect(isSocialProvider(provider)).toBe(true);
    }
    expect(isSocialProvider("unknown-provider")).toBe(false);
  });
  test("refuses external return paths", () => {
    expect(safeSocialReturn("/user-settings/integrations?connection=discord")).toBe("/user-settings/integrations?connection=discord");
    expect(safeSocialReturn("https://attacker.invalid/callback")).toBe("/user-settings/integrations");
    expect(safeSocialReturn("//attacker.invalid/callback")).toBe("/user-settings/integrations");
  });

  test("refuses a cookie missing the organization binding", () => {
    expect(parseSocialBrowserSession(JSON.stringify({
      state: "csrf-state", browserProof: "browser-proof", returnUrl: "/user-settings/integrations", backendOrigin: "https://server.app.matrxserver.com", createdAt: Date.now(),
    }))).toBeNull();
  });

  test("accepts the agent-owned preview origin but no arbitrary callback host", () => {
    expect(isSocialCallbackOrigin("http://s59474d09.localhost:3001")).toBe(true);
    expect(isSocialCallbackOrigin("http://localhost:3001")).toBe(true);
    expect(isSocialCallbackOrigin("https://attacker.invalid")).toBe(false);
  });

  test("accepts a complete, recent browser session", () => {
    expect(parseSocialBrowserSession(JSON.stringify({
      state: "csrf-state", browserProof: "browser-proof", organizationId: "5dc930e9-bd65-44a1-8369-af773f6e1a5b", returnUrl: "/user-settings/integrations", backendOrigin: "https://server.app.matrxserver.com", createdAt: Date.now(),
    }))).toMatchObject({ state: "csrf-state", organizationId: "5dc930e9-bd65-44a1-8369-af773f6e1a5b" });
  });
});
