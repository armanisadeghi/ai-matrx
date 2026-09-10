import type { invokeMcpServerTool } from "../mcp-connections.service";

type InvokeResponse = Awaited<ReturnType<typeof invokeMcpServerTool>>;

describe("MCP invocation wire contract", () => {
  it("accepts structured JSON output from the canonical backend schema", () => {
    const response: InvokeResponse = {
      success: true,
      output: { user: { id: "user-1" }, roles: ["member"] },
      error: null,
    };

    expect(response.output).toEqual({
      user: { id: "user-1" },
      roles: ["member"],
    });
  });
});
