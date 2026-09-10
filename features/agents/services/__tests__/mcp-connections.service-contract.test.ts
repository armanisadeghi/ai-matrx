import type { invokeMcpServerTool } from "../mcp-connections.service";

type InvokeResponse = Awaited<ReturnType<typeof invokeMcpServerTool>>;

describe("MCP invocation wire contract", () => {
  it("accepts the serialized output declared by the canonical backend schema", () => {
    const serializedOutput = JSON.stringify({
      user: { id: "user-1" },
      roles: ["member"],
    });
    const response: InvokeResponse = {
      success: true,
      output: serializedOutput,
      error: null,
    };

    expect(response.output).toBe(serializedOutput);
  });
});
