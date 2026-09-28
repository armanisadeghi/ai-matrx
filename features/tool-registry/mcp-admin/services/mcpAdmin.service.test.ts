import {
  getMcpTestNotificationLevel,
  mergeMcpToolAllowlist,
  toolAllowlistFromMetadata,
  type McpTestResult,
} from "./mcpAdmin.service";

function result(overrides: Partial<McpTestResult>): McpTestResult {
  return {
    ok: false,
    reachable: false,
    statusCode: null,
    latencyMs: null,
    error: null,
    transport: "streamable_http",
    endpointTested: null,
    message: "Not tested",
    ...overrides,
  };
}

describe("getMcpTestNotificationLevel", () => {
  it("treats a missing endpoint as expected configuration guidance", () => {
    expect(getMcpTestNotificationLevel(result({}))).toBe("info");
  });

  it("treats a stdio test skip as expected guidance", () => {
    expect(getMcpTestNotificationLevel(result({ transport: "stdio" }))).toBe(
      "info",
    );
  });

  it("keeps a failed network probe on the error path", () => {
    expect(
      getMcpTestNotificationLevel(
        result({
          endpointTested: "https://mcp.example.test",
          error: "Timed out",
        }),
      ),
    ).toBe("error");
  });

  it("classifies a reachable endpoint as success", () => {
    expect(
      getMcpTestNotificationLevel(
        result({
          ok: true,
          reachable: true,
          statusCode: 401,
          latencyMs: 20,
          endpointTested: "https://mcp.example.test",
        }),
      ),
    ).toBe("success");
  });
});

describe("MCP tool allowlists", () => {
  it("normalizes one tool name per line without storing an empty allowlist", () => {
    expect(
      mergeMcpToolAllowlist(
        { retained: { nested: true }, tool_allowlist: ["old_tool"] },
        "  list_teams\n\nlist_workspaces\nlist_teams  ",
      ),
    ).toEqual({
      retained: { nested: true },
      tool_allowlist: ["list_teams", "list_workspaces"],
    });

    expect(mergeMcpToolAllowlist({ retained: true }, " \n ")).toEqual({
      retained: true,
    });
  });

  it("treats an absent or empty stored allowlist as unrestricted", () => {
    expect(toolAllowlistFromMetadata({})).toEqual([]);
    expect(toolAllowlistFromMetadata({ tool_allowlist: [] })).toEqual([]);
  });
});
