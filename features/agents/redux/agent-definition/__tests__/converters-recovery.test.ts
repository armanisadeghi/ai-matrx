import { dbRowToAgentDefinition } from "../converters";

type AgentRow = Parameters<typeof dbRowToAgentDefinition>[0];

function liveResearchSlidesRow(): AgentRow {
  return {
    id: "8f0bbfc2-85d9-4913-8cea-b09a50c62be6",
    name: "Research → Slides Generator",
    description: "Turns a research report into slides.",
    category: null,
    tags: ["research-reporting"],
    is_active: true,
    is_archived: false,
    is_favorite: false,
    agent_type: "builtin",
    model_id: null,
    messages: [
      {
        role: "system",
        content: [{ type: "text", text: "Return a presentation_deck." }],
      },
    ],
    variable_definitions: [
      { name: "report_markdown", required: true, defaultValue: "" },
    ],
    settings: { stream: true, reasoning_effort: "high" },
    tools: [],
    context_policies: [],
    auto_context_disabled: false,
    input_kind: null,
    model_tiers: null,
    output_schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        __kind: { type: "string", const: "presentation_deck" },
        title: { type: "string" },
        slides: { type: "array", items: { type: "object" } },
      },
      required: ["__kind", "title", "slides"],
    },
    custom_tools: [],
    tool_config: {},
    skill_config: {},
    ui_gates: {},
    matrx_actions: {},
    mcp_servers: [],
    created_by: null,
    organization_id: "00000000-0000-0000-0000-000000000000",
    task_id: null,
    source_agent_id: null,
    source_snapshot_at: null,
    created_at: "2026-09-08T00:00:00.000Z",
    updated_at: "2026-09-08T00:00:00.000Z",
    version: 7,
    default_rag_boost: 0,
    rag_awareness_mode: "none",
  } as unknown as AgentRow;
}

describe("dbRowToAgentDefinition recovery boundary", () => {
  it("opens the exact live bare-schema class without losing its schema", () => {
    const row = liveResearchSlidesRow();
    const definition = dbRowToAgentDefinition(row);

    expect(definition.outputSchema).toEqual({
      name: "structured_output",
      schema: row.output_schema,
    });
    expect(definition.dataIssues?.map((issue) => issue.field)).toEqual([
      "output_schema",
    ]);
  });

  it("isolates malformed fields so none can crash the rest of the definition", () => {
    const row = liveResearchSlidesRow();
    Object.assign(row, {
      agent_type: "mystery",
      messages: { broken: true },
      variable_definitions: "broken",
      model_tiers: { default: 42 },
      output_schema: { name: "answer", schema: [] },
      matrx_actions: { actions: [42] },
      ui_gates: { image_urls: "yes" },
    });

    const definition = dbRowToAgentDefinition(row);

    expect(definition.agentType).toBe("user");
    expect(definition.messages).toEqual([]);
    expect(definition.variableDefinitions).toBeNull();
    expect(definition.modelTiers).toBeNull();
    expect(definition.outputSchema).toBeNull();
    expect(definition.matrxDirectives).toEqual({});
    expect(definition.uiGates).toEqual({});
    expect(definition.dataIssues?.map((issue) => issue.field)).toEqual([
      "messages",
      "variable_definitions",
      "model_tiers",
      "output_schema",
      "matrx_actions",
      "ui_gates",
      "agent_type",
    ]);
  });
});
