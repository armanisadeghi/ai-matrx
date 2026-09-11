import transcriptSchema from "./fixtures/transcript-cleaner-output-schema.json";
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

  it("recovers an invalid envelope name without losing its schema", () => {
    const notices: Array<{ message: string; recovery: string }> = [];

    expect(
      parseAgentOutputSchema(
        { name: "contains spaces", schema: { type: "string" } },
        (notice) => notices.push(notice),
      ),
    ).toEqual({ name: "structured_output", schema: { type: "string" } });
    expect(notices).toHaveLength(1);
  });

  it("adapts a supported bare schema without reporting damaged data", () => {
    const notices: Array<{ message: string; recovery: string }> = [];

    expect(
      parseAgentOutputSchema(
        { type: "object", properties: { answer: { type: "string" } } },
        (notice) => notices.push(notice),
      ),
    ).toEqual({
      name: "structured_output",
      schema: {
        type: "object",
        properties: { answer: { type: "string" } },
      },
    });
    expect(notices).toHaveLength(0);
  });
});

describe("parseAgentVersionSnapshot", () => {
  // Captured from agent 26c05422-1b6c-47a9-8a6a-a4c5e48fe8ea on 2026-09-11.
  it("loads a supported bare schema from a version without a false incident", () => {
    const raw = validSnapshotRow();
    raw.output_schema = transcriptSchema;
    const parsed = parseAgentVersionSnapshot(raw);
    expect(parsed.output_schema).toEqual({ name: "structured_output", schema: transcriptSchema });
    expect(parsed.data_issues ?? []).toEqual([]);
  });

  it("still diagnoses malformed nested fields in a bare schema", () => {
    const raw = validSnapshotRow();
    raw.output_schema = { type: "object", properties: { answer: { type: "broken" } } };
    const parsed = parseAgentVersionSnapshot(raw);
    expect(parsed.output_schema).toBeNull();
    expect(parsed.data_issues).toEqual([expect.objectContaining({
      field: "output_schema",
      message: expect.stringContaining("output_schema.properties.answer.type"),
    })]);
  });

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

  it("quarantines malformed sibling fields independently instead of throwing", () => {
    const raw = validSnapshotRow();
    raw.messages = { broken: true };
    raw.variable_definitions = "broken";
    raw.model_tiers = { default: 42 };
    raw.output_schema = { name: "answer", schema: [] };
    raw.tools = ["ok", 42];
    raw.tags = "broken";
    raw.mcp_servers = [false];
    raw.tool_config = [];
    raw.matrx_actions = { auto_apply: "yes" };
    raw.ui_gates = { file_urls: "yes" };

    const parsed = parseAgentVersionSnapshot(raw);

    expect(parsed.messages).toEqual([]);
    expect(parsed.variable_definitions).toBeNull();
    expect(parsed.model_tiers).toBeNull();
    expect(parsed.output_schema).toBeNull();
    expect(parsed.tools).toEqual([]);
    expect(parsed.tags).toEqual([]);
    expect(parsed.mcp_servers).toEqual([]);
    expect(parsed.tool_config).toEqual({});
    expect(parsed.matrx_actions).toEqual({});
    expect(parsed.ui_gates).toEqual({});
    expect(parsed.data_issues?.map((issue) => issue.field)).toEqual([
      "output_schema",
      "messages",
      "variable_definitions",
      "model_tiers",
      "tools",
      "tags",
      "mcp_servers",
      "tool_config",
      "matrx_actions",
      "ui_gates",
    ]);
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

  // Scalar identity/state fields still fail closed. Collection fields recover
  // below so one malformed historical value cannot take down version history.
  it.each(["name", "agent_type", "is_active"])(
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

  it("recovers a missing output schema and reports the persisted-data issue", () => {
    const raw = validSnapshotRow();
    delete raw.output_schema;

    const parsed = parseAgentVersionSnapshot(raw);

    expect(parsed.output_schema).toBeNull();
    expect(parsed.data_issues).toEqual([
      expect.objectContaining({ field: "output_schema" }),
    ]);
  });

  it("recovers malformed persisted output-schema data", () => {
    const raw = validSnapshotRow();
    raw.output_schema = { name: "answer", schema: [] };

    const parsed = parseAgentVersionSnapshot(raw);

    expect(parsed.output_schema).toBeNull();
    expect(parsed.data_issues).toEqual([
      expect.objectContaining({ field: "output_schema" }),
    ]);
  });

  it.each(["tools", "tags"])(
    "recovers a null %s collection and reports the persisted-data issue",
    (key) => {
      const raw = validSnapshotRow();
      raw[key] = null;

      const parsed = parseAgentVersionSnapshot(raw);

      expect(parsed[key as "tools"]).toEqual([]);
      expect(parsed.data_issues).toEqual([
        expect.objectContaining({ field: key }),
      ]);
    },
  );
});
