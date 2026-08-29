import {
  getMcpTestNotificationLevel,
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
