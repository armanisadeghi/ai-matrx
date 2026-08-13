import { compareAgentDefinitions } from "../compare-agent-definitions";

describe("compareAgentDefinitions", () => {
  it("treats a renamed personal copy as behavior-identical", () => {
    const result = compareAgentDefinitions(
      { name: "System Writer", modelId: "model-a", tools: ["tool-a"] },
      { name: "My Writer", modelId: "model-a", tools: ["tool-a"] },
    );

    expect(result.comparedConfigurationMatches).toBe(false);
    expect(result.behaviorMatches).toBe(true);
    expect(result.profileFields.map((field) => field.key)).toEqual(["name"]);
    expect(result.behaviorFields).toHaveLength(0);
  });

  it("reports the exact behavior sections that diverged", () => {
    const result = compareAgentDefinitions(
      { name: "Writer", modelId: "model-a", tools: ["tool-a"] },
      { name: "Writer", modelId: "model-b", tools: ["tool-a", "tool-b"] },
    );

    expect(result.behaviorMatches).toBe(false);
    expect(result.behaviorFields.map((field) => field.key)).toEqual([
      "modelId",
      "tools",
    ]);
  });

  it("ignores lineage, timestamps, ids, and version counters", () => {
    const result = compareAgentDefinitions(
      {
        id: "system-id",
        sourceAgentId: null,
        updatedAt: "2026-01-01T00:00:00Z",
        version: 12,
      },
      {
        id: "personal-id",
        sourceAgentId: "system-id",
        updatedAt: "2026-02-01T00:00:00Z",
        version: 3,
      },
    );

    expect(result.comparedConfigurationMatches).toBe(true);
    expect(result.behaviorMatches).toBe(true);
  });

  it("covers every behavior field carried by linked-agent sync", () => {
    const result = compareAgentDefinitions(
      {
        messages: [],
        variableDefinitions: [],
        modelId: "model-a",
        modelTiers: null,
        settings: {},
        outputSchema: null,
        tools: [],
        customTools: [],
        contextSlots: [],
        mcpServers: [],
        autoToolsDisabled: false,
        skillConfig: { included: [], listed: [], forbidden: [], disabled: false },
        matrxActions: {},
        uiGates: {},
        defaultRagBoost: 0,
        ragAwarenessMode: "none",
      },
      {
        messages: [{ role: "system", content: [{ type: "text", text: "Changed" }] }],
        variableDefinitions: [
          { name: "topic", defaultValue: null, helpText: "Topic", required: true },
        ],
        modelId: "model-b",
        modelTiers: { default: "model-b" },
        settings: { temperature: 0.5 },
        outputSchema: {
          name: "Result",
          schema: { type: "object", properties: {}, additionalProperties: false },
        },
        tools: ["tool-a"],
        customTools: [
          {
            name: "lookup",
            description: "Lookup",
            input_schema: { type: "object", properties: {} },
          },
        ],
        contextSlots: [{ key: "source", type: "text", label: "Source" }],
        mcpServers: ["server-a"],
        autoToolsDisabled: true,
        skillConfig: { included: ["skill-a"], listed: [], forbidden: [], disabled: false },
        matrxActions: { auto_apply: true },
        uiGates: { image_urls: true },
        defaultRagBoost: 10,
        ragAwarenessMode: "full",
      },
    );

    expect(result.behaviorFields.map((field) => field.key)).toEqual([
      "messages",
      "variableDefinitions",
      "modelId",
      "modelTiers",
      "settings",
      "outputSchema",
      "tools",
      "customTools",
      "contextSlots",
      "mcpServers",
      "autoToolsDisabled",
      "skillConfig",
      "matrxActions",
      "uiGates",
      "defaultRagBoost",
      "ragAwarenessMode",
    ]);
  });

  it("separates syncable profile fields from per-record local state", () => {
    const result = compareAgentDefinitions(
      { name: "System", isActive: true, isFavorite: false },
      { name: "Personal", isActive: false, isFavorite: true },
    );

    expect(result.profileFields.map((field) => field.key)).toEqual(["name"]);
    expect(result.localStateFields.map((field) => field.key)).toEqual([
      "isActive",
      "isFavorite",
    ]);
    expect(result.behaviorMatches).toBe(true);
  });
});
