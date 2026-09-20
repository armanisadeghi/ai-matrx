import {
  agentComparisonModelManifest,
  createAgentComparisonModelScope,
} from "./agent-comparison-model.manifest";

describe("agentComparisonModelManifest", () => {
  it("declares the isolated Model Battle contract and only reviewable draft writes", () => {
    expect(agentComparisonModelManifest.surfaceName).toBe(
      "matrx-user/agent-comparison-model",
    );
    expect(agentComparisonModelManifest.urlPattern).toBe(
      "/agents/battle/model",
    );
    expect(agentComparisonModelManifest.agentRoles).toBeUndefined();
    expect(agentComparisonModelManifest.inheritsFrom).toBeUndefined();
    expect(
      agentComparisonModelManifest.values.map((value) => value.name),
    ).toEqual(
      expect.arrayContaining([
        "locked_agent",
        "shared_user_input_draft",
        "shared_variables",
        "shared_resources",
        "shared_context_entries",
        "model_outcomes",
        "comparison_set",
        "comparison_state",
      ]),
    );
    expect(agentComparisonModelManifest.writeTargets).toEqual([
      expect.objectContaining({
        name: "shared_user_input_draft",
        mode: "draft",
        applyPolicy: "ask",
        updatesValue: "shared_user_input_draft",
      }),
      expect.objectContaining({
        name: "shared_variables",
        mode: "draft",
        applyPolicy: "ask",
        updatesValue: "shared_variables",
      }),
    ]);
  });

  it("preserves typed scope values without serializing them", () => {
    const variables = { product_name: "Matrx", limit: 3 };
    const scope = createAgentComparisonModelScope({
      shared_variables: variables,
      comparison_state: { blind_active: false },
    });

    expect(scope.shared_variables).toBe(variables);
  });
});
