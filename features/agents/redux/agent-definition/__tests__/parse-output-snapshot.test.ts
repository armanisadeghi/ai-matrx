import {
  parseAgentOutputSchema,
  parseAgentVersionSnapshot,
} from "../parse-output-snapshot";

function validSnapshotRow(): Record<string, unknown> {
  return {
    version_id: "version-1",
    version_number: 4,
    agent_type: "user",
    name: "Snapshot agent",
    description: "A saved version",
    messages: [],
    variable_definitions: null,
    model_id: "model-1",
    model_tiers: null,
    settings: {},
    output_schema: {
      name: "answer",
      strict: true,
      schema: {
        type: "object",
        properties: { answer: { type: "string" } },
        required: ["answer"],
        additionalProperties: false,
      },
    },
    tools: [],
    custom_tools: [],
    context_policies: [],
    auto_context_disabled: false,
    category: "General",
    tags: ["saved"],
    is_active: true,
    changed_at: "2026-08-30T12:00:00.000Z",
    change_note: "Saved",
    mcp_servers: [],
    tool_config: null,
    skill_config: null,
    matrx_actions: {},
    ui_gates: {},
    default_rag_boost: 1,
    rag_awareness_mode: "auto",
    input_kind: "",
  };
}

describe("parseAgentOutputSchema", () => {
  it("preserves a valid recursive schema and extension keywords", () => {
    const raw = {
      name: "typed_answer",
      description: "Structured answer",
      strict: true,
      vendor: "extension-envelope-value",
      schema: {
        type: "object",
        $comment: "preserved schema extension",
        properties: {
          answer: {
            type: "string",
            minLength: 1,
            examples: ["yes"],
          },
          evidence: {
            anyOf: [
              { type: "array", items: { $ref: "#/$defs/evidence" } },
              { type: "null" },
            ],
          },
        },
        required: ["answer", "evidence"],
        additionalProperties: false,
        $defs: {
          evidence: {
            type: "object",
            properties: { source: { type: "string", format: "uuid" } },
          },
        },
      },
    };

    expect(parseAgentOutputSchema(raw)).toEqual(raw);
  });

  it("preserves null as the unstructured-output state", () => {
    expect(parseAgentOutputSchema(null)).toBeNull();
  });

  it("accepts omitted optional envelope and schema fields", () => {
    expect(
      parseAgentOutputSchema({
        name: "minimal",
        schema: {},
      }),
    ).toEqual({ name: "minimal", schema: {} });
  });

  it("rejects malformed known fields at any recursive depth", () => {
    expect(() =>
      parseAgentOutputSchema({
        name: "bad_nested_type",
        schema: {
          type: "object",
          properties: {
            answer: { type: "definitely-not-json-schema" },
          },
        },
      }),
    ).toThrow(
      "output_schema.schema.properties.answer.type must be a valid JSON Schema type or type array",
    );
  });

  it("rejects an invalid envelope name", () => {
    expect(() =>
      parseAgentOutputSchema({ name: "contains spaces", schema: {} }),
    ).toThrow("output_schema.name");
  });
});

describe("parseAgentVersionSnapshot", () => {
  it("returns a fully parsed generated RPC row", () => {
    const raw = validSnapshotRow();

    expect(parseAgentVersionSnapshot(raw)).toEqual(raw);
  });

  it("preserves a null output schema in the RPC row", () => {
    const raw = validSnapshotRow();
    raw.output_schema = null;

    expect(parseAgentVersionSnapshot(raw).output_schema).toBeNull();
  });

  it("rejects malformed generated scalar fields", () => {
    const raw = validSnapshotRow();
    raw.version_number = "4";

    expect(() => parseAgentVersionSnapshot(raw)).toThrow(
      "version_number must be a finite number",
    );
  });

  it("rejects a missing JSON field instead of manufacturing a default", () => {
    const raw = validSnapshotRow();
    delete raw.output_schema;

    expect(() => parseAgentVersionSnapshot(raw)).toThrow(
      "output_schema must be present in the RPC row",
    );
  });

  it("rejects malformed persisted output-schema data", () => {
    const raw = validSnapshotRow();
    raw.output_schema = { name: "answer", schema: [] };

    expect(() => parseAgentVersionSnapshot(raw)).toThrow(
      "output_schema.schema must be a JSON Schema object",
    );
  });
});
