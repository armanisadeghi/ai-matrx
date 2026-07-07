/**
 * cooking_recipe kind — bridge, surfaces, and canonical examples.
 *
 * Proves the three legs the migration (kind_cooking_recipe_full.sql) banks
 * on, using the REAL machinery end to end:
 *
 *   1. STRUCTURAL — the canonical examples pass `validateStructuralLeg`
 *      against the emitted_json_schema produced by the real converter
 *      (`kindSchemaToJsonSchema`, strict) — the exact validation semantics
 *      of activation (`validation_status='passed'` is earned, not asserted).
 *   2. RENDER — the legacy bridge derives serverData that is deep-equal to
 *      what the component's OWN parser (`parseRecipeMarkdown`) produces for
 *      the same recipe — RecipeArtifact trusts serverData verbatim, so
 *      parser-parity IS component acceptance.
 *   3. CONVERGENCE — the `cooking_recipe_legacy_text` strategy converts a
 *      REAL sample of today's wire format, in BOTH framings (XML-tagged
 *      region text and fence-inner body), to one identical, schema-passing
 *      canonical value. (Host-level fence finalize does not exist yet —
 *      XML-only today; the strategy is host-agnostic by construction.)
 */

import { parseRecipeMarkdown } from "@/components/mardown-display/blocks/cooking-recipes/parseRecipeMarkdown";
import { kindSchemaToJsonSchema } from "../convert/kind-to-json-schema";
import { kindSchemaToStorage } from "../registry/kind-storage-transform";
import {
  runKindDualGate,
  validateStructuralLeg,
} from "../registry/kind-dual-gate";
import { envelopeFromCompleteValue } from "../core/normalize";
import type { KindSchema } from "../core/kind-schema.types";
import {
  COOKING_RECIPE_EXAMPLE_FULL,
  COOKING_RECIPE_EXAMPLE_SIMPLE,
  COOKING_RECIPE_KIND,
  COOKING_RECIPE_KIND_DEFINITIONS,
  COOKING_RECIPE_SCHEMA,
  RECIPE_INGREDIENT_EXAMPLE,
  RECIPE_INGREDIENT_KIND,
  RECIPE_INGREDIENT_SCHEMA,
  RECIPE_STEP_EXAMPLE,
  RECIPE_STEP_KIND,
  RECIPE_STEP_SCHEMA,
  cookingRecipeMarkdownFromValue,
  cookingRecipeServerDataFromEnvelope,
} from "../kinds/cooking-recipe";
import { cookingRecipeLegacyTextToKindValue } from "../surfaces/cooking-recipe-legacy-text";

const SCHEMAS: Record<string, KindSchema> = {
  [COOKING_RECIPE_KIND]: COOKING_RECIPE_SCHEMA,
  [RECIPE_INGREDIENT_KIND]: RECIPE_INGREDIENT_SCHEMA,
  [RECIPE_STEP_KIND]: RECIPE_STEP_SCHEMA,
};
const resolve = (kind: string): KindSchema | undefined => SCHEMAS[kind];

function emittedJsonSchemaFor(kind: string): unknown {
  const exported = kindSchemaToJsonSchema(kind, resolve, {
    strict: true,
    injectKind: false,
  });
  expect(exported).not.toBeNull();
  expect(exported?.unresolved).toEqual([]);
  return exported?.schema;
}

// A REAL sample of today's wire format — the exact grammar the live
// `cooking-recipe` render-block skill teaches (H3 title, **Yields:**/**Time:**
// lines, H4 sections WITH the colon, "- amount item" bullets, "N. **Action:**
// description" steps, trailing notes line).
const WIRE_BODY = [
  "### Classic Banana Bread",
  "**Yields:** 1 loaf (Serves 8)",
  "**Time:** 1 hour 15 minutes (15 minutes prep, 60 minutes baking)",
  "",
  "#### Ingredients:",
  "- 3 ripe bananas, mashed",
  "- 1/3 cup melted butter",
  "- 3/4 cup sugar",
  "- 1 large egg, beaten",
  "- 1 tsp vanilla extract",
  "- 1 tsp baking soda",
  "- 1 1/2 cups all-purpose flour",
  "",
  "#### Instructions:",
  "1. **Prep:** Preheat the oven to 175 C and butter a 9x5 inch loaf pan.",
  "2. **Mix wet:** Stir the mashed bananas into the melted butter, then mix in the sugar, egg, and vanilla.",
  "3. **Combine:** Sprinkle the baking soda over the mixture, then fold in the flour until just combined.",
  "4. **Bake:** Pour into the pan and bake for 60 minutes, until a toothpick comes out clean.",
  "5. **Cool:** Cool in the pan for 10 minutes, then turn out onto a wire rack.",
  "",
  "A drizzle of honey while warm makes it extra good.",
].join("\n");

/** Accumulator host framing — region text includes the literal tags. */
const WIRE_XML = `<cooking_recipe>\n${WIRE_BODY}\n</cooking_recipe>`;

describe("cooking_recipe — structural leg (canonical examples vs converter-emitted schema)", () => {
  const rootSchema = emittedJsonSchemaFor(COOKING_RECIPE_KIND);

  it.each([
    ["simple", COOKING_RECIPE_EXAMPLE_SIMPLE],
    ["full", COOKING_RECIPE_EXAMPLE_FULL],
  ])("the %s example passes validateStructuralLeg", (_label, example) => {
    const result = validateStructuralLeg(example, rootSchema);
    expect(result.detail).toBeUndefined();
    expect(result.ok).toBe(true);
  });

  it("child-kind canonical examples pass their own emitted schemas", () => {
    expect(
      validateStructuralLeg(
        RECIPE_INGREDIENT_EXAMPLE,
        emittedJsonSchemaFor(RECIPE_INGREDIENT_KIND),
      ).ok,
    ).toBe(true);
    expect(
      validateStructuralLeg(
        RECIPE_STEP_EXAMPLE,
        emittedJsonSchemaFor(RECIPE_STEP_KIND),
      ).ok,
    ).toBe(true);
  });

  it("a recipe with no ingredients/instructions arrays fails the schema", () => {
    expect(
      validateStructuralLeg({ __kind: COOKING_RECIPE_KIND, title: "X" }, rootSchema)
        .ok,
    ).toBe(false);
  });

  it("storage transform externalizes exactly the two child edges", () => {
    const { edges } = kindSchemaToStorage(COOKING_RECIPE_SCHEMA);
    expect(edges).toEqual([
      {
        fieldPath: "ingredients",
        childKind: RECIPE_INGREDIENT_KIND,
        position: 0,
      },
      { fieldPath: "instructions", childKind: RECIPE_STEP_KIND, position: 0 },
    ]);
  });
});

describe("cooking_recipe — dual gate (activation-readiness)", () => {
  it("both examples clear structural + render legs with the real definition", () => {
    const definition = COOKING_RECIPE_KIND_DEFINITIONS[0];
    const emittedJsonSchema = emittedJsonSchemaFor(COOKING_RECIPE_KIND);

    for (const sample of [
      COOKING_RECIPE_EXAMPLE_SIMPLE,
      COOKING_RECIPE_EXAMPLE_FULL,
    ]) {
      const gate = runKindDualGate({
        kind: COOKING_RECIPE_KIND,
        sample,
        emittedJsonSchema,
        definition,
      });
      expect(gate.structural).toEqual({ ok: true });
      expect(gate.render.ok).toBe(true);
      expect(gate.isActive).toBe(true);
    }
  });
});

describe("cooking_recipe_legacy_text — both wire framings converge to one schema-passing value", () => {
  it("XML-tagged and fence-inner framings produce the identical value", () => {
    const fromXml = cookingRecipeLegacyTextToKindValue(WIRE_XML);
    const fromFence = cookingRecipeLegacyTextToKindValue(WIRE_BODY);
    expect(fromXml).not.toBeNull();
    expect(fromXml).toEqual(fromFence);
  });

  it("the converged value passes the emitted schema (strict)", () => {
    const value = cookingRecipeLegacyTextToKindValue(WIRE_XML);
    expect(value).not.toBeNull();
    if (!value) throw new Error("unreachable");
    const result = validateStructuralLeg(
      value,
      emittedJsonSchemaFor(COOKING_RECIPE_KIND),
    );
    expect(result.detail).toBeUndefined();
    expect(result.ok).toBe(true);
  });

  it("wraps the component's own parser verbatim (title/lists/notes)", () => {
    const value = cookingRecipeLegacyTextToKindValue(WIRE_XML);
    if (!value) throw new Error("unreachable");
    expect(value.title).toBe("Classic Banana Bread");
    expect(value.yields).toBe("1 loaf (Serves 8)");
    expect(value.totalTime).toBe("1 hour 15 minutes");
    expect(Array.isArray(value.ingredients) && value.ingredients.length).toBe(
      7,
    );
    expect(
      Array.isArray(value.instructions) && value.instructions.length,
    ).toBe(5);
    expect(value.notes).toBe(
      "A drizzle of honey while warm makes it extra good.",
    );
  });

  it("declines prose-only regions to null (loud fallback, legacy rendering untouched)", () => {
    expect(
      cookingRecipeLegacyTextToKindValue(
        "<cooking_recipe>\nJust prose. No recipe markers at all.\n</cooking_recipe>",
      ),
    ).toBeNull();
  });

  it("declines the title-less mis-parse (H4 header swallowed as title, ingredients dropped)", () => {
    // Real parser failure mode: no H3 title → the first #### line satisfies
    // startsWith("###") and becomes the title; the ingredients section never
    // opens, so everything is lost. The strategy must refuse, not converge.
    expect(
      cookingRecipeLegacyTextToKindValue(
        "#### Ingredients:\n- 2 cups flour\n- 1 tsp salt",
      ),
    ).toBeNull();
  });
});

describe("cooking_recipe bridge — serverData is exactly what the real component parser produces", () => {
  it("strategy value → bridge equals parseRecipeMarkdown over the same wire text", () => {
    const value = cookingRecipeLegacyTextToKindValue(WIRE_XML);
    expect(value).not.toBeNull();
    if (!value) throw new Error("unreachable");

    const serverData = cookingRecipeServerDataFromEnvelope(
      envelopeFromCompleteValue(value, COOKING_RECIPE_KIND),
    );
    expect(serverData).toBeDefined();

    // parseRecipeMarkdown strips the tags itself — same input, legacy path.
    const legacy = parseRecipeMarkdown(WIRE_XML);
    expect(legacy).not.toBeNull();

    // RecipeArtifact renders serverData verbatim (resolveMarkdownPayload
    // short-circuits on it), so deep equality with the legacy parse IS
    // "accepted by the real component parser".
    expect(serverData).toEqual(legacy);
  });

  it("fills the parser's own defaults for missing yields/times", () => {
    const serverData = cookingRecipeServerDataFromEnvelope(
      envelopeFromCompleteValue(
        {
          __kind: COOKING_RECIPE_KIND,
          title: "Buttered Toast",
          ingredients: [
            {
              __kind: RECIPE_INGREDIENT_KIND,
              amount: "2 slices",
              item: "bread",
            },
          ],
          instructions: [
            {
              __kind: RECIPE_STEP_KIND,
              action: "Toast",
              description: "Toast the bread until golden.",
            },
          ],
        },
        COOKING_RECIPE_KIND,
      ),
    );
    expect(serverData).toMatchObject({
      title: "Buttered Toast",
      yields: "Serves 4",
      totalTime: "30 minutes",
      prepTime: "15 minutes",
      cookTime: "15 minutes",
    });
  });

  it("declines an empty recipe (RecipeViewer would divide by zero)", () => {
    expect(
      cookingRecipeServerDataFromEnvelope(
        envelopeFromCompleteValue(
          {
            __kind: COOKING_RECIPE_KIND,
            title: "Nothing",
            ingredients: [],
            instructions: [],
          },
          COOKING_RECIPE_KIND,
        ),
      ),
    ).toBeUndefined();
  });

  it("never bridges a foreign or streaming envelope", () => {
    expect(
      cookingRecipeServerDataFromEnvelope(
        envelopeFromCompleteValue(
          { __kind: "flashcard_set", title: "X", cards: [] },
          "flashcard_set",
        ),
      ),
    ).toBeUndefined();
  });
});

describe("cooking_recipe toMarkdown — speaks the parser's own grammar (round-trip)", () => {
  it("simple example re-parses through parseRecipeMarkdown with full fidelity", () => {
    const markdown = cookingRecipeMarkdownFromValue(
      COOKING_RECIPE_EXAMPLE_SIMPLE,
    );
    const reparsed = parseRecipeMarkdown(markdown);
    expect(reparsed).not.toBeNull();
    if (!reparsed) throw new Error("unreachable");

    expect(reparsed.title).toBe("Quick Garlic Butter Pasta");
    expect(reparsed.yields).toBe("Serves 2");
    expect(reparsed.totalTime).toBe("20 minutes");
    expect(reparsed.prepTime).toContain("5 minutes");
    expect(reparsed.cookTime).toContain("15 minutes");

    // Amount/item re-tokenization may split differently ("4 cloves" vs "4"),
    // so compare the joined line — what the cook actually reads.
    const sourceIngredients = COOKING_RECIPE_EXAMPLE_SIMPLE.ingredients as Array<
      Record<string, string>
    >;
    expect(
      reparsed.ingredients.map((i) => `${i.amount} ${i.item}`.trim()),
    ).toEqual(
      sourceIngredients.map((i) => `${i.amount} ${i.item}`.trim()),
    );

    const sourceSteps = COOKING_RECIPE_EXAMPLE_SIMPLE.instructions as Array<
      Record<string, string>
    >;
    expect(reparsed.instructions.map((s) => s.action)).toEqual(
      sourceSteps.map((s) => s.action),
    );
    expect(reparsed.instructions.map((s) => s.description)).toEqual(
      sourceSteps.map((s) => s.description),
    );
    // Step times are DERIVED from description text by the parser — the two
    // authored times re-derive identically.
    expect(reparsed.instructions[0].time).toBe("9 minutes");
    expect(reparsed.instructions[1].time).toBe("1 minute");
  });

  it("full example round-trips notes and derived step times", () => {
    const markdown = cookingRecipeMarkdownFromValue(COOKING_RECIPE_EXAMPLE_FULL);
    const reparsed = parseRecipeMarkdown(markdown);
    expect(reparsed).not.toBeNull();
    if (!reparsed) throw new Error("unreachable");

    expect(reparsed.title).toBe("Classic Banana Bread");
    expect(reparsed.ingredients.length).toBe(8);
    expect(reparsed.instructions.length).toBe(5);
    expect(reparsed.notes).toBe(COOKING_RECIPE_EXAMPLE_FULL.notes);
    expect(reparsed.instructions[3].time).toBe("60 minutes");
  });
});
