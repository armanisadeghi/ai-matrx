/**
 * THE PREFIX TIER, as THIS HOST wires it.
 *
 * The registry, the resolution order and the side-effect tier all live in
 * `@ai-matrx/content-ir-react` (0.11.0) and are proven by the package's own
 * tests. What is still this repo's to prove is what `features/matrx-envelope/
 * registry.tsx` REGISTERS into that registry — the app-specific renderers, and
 * the deliberate ABSENCE of a local side-effect registration now that the
 * package tier owns it.
 *
 * Arman's ruling that this rests on: the kind name IS a routing language, so a
 * predefined prefix auto-triggers a generic component when no custom one
 * exists and every enrolled noun "instantly has a view".
 */

import {
  getDirectiveRenderer,
  registerDirectiveRenderer,
} from "@ai-matrx/content-ir-react";

// Side-effect import: this is the module under test — its registrations run at
// import time, exactly as they do when MatrxEnvelopeBlock pulls it in.
import "@/features/matrx-envelope/registry";

function at(slug: string, directiveClass: string) {
  return { slug, directiveClass } as Parameters<typeof getDirectiveRenderer>[0];
}

describe("the host's directive registrations", () => {
  it("gives EVERY reference noun a live chip from one class registration", () => {
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

  it("registers NOTHING for the side-effect classes — the package tier owns them", () => {
    // THE C9 CLAIM, asserted rather than asserted-in-a-comment. `create` /
    // `update` / `delete` are drawn by the package's SideEffectDirectiveCard
    // inside DirectiveRender; a local registration here would be exactly the
    // duplicate implementation the extraction removed. `action` is absent from
    // this list only because this host DOES register bespoke `action` nouns
    // (plan_tree and friends) — never the class.
    for (const directiveClass of ["create", "update", "delete", "action"] as const) {
      expect(
        getDirectiveRenderer(
          at(`directive_v1_${directiveClass}_never_seen_before`, directiveClass),
        ),
      ).toBeNull();
    }
  });

  it("returns null for a class nothing claims — the package floor, not a crash", () => {
    // DirectiveRender turns this into DirectiveFallbackCard: named by class and
    // noun, with Apply when the class is a side effect and the host can apply.
    // Never null, never silent, never a dropped message block.
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
