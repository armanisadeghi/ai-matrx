import { compareAgentDefinitions } from "../compare-agent-definitions";
import type { AgentDefinition } from "@/features/agents/types/agent-definition.types";

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

  it("reports a schema change whose only new field is __kind", () => {
    const result = compareAgentDefinitions(
      {
        outputSchema: {
          name: "Result",
          schema: {
            type: "object",
            properties: { verdict: { type: "string" } },
            additionalProperties: false,
          },
        },
      },
      {
        outputSchema: {
          name: "Result",
          schema: {
            type: "object",
            properties: {
              verdict: { type: "string" },
              __kind: {
                type: "string",
                description:
                  "The registered kind this payload is an instance of, when it is one.",
              },
            },
            additionalProperties: false,
          },
        },
      },
    );

    expect(result.diffResult.hasChanges).toBe(true);
    expect(result.behaviorFields.map((field) => field.key)).toEqual([
      "outputSchema",
    ]);
  });

  it("reports output-schema property order changes", () => {
    const result = compareAgentDefinitions(
      {
        outputSchema: {
          name: "Result",
          schema: {
            type: "object",
            properties: {
              title: { type: "string" },
              score: { type: "number" },
            },
            additionalProperties: false,
          },
        },
      },
      {
        outputSchema: {
          name: "Result",
          schema: {
            type: "object",
            properties: {
              score: { type: "number" },
              title: { type: "string" },
            },
            additionalProperties: false,
          },
        },
      },
    );

    expect(result.behaviorFields.map((field) => field.key)).toEqual([
      "outputSchema",
    ]);
  });

  it("does not let root metadata exclusions hide nested configuration", () => {
    const result = compareAgentDefinitions(
      {
        outputSchema: {
          name: "Result",
          schema: {
            type: "object",
            properties: {
              version: { type: "string", description: "Schema A version" },
            },
            additionalProperties: false,
          },
        },
      },
      {
        outputSchema: {
          name: "Result",
          schema: {
            type: "object",
            properties: {
              version: { type: "string", description: "Schema B version" },
            },
            additionalProperties: false,
          },
        },
      },
    );

    expect(result.behaviorFields.map((field) => field.key)).toEqual([
      "outputSchema",
    ]);
  });

  it("ignores top-level Redux bookkeeping without hiding nested __kind", () => {
    const before = {
      outputSchema: {
        name: "Result",
        schema: {
          type: "object" as const,
          properties: {},
          additionalProperties: false,
        },
      },
      _fetchStatus: "versionSnapshot",
    } as Partial<AgentDefinition>;
    const after = {
      outputSchema: {
        name: "Result",
        schema: {
          type: "object" as const,
          properties: { __kind: { type: "string" as const } },
          additionalProperties: false,
        },
      },
      _fetchStatus: "full",
    } as Partial<AgentDefinition>;

    const result = compareAgentDefinitions(before, after);

    expect(result.behaviorFields.map((field) => field.key)).toEqual([
      "outputSchema",
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
        contextPolicies: [],
        mcpServers: [],
        autoToolsDisabled: false,
        skillConfig: { included: [], listed: [], forbidden: [], disabled: false },
        matrxDirectives: {},
        uiGates: {},
        defaultRagBoost: 0,
        ragAwarenessMode: "none",
        inputKind: null,
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
        contextPolicies: [{ key: "source", type: "text", label: "Source" }],
        mcpServers: ["server-a"],
        autoToolsDisabled: true,
        skillConfig: { included: ["skill-a"], listed: [], forbidden: [], disabled: false },
        matrxDirectives: { auto_apply: true },
        uiGates: { image_urls: true },
        defaultRagBoost: 10,
        ragAwarenessMode: "full",
        inputKind: "seo.keyword_request",
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
      "contextPolicies",
      "mcpServers",
      "autoToolsDisabled",
      "skillConfig",
      "matrxDirectives",
      "uiGates",
      "defaultRagBoost",
      "ragAwarenessMode",
      "inputKind",
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
