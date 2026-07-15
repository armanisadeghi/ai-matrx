import { classifyUnprocessableError } from "../run-ai-stream";

describe("classifyUnprocessableError", () => {
  test("only invalid_uuid is labeled as a conversation ID error", () => {
    expect(classifyUnprocessableError("invalid_uuid", "bad id").prefix).toBe(
      "Invalid conversation ID",
    );
    expect(
      classifyUnprocessableError("agent_model_missing", "agent has no model")
        .prefix,
    ).toBe("Agent execution failed");
    expect(
      classifyUnprocessableError(null, "schema validation failed").prefix,
    ).toBe("Request rejected");
  });

  test("preserves the tool-injection classification", () => {
    expect(
      classifyUnprocessableError("tool_not_found", "missing local tool"),
    ).toEqual({ prefix: "Tool injection failed", isToolError: true });
  });
});
