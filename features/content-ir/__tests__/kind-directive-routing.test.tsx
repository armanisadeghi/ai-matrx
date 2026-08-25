/**
 * THE PREFIX TIER — the routing language, proven.
 *
 * Arman's ruling: the kind name IS a routing language, so a predefined prefix
 * auto-triggers a generic component when no custom one exists and every
 * enrolled noun "instantly has a view". This asserts the resolution order the
 * whole KD3 merge rests on:
 *
 *   exact slug → the CLASS prefix rule → null (the graceful floor)
 *
 * and the property that makes it worth having: a noun NOBODY registered still
 * resolves, because its class did.
 */

import {
  getDirectiveRenderer,
  registerDirectiveRenderer,
} from "@/features/matrx-envelope/registry";

function at(slug: string, directiveClass: string) {
  return { slug, directiveClass } as Parameters<typeof getDirectiveRenderer>[0];
}

describe("directive renderer resolution", () => {
  it("gives EVERY reference noun a renderer from one class registration", () => {
    // None of these is registered by name. All of them resolve, because
    // `reference` is. This is the 419-noun catalog rendering for free.
    for (const noun of ["note", "task", "workbook_sheet", "a_noun_invented_today"]) {
      expect(
        getDirectiveRenderer(at(`directive_v1_reference_${noun}`, "reference")),
      ).not.toBeNull();
    }
  });

  it("lets an exact slug OVERRIDE its class rule", () => {
    const classRenderer = getDirectiveRenderer(
      at("directive_v1_reference_note", "reference"),
    );
    const Custom = () => null;
    registerDirectiveRenderer("reference", Custom, "a_test_only_noun");

    expect(
      getDirectiveRenderer(at("directive_v1_reference_a_test_only_noun", "reference")),
    ).toBe(Custom);
    // …and only that slug. Its siblings keep the class renderer.
    expect(getDirectiveRenderer(at("directive_v1_reference_note", "reference"))).toBe(
      classRenderer,
    );
  });

  it("routes the Kind Actions by their ONE post-merge identity", () => {
    // Before the merge these were dual-registered under `output_directive:` AND
    // `function:` — two names for one procedure, two chances to disagree.
    for (const noun of ["plan_tree", "plan_node_patch", "context_groom", "create_project_with_tasks"]) {
      expect(
        getDirectiveRenderer(at(`directive_v1_action_${noun}`, "action")),
      ).not.toBeNull();
    }
  });

  it("returns null for a class nothing claims — the graceful floor, not a crash", () => {
    // MatrxEnvelopeBlock turns this into EnvelopeFallbackCard: named by class
    // and noun, with an Apply button when the class is a side effect. Never
    // null, never silent, never a dropped message block.
    expect(getDirectiveRenderer(at("directive_v1_delete_task", "delete"))).toBeNull();
    expect(
      getDirectiveRenderer(at("directive_v1_validation_regex", "validation")),
    ).toBeNull();
  });

  it("refuses a registration whose slug the grammar could not parse back", () => {
    const Custom = () => null;
    expect(() => registerDirectiveRenderer("reference", Custom, "Not A Noun")).toThrow(
      /noun/,
    );
  });
});
