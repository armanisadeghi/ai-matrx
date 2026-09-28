import { composeKindAgentIntent } from "./kind-agent-intents";
import { composeComponentAuthoringIntent } from "./component-authoring-offer";

// The Artisan buttons keep sending exactly what they sent before (the kind
// creator's task_brief + kind_schema, same draft text) and now ALSO send the
// Artisan's own kind / design_brief / component_key plus the mapped-only facts.
describe("composeComponentAuthoringIntent", () => {
  const schema = { type: "object", properties: { title: { type: "string" } } };

  it("keeps every pre-existing value byte-identical and adds the declared ones", () => {
    const before = composeKindAgentIntent({
      kind: "invoice_card",
      label: "Invoice card",
      part: "component",
      emittedJsonSchema: schema,
    });
    const after = composeComponentAuthoringIntent({
      kind: "invoice_card",
      label: "Invoice card",
      emittedJsonSchema: schema,
      componentKey: "invoice_card_default",
      renderProblems: ["No active component for web"],
      componentCandidates: ["invoice_card_default", "generic_structured"],
      activationReasons: ["Render leg failed: no component"],
    });

    expect(after.draftText).toBe(before.draftText);
    for (const [name, value] of Object.entries(before.variables)) {
      expect(after.variables[name]).toBe(value);
    }
    expect(Object.keys(after.variables).sort()).toEqual(
      [
        "activation_verdict",
        "component_candidates",
        "component_key",
        "design_brief",
        "kind",
        "kind_label",
        "kind_schema",
        "render_problems",
        "task_brief",
      ].sort(),
    );
    expect(after.variables.kind).toBe("invoice_card");
    expect(after.variables.component_key).toBe("invoice_card_default");
    expect(after.variables.design_brief).toBe(before.variables.task_brief);
    expect(after.variables.render_problems).toBe("No active component for web");
  });

  it("omits what the button does not hold", () => {
    const after = composeComponentAuthoringIntent({ kind: "trophy_card", label: "" });
    expect(Object.keys(after.variables).sort()).toEqual(
      ["design_brief", "kind", "kind_schema", "task_brief"].sort(),
    );
  });
});
