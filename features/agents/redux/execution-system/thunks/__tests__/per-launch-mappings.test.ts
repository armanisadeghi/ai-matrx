import { resolvePerLaunchMappings } from "../surface-scope-mapping";

describe("resolvePerLaunchMappings — a mapping chosen for one launch", () => {
  const variableDefinitions = [
    { name: "information", defaultValue: "" },
    { name: "tone", defaultValue: "" },
  ];

  it("resolves each mapped input from THIS launch's scope and beats the caller's own variables", () => {
    const out = resolvePerLaunchMappings({
      mappings: { information: { mapType: "surface_value", target: "selection" } },
      applicationScope: { selection: "the highlighted bit", content: "page" },
      variableDefinitions,
      contextPolicies: [],
      variables: { information: "stale", tone: "warm" },
    });
    expect(out.variables).toEqual({ information: "the highlighted bit", tone: "warm" });
  });

  it("an unmapped input is left alone; no mapping at all returns the caller's variables untouched", () => {
    const out = resolvePerLaunchMappings({
      mappings: { information: { mapType: "unmapped" } },
      applicationScope: { selection: "x" },
      variableDefinitions,
      contextPolicies: [],
      variables: { tone: "warm" },
    });
    expect(out.variables).toEqual({ tone: "warm" });
    const none = { tone: "warm" };
    expect(resolvePerLaunchMappings({ mappings: undefined, applicationScope: {}, variableDefinitions, contextPolicies: [], variables: none }).variables).toBe(none);
  });
});
