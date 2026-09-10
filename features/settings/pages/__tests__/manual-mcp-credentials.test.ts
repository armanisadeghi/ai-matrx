import { buildManualMcpCredentials } from "../manual-mcp-credentials";

describe("manual MCP credential input", () => {
  it("builds sealed header fields with a same-host endpoint override", () => {
    expect(
      buildManualMcpCredentials(
        "https://mcp.example.com/mcp",
        "https://mcp.example.com/acme/mcp",
        [
          { name: "Authorization", value: "Bearer secret" },
          { name: "X-Workspace-Slug", value: "acme" },
        ],
      ),
    ).toEqual({
      endpointOverride: "https://mcp.example.com/acme/mcp",
      fields: {
        header_authorization: "Bearer secret",
        header_x_workspace_slug: "acme",
      },
    });
  });

  it("rejects cross-host endpoint overrides before credentials leave the page", () => {
    expect(() =>
      buildManualMcpCredentials(
        "https://mcp.example.com/mcp",
        "https://attacker.example/mcp",
        [{ name: "Authorization", value: "Bearer secret" }],
      ),
    ).toThrow("catalog provider host");
  });

  it("rejects incomplete and duplicate headers", () => {
    expect(() =>
      buildManualMcpCredentials("https://mcp.example.com/mcp", "", [
        { name: "Authorization", value: "" },
      ]),
    ).toThrow("both a name and a value");

    expect(() =>
      buildManualMcpCredentials("https://mcp.example.com/mcp", "", [
        { name: "Authorization", value: "one" },
        { name: "authorization", value: "two" },
      ]),
    ).toThrow("Duplicate HTTP header");
  });
});
