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
    // Both columns are NOT NULL with a `'{}'` default; the fixture carries what
    // an agent that never configured tools or skills actually stores.
    tool_config: {},
    skill_config: {},
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

    expect(parseAgentVersionSnapshot(raw)).toEqual({
      ...raw,
      // The column's `'{}'` default IS the empty config, not a parse failure.
      skill_config: {
        included: [],
        listed: [],
        forbidden: [],
        disabled: false,
      },
    });
  });

  // `skill_config` is NOT NULL default `'{}'::jsonb`, so a config with none of
  // the four keys is the DB's own default. Demanding all four threw
  // "skill_config.included must be an array of strings" on every agent that had
  // never configured skills — while the live-agent read of the SAME column
  // returned the empty config. One parser now serves both.
  it("reads the skill_config column default as the empty config", () => {
    const raw = validSnapshotRow();
    raw.skill_config = {};

    expect(parseAgentVersionSnapshot(raw).skill_config).toEqual({
      included: [],
      listed: [],
      forbidden: [],
      disabled: false,
    });
  });

  it("keeps a fully populated skill_config intact", () => {
    const raw = validSnapshotRow();
    raw.skill_config = {
      included: ["a"],
      listed: ["b"],
      forbidden: ["c"],
      disabled: true,
    };

    expect(parseAgentVersionSnapshot(raw).skill_config).toEqual({
      included: ["a"],
      listed: ["b"],
      forbidden: ["c"],
      disabled: true,
    });
  });

  it("reads the tool_config column default as an empty object", () => {
    const raw = validSnapshotRow();
    raw.tool_config = {};

    expect(parseAgentVersionSnapshot(raw).tool_config).toEqual({});
  });

  it("preserves a null output schema in the RPC row", () => {
    const raw = validSnapshotRow();
    raw.output_schema = null;

    expect(parseAgentVersionSnapshot(raw).output_schema).toBeNull();
  });

  it("preserves the historical null input kind", () => {
    const raw = validSnapshotRow();
    raw.input_kind = null;

    expect(parseAgentVersionSnapshot(raw).input_kind).toBeNull();
  });

  // THE RETURNS-TABLE NULLABILITY LIE. Supabase types every `RETURNS TABLE`
  // column non-null because Postgres carries no nullability on an OUT
  // parameter. These four columns are nullable in `agent.definition_version`,
  // and change_note is NULL on the large majority of saved versions — the
  // snapshot trigger writes `current_setting('app.change_note', true)`, which
  // only a caller that sets the GUC ever fills in. Before this parser followed
  // the table instead of the generated row, every one of these threw a
  // TypeError and took the whole version-diff surface down with it.
  it.each([
    ["change_note", "change_note"],
    ["description", "description"],
    ["category", "category"],
    ["model_id", "model_id"],
  ])("preserves a null %s exactly as the column stores it", (_label, key) => {
    const raw = validSnapshotRow();
    raw[key] = null;

    expect(parseAgentVersionSnapshot(raw)[key as "change_note"]).toBeNull();
  });

  it("parses a version row with every nullable column NULL at once", () => {
    const raw = validSnapshotRow();
    for (const key of [
      "change_note",
      "description",
      "category",
      "model_id",
      "input_kind",
      "output_schema",
      "model_tiers",
      "variable_definitions",
    ]) {
      raw[key] = null;
    }

    const parsed = parseAgentVersionSnapshot(raw);

    expect(parsed.change_note).toBeNull();
    expect(parsed.description).toBeNull();
    expect(parsed.category).toBeNull();
    expect(parsed.model_id).toBeNull();
    expect(parsed.variable_definitions).toBeNull();
  });

  // Widening for NULL must not become "accepts anything": a wrong TYPE in a
  // nullable column is still corrupt data and still names the exact field.
  it("still rejects a non-string, non-null change note", () => {
    const raw = validSnapshotRow();
    raw.change_note = 42;

    expect(() => parseAgentVersionSnapshot(raw)).toThrow(
      "change_note must be a string or null",
    );
  });

  // These five mirror NOT NULL columns on `agent.definition_version` (see
  // migrations/agent_definition_version_notnull_parity.sql). A NULL here is
  // genuinely corrupt and must still stop the read.
  it.each(["name", "agent_type", "tools", "tags", "is_active"])(
    "still rejects a null %s — the column is NOT NULL",
    (key) => {
      const raw = validSnapshotRow();
      raw[key] = null;

      expect(() => parseAgentVersionSnapshot(raw)).toThrow(key);
    },
  );

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
