import {
  analyzeImportPaste,
  sanitizeModelId,
} from "../agent-import-validation";

const EMPTY_TOOL_INDEX = new Map<string, string>();

const VALID_AGENT = {
  agent_type: "user",
  name: "Test Agent",
  messages: [
    {
      role: "system",
      content: [{ type: "text", text: "You are helpful." }],
    },
    {
      role: "user",
      content: [{ type: "text", text: "Hello {{name}}" }],
    },
  ],
  variable_definitions: [
    {
      name: "name",
      helpText: "Your name",
      defaultValue: "World",
    },
  ],
  settings: { stream: true },
  tools: [],
};

describe("analyzeImportPaste", () => {
  it("returns empty for blank input", () => {
    expect(
      analyzeImportPaste("agent-json", "  ", EMPTY_TOOL_INDEX).status,
    ).toBe("empty");
  });

  it("flags empty model_id as a blocking error", () => {
    const raw = JSON.stringify({ ...VALID_AGENT, model_id: "" });
    const result = analyzeImportPaste("agent-json", raw, EMPTY_TOOL_INDEX);
    expect(result.status).toBe("analyzed");
    if (result.status !== "analyzed") return;
    expect(result.canConvert).toBe(false);
    expect(
      result.issues.some(
        (i) => i.severity === "error" && i.path === "model_id",
      ),
    ).toBe(true);
  });

  it("allows omitting model_id", () => {
    const raw = JSON.stringify(VALID_AGENT);
    const result = analyzeImportPaste("agent-json", raw, EMPTY_TOOL_INDEX);
    expect(result.status).toBe("analyzed");
    if (result.status !== "analyzed") return;
    expect(result.canConvert).toBe(true);
  });

  it("flags invalid message roles", () => {
    const raw = JSON.stringify({
      ...VALID_AGENT,
      messages: [{ role: "developer", content: [{ type: "text", text: "x" }] }],
    });
    const result = analyzeImportPaste("agent-json", raw, EMPTY_TOOL_INDEX);
    expect(result.status).toBe("analyzed");
    if (result.status !== "analyzed") return;
    expect(result.canConvert).toBe(false);
    expect(result.issues.some((i) => i.path?.includes("role"))).toBe(true);
  });

  it("flags text blocks that use content instead of text", () => {
    const raw = JSON.stringify({
      ...VALID_AGENT,
      messages: [
        {
          role: "system",
          content: [{ type: "text", content: "wrong field" }],
        },
      ],
    });
    const result = analyzeImportPaste("agent-json", raw, EMPTY_TOOL_INDEX);
    expect(result.status).toBe("analyzed");
    if (result.status !== "analyzed") return;
    expect(result.canConvert).toBe(false);
    expect(result.issues.some((i) => i.message.includes("`content`"))).toBe(
      true,
    );
  });

  it("returns malformed for unparseable JSON", () => {
    const result = analyzeImportPaste(
      "agent-json",
      "{ not valid json at all",
      EMPTY_TOOL_INDEX,
    );
    expect(
      result.status === "malformed" || result.status === "incomplete",
    ).toBe(true);
  });
});

describe("sanitizeModelId", () => {
  it("treats empty strings as null", () => {
    expect(sanitizeModelId("")).toBeNull();
    expect(sanitizeModelId("   ")).toBeNull();
  });

  it("preserves valid UUID strings", () => {
    const id = "e2150d2f-7dd3-4fad-9d81-6e6ea41d4afd";
    expect(sanitizeModelId(id)).toBe(id);
  });
});
