import {
  mcpConnectionActionLabel,
  mcpConnectionRouteFor,
} from "../mcp-connection-route";

describe("mcpConnectionRouteFor", () => {
  it("routes OAuth through the real popup flow", () => {
    expect(
      mcpConnectionRouteFor({
        slug: "microsoft-work-iq",
        authStrategy: "oauth_discovery",
      }),
    ).toBe("oauth");
    expect(mcpConnectionActionLabel("oauth")).toBe("Connect with OAuth");
  });

  it("reserves metadata-only connect for no-auth servers", () => {
    expect(
      mcpConnectionRouteFor({ slug: "public-tools", authStrategy: "none" }),
    ).toBe("none");
  });

  it.each(["bearer", "api_key", "env"] as const)(
    "routes %s through the credential editor",
    (authStrategy) => {
      expect(
        mcpConnectionRouteFor({ slug: "manual", authStrategy }),
      ).toBe("configure");
      expect(mcpConnectionActionLabel("configure")).toBe("Configure");
    },
  );

  it("keeps GitHub on its dedicated app route", () => {
    expect(
      mcpConnectionRouteFor({
        slug: "github",
        authStrategy: "oauth_discovery",
      }),
    ).toBe("github");
  });
});
