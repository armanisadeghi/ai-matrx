import { buildKindAuthoringOffer } from "./kind-authoring-offer";
import { composeKindAgentIntent } from "./kind-agent-intents";

describe("buildKindAuthoringOffer", () => {
  it("adds only held facts, string-typed for the string-only run window", () => {
    expect(
      buildKindAuthoringOffer({
        kindSlug: "recipe_card",
        kindLabel: "Recipe card",
        authoringPart: "component",
        renderGapState: "inactive_component",
        kindIsActive: false,
        authorNote: "  ",
        referenceKind: null,
      }),
    ).toEqual({
      kind_slug: "recipe_card",
      kind_label: "Recipe card",
      authoring_part: "component",
      render_gap_state: "inactive_component",
      kind_is_active: "false",
    });
  });

  it("spread beside the seed never changes an existing seed key", () => {
    const seed = composeKindAgentIntent({ kind: "recipe_card", label: "Recipe card", part: "component" });
    const before = { ...seed.variables };
    const merged = { ...buildKindAuthoringOffer({ kindSlug: "recipe_card", authoringPart: "component" }), ...seed.variables };
    for (const [k, v] of Object.entries(before)) expect(merged[k]).toBe(v);
    expect(Object.keys(merged).sort()).toEqual([...Object.keys(before), "authoring_part", "kind_slug"].sort());
    expect(seed.variables).toEqual(before);
  });
});
