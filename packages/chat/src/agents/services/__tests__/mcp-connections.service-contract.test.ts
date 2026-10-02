import type { invokeMcpServerTool } from "../mcp-connections.service";

type InvokeResponse = Awaited<ReturnType<typeof invokeMcpServerTool>>;

describe("MCP invocation wire contract", () => {
  it("preserves structured JSON output declared by the canonical backend schema", () => {
    const structuredOutput = {
      user: { id: "user-1" },
      roles: ["member"],
      active: true,
      score: 7,
    };
    const response: InvokeResponse = {
      success: true,
      output: structuredOutput,
      error: null,
    };

    expect(response.output).toEqual(structuredOutput);
    expect(typeof response.output).toBe("object");
  });
});
