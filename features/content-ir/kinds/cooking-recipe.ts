/**
 * cooking_recipe kind → RecipeViewer bridge (+ recipe_ingredient /
 * recipe_step child kinds).
 *
 * Field names mirror the legacy component's own `RecipeData` contract
 * (components/mardown-display/blocks/cooking-recipes/parseRecipeMarkdown.ts,
 * consumed by cookingRecipeDisplay.tsx via RecipeArtifact) — the same
 * "kind mirrors the component it bridges to" precedent every legacy-bridge
 * kind follows (decision_node's estimatedTime, comparison_criterion's
 * higherIsBetter). The bridge derives the EXACT serverData
 * `resolveMarkdownPayload` trusts verbatim (`serverData != null` short-
 * circuits the raw parse), so a `__kind` JSON arrival lights up the REAL
 * RecipeViewer with zero component changes.
 *
 * Complete-only: RecipeArtifact's streaming path is the legacy raw-markdown
 * parse (gated by the splitter's release logic); the kind bridge follows the
 * makeCompleteEnvelopeBridge family (quiz, presentation, …) — partials show
 * the type's loading state, completes render bridged serverData.
 *
 * Defaults mirror parseRecipeMarkdown's own fallbacks (title "Recipe",
 * yields "Serves 4", …) because RecipeViewer renders every stat card
 * unconditionally — a missing time would paint an empty tile.
 *
 * NOT registered anywhere yet — the definitions below are ready-to-splice
 * for the central integration pass (system-kinds.ts is frozen to this
 * change; DB rows land via migrations/kind_cooking_recipe_full.sql with
 * is_active=false until integration).
 */

import type {
  Ingredient,
  RecipeData,
  RecipeStep,
} from "@/components/mardown-display/blocks/cooking-recipes/parseRecipeMarkdown";
import type { KindSchema } from "../core/kind-schema.types";
import type { KindDefinition } from "../registry/kind-registry.types";
import { isRecord, makeCompleteEnvelopeBridge } from "./legacy-bridge-utils";
import {
  additionalDetailsSection,
  collectExtras,
  isRecordValue,
  joinBlocks,
} from "./kind-markdown-utils";

export const COOKING_RECIPE_KIND = "cooking_recipe";
export const RECIPE_INGREDIENT_KIND = "recipe_ingredient";
export const RECIPE_STEP_KIND = "recipe_step";

// ---------------------------------------------------------------------------
// Schemas — the authoring source the converters
// (convert/kind-to-json-schema.ts + registry/kind-storage-transform.ts)
// materialize into content_ir.kind_definition data[] / emitted_*_schema.
// ---------------------------------------------------------------------------

export const RECIPE_INGREDIENT_SCHEMA: KindSchema = {
  kind: RECIPE_INGREDIENT_KIND,
  fields: {
    // Quantity FIRST-class (never fused into item) — it is what the serving
    // scaler multiplies. Free-form ("2 cups", "1/4 tsp", ""); empty string
    // for unmeasured items ("salt to taste" rides in item, amount "").
    amount: { type: "string", required: true },
    item: { type: "string", required: true },
  },
};

export const RECIPE_STEP_SCHEMA: KindSchema = {
  kind: RECIPE_STEP_KIND,
  fields: {
    /** Short imperative headline ("Boil", "Mix wet") — the step card title. */
    action: { type: "string", required: true },
    /** The full step text — the card body. */
    description: { type: "string", required: true },
    /** Duration surfaced as the step timer ("9 minutes"). Optional. */
    time: { type: "string" },
  },
};

export const COOKING_RECIPE_SCHEMA: KindSchema = {
  kind: COOKING_RECIPE_KIND,
  fields: {
    title: { type: "string", required: true },
    yields: { type: "string" },
    totalTime: { type: "string" },
    prepTime: { type: "string" },
    cookTime: { type: "string" },
    ingredients: {
      type: "array",
      itemKinds: [RECIPE_INGREDIENT_KIND],
      required: true,
    },
    instructions: {
      type: "array",
      itemKinds: [RECIPE_STEP_KIND],
      required: true,
    },
    notes: { type: "string" },
    additionalDetails: { type: "inline_object", open: true, fields: {} },
  },
};

// ---------------------------------------------------------------------------
// Legacy bridge — canonical envelope → RecipeData serverData.
// ---------------------------------------------------------------------------

/** parseRecipeMarkdown's own fallback values, verbatim. */
const RECIPE_DEFAULTS = {
  title: "Recipe",
  yields: "Serves 4",
  totalTime: "30 minutes",
  prepTime: "15 minutes",
  cookTime: "15 minutes",
} as const;

const ROOT_KNOWN_KEYS = [
  "title",
  "yields",
  "totalTime",
  "prepTime",
  "cookTime",
  "ingredients",
  "instructions",
  "notes",
];

function asNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

function toIngredient(raw: unknown): Ingredient | null {
  if (!isRecord(raw)) return null;
  const item = asNonEmptyString(raw.item);
  if (!item) return null;
  return {
    amount: typeof raw.amount === "string" ? raw.amount : "",
    item,
  };
}

function toStep(raw: unknown): RecipeStep | null {
  if (!isRecord(raw)) return null;
  const description = asNonEmptyString(raw.description);
  if (!description) return null;
  // Action fallback = the parser's own guess (first two words of the step).
  const action =
    asNonEmptyString(raw.action) ??
    description.split(" ").slice(0, 2).join(" ");
  const step: RecipeStep = { action, description };
  const time = asNonEmptyString(raw.time);
  if (time) step.time = time;
  return step;
}

function nonNull<T>(value: T | null): value is T {
  return value !== null;
}

export const cookingRecipeServerDataFromEnvelope = makeCompleteEnvelopeBridge(
  COOKING_RECIPE_KIND,
  (value) => {
    const ingredients = Array.isArray(value.ingredients)
      ? value.ingredients.map(toIngredient).filter(nonNull)
      : [];
    const instructions = Array.isArray(value.instructions)
      ? value.instructions.map(toStep).filter(nonNull)
      : [];

    // Decline an empty recipe: RecipeViewer divides by the combined list
    // length (NaN progress) — the raw-content fallback path takes over.
    if (ingredients.length === 0 && instructions.length === 0) {
      return undefined;
    }

    const serverData: RecipeData & Record<string, unknown> = {
      title: asNonEmptyString(value.title) ?? RECIPE_DEFAULTS.title,
      yields: asNonEmptyString(value.yields) ?? RECIPE_DEFAULTS.yields,
      totalTime:
        asNonEmptyString(value.totalTime) ?? RECIPE_DEFAULTS.totalTime,
      prepTime: asNonEmptyString(value.prepTime) ?? RECIPE_DEFAULTS.prepTime,
      cookTime: asNonEmptyString(value.cookTime) ?? RECIPE_DEFAULTS.cookTime,
      ingredients,
      instructions,
    };

    const notes = asNonEmptyString(value.notes);
    if (notes) serverData.notes = notes;

    // Zero data loss: unknown root keys ride through (RecipeViewer ignores
    // them; the markdown facet surfaces them under "Additional details").
    for (const [key, child] of Object.entries(value)) {
      if (ROOT_KNOWN_KEYS.includes(key)) continue;
      serverData[key] = child;
    }

    return serverData;
  },
);

// ---------------------------------------------------------------------------
// toMarkdown facet — cooking_recipe → the legacy wire grammar itself.
//
// Deliberately speaks parseRecipeMarkdown's OWN markdown dialect (H3 title,
// **Yields:** / **Time:** lines, H4 "#### Ingredients:" / "#### Instructions:"
// with the colon, "- amount item" bullets, "N. **Action**: description"
// steps) so an exported recipe re-parses through the existing parser —
// artifact ⇄ markdown round-trips with zero new grammar. Extras (unknown
// keys + additionalDetails) append under a final H4 section per the
// zero-loss law; on re-parse those bullets fold into notes (documented
// asymmetry — extras are for human reading, not the round-trip).
// ---------------------------------------------------------------------------

const INGREDIENT_KNOWN_KEYS = ["amount", "item"];
const STEP_KNOWN_KEYS = ["action", "description", "time"];

/** "15 minutes prep" / "60 minutes baking" → "15 minutes" / "60 minutes". */
function stripTimeRole(time: string): string {
  return time.replace(/\s*(?:prep(?:aration)?|cooking|baking|cook)\s*$/i, "");
}

function timeLine(value: Record<string, unknown>): string | null {
  const total = asNonEmptyString(value.totalTime);
  if (!total) return null;
  const prep = asNonEmptyString(value.prepTime);
  const cook = asNonEmptyString(value.cookTime);
  if (!prep && !cook) return `**Time:** ${total}`;
  const parts: string[] = [];
  if (prep) parts.push(`${stripTimeRole(prep)} prep`);
  if (cook) parts.push(`${stripTimeRole(cook)} cooking`);
  return `**Time:** ${total} (${parts.join(", ")})`;
}

function ingredientLine(ingredient: Record<string, unknown>): string {
  const amount = asNonEmptyString(ingredient.amount);
  const item = typeof ingredient.item === "string" ? ingredient.item : "";
  return amount ? `- ${amount} ${item}` : `- ${item}`;
}

function stepLine(step: Record<string, unknown>, index: number): string {
  const action = typeof step.action === "string" ? step.action : "";
  const description =
    typeof step.description === "string" ? step.description : "";
  // Colon OUTSIDE the bold: the parser's action regex (`^\*\*([^*]+)\*\*:?`)
  // then captures the action WITHOUT a trailing colon — round-trip-exact for
  // both "Boil" and legacy "Boil:" actions.
  let line = `${index + 1}. **${action}**: ${description}`;
  const time = asNonEmptyString(step.time);
  // The parser derives step time FROM the description text; only append a
  // separately-authored time the description doesn't already carry.
  if (time && !description.includes(time)) line += ` (${time})`;
  return line;
}

export function cookingRecipeMarkdownFromValue(
  value: Record<string, unknown>,
): string {
  const title = asNonEmptyString(value.title) ?? RECIPE_DEFAULTS.title;

  const ingredients = Array.isArray(value.ingredients)
    ? value.ingredients.filter(isRecordValue)
    : [];
  const instructions = Array.isArray(value.instructions)
    ? value.instructions.filter(isRecordValue)
    : [];

  const yields = asNonEmptyString(value.yields);

  // Item-level extras surface inline so nothing vanishes.
  const itemExtras: Record<string, unknown> = {};
  ingredients.forEach((ingredient, i) => {
    const extras = collectExtras(ingredient, INGREDIENT_KNOWN_KEYS);
    for (const [key, child] of Object.entries(extras)) {
      itemExtras[`ingredient ${i + 1} ${key}`] = child;
    }
  });
  instructions.forEach((step, i) => {
    const extras = collectExtras(step, STEP_KNOWN_KEYS);
    for (const [key, child] of Object.entries(extras)) {
      itemExtras[`step ${i + 1} ${key}`] = child;
    }
  });

  return joinBlocks([
    `### ${title}`,
    yields ? `**Yields:** ${yields}` : null,
    timeLine(value),
    ingredients.length > 0
      ? `#### Ingredients:\n${ingredients.map(ingredientLine).join("\n")}`
      : null,
    instructions.length > 0
      ? `#### Instructions:\n${instructions.map(stepLine).join("\n")}`
      : null,
    asNonEmptyString(value.notes),
    additionalDetailsSection(
      { ...collectExtras(value, ROOT_KNOWN_KEYS), ...itemExtras },
      "####",
    ),
  ]);
}

// ---------------------------------------------------------------------------
// KindDefinitions — ready to splice into the registry at integration time.
// ---------------------------------------------------------------------------

export const COOKING_RECIPE_KIND_DEFINITIONS: KindDefinition[] = [
  {
    kind: COOKING_RECIPE_KIND,
    schemaSource: "system",
    tier: "eager",
    legacyBlockType: "cooking_recipe",
    toLegacyServerData: cookingRecipeServerDataFromEnvelope,
    toMarkdown: cookingRecipeMarkdownFromValue,
    artifact: { canvasType: "recipe" },
    persistence: { persistStructured: true },
    schema: COOKING_RECIPE_SCHEMA,
  },
  {
    kind: RECIPE_INGREDIENT_KIND,
    schemaSource: "system",
    tier: "eager",
    schema: RECIPE_INGREDIENT_SCHEMA,
  },
  {
    kind: RECIPE_STEP_KIND,
    schemaSource: "system",
    tier: "eager",
    schema: RECIPE_STEP_SCHEMA,
  },
];

// ---------------------------------------------------------------------------
// Canonical examples — single source of truth for kind_example rows AND the
// test suite (the migration embeds converter/validator output computed from
// these exact objects; drift between SQL and tests is structurally
// impossible). Block form: they carry __kind, matching the flashcard_set
// canonical-example convention; the structural gate strips it before ajv.
// ---------------------------------------------------------------------------

export const COOKING_RECIPE_EXAMPLE_SIMPLE: Record<string, unknown> = {
  __kind: COOKING_RECIPE_KIND,
  title: "Quick Garlic Butter Pasta",
  yields: "Serves 2",
  totalTime: "20 minutes",
  prepTime: "5 minutes",
  cookTime: "15 minutes",
  ingredients: [
    { __kind: RECIPE_INGREDIENT_KIND, amount: "8 oz", item: "spaghetti" },
    { __kind: RECIPE_INGREDIENT_KIND, amount: "3 tbsp", item: "butter" },
    {
      __kind: RECIPE_INGREDIENT_KIND,
      amount: "4",
      item: "cloves garlic, minced",
    },
    {
      __kind: RECIPE_INGREDIENT_KIND,
      amount: "1/4 cup",
      item: "grated parmesan",
    },
  ],
  instructions: [
    {
      __kind: RECIPE_STEP_KIND,
      action: "Boil",
      description:
        "Cook the spaghetti in salted water until al dente, about 9 minutes.",
      time: "9 minutes",
    },
    {
      __kind: RECIPE_STEP_KIND,
      action: "Sizzle",
      description:
        "Melt the butter and cook the garlic until fragrant, about 1 minute.",
      time: "1 minute",
    },
    {
      __kind: RECIPE_STEP_KIND,
      action: "Toss",
      description:
        "Drain the pasta and toss with the garlic butter and parmesan.",
    },
  ],
};

export const COOKING_RECIPE_EXAMPLE_FULL: Record<string, unknown> = {
  __kind: COOKING_RECIPE_KIND,
  title: "Classic Banana Bread",
  yields: "1 loaf (serves 8)",
  totalTime: "1 hour 15 minutes",
  prepTime: "15 minutes",
  cookTime: "60 minutes",
  ingredients: [
    {
      __kind: RECIPE_INGREDIENT_KIND,
      amount: "3",
      item: "ripe bananas, mashed",
    },
    {
      __kind: RECIPE_INGREDIENT_KIND,
      amount: "1/3 cup",
      item: "melted butter",
    },
    { __kind: RECIPE_INGREDIENT_KIND, amount: "3/4 cup", item: "sugar" },
    {
      __kind: RECIPE_INGREDIENT_KIND,
      amount: "1",
      item: "large egg, beaten",
    },
    {
      __kind: RECIPE_INGREDIENT_KIND,
      amount: "1 tsp",
      item: "vanilla extract",
    },
    { __kind: RECIPE_INGREDIENT_KIND, amount: "1 tsp", item: "baking soda" },
    { __kind: RECIPE_INGREDIENT_KIND, amount: "", item: "pinch of salt" },
    {
      __kind: RECIPE_INGREDIENT_KIND,
      amount: "1 1/2 cups",
      item: "all-purpose flour",
    },
  ],
  instructions: [
    {
      __kind: RECIPE_STEP_KIND,
      action: "Prep",
      description:
        "Preheat the oven to 175 C (350 F) and butter a 9x5 inch loaf pan.",
    },
    {
      __kind: RECIPE_STEP_KIND,
      action: "Mix wet",
      description:
        "Stir the mashed bananas into the melted butter, then mix in the sugar, egg, and vanilla.",
    },
    {
      __kind: RECIPE_STEP_KIND,
      action: "Combine",
      description:
        "Sprinkle the baking soda and salt over the mixture, then fold in the flour until just combined.",
    },
    {
      __kind: RECIPE_STEP_KIND,
      action: "Bake",
      description:
        "Pour into the pan and bake for 60 minutes, until a toothpick comes out clean.",
      time: "60 minutes",
    },
    {
      __kind: RECIPE_STEP_KIND,
      action: "Cool",
      description:
        "Cool in the pan for 10 minutes, then turn out onto a wire rack.",
      time: "10 minutes",
    },
  ],
  notes:
    "A drizzle of honey while warm makes it extra good. Overripe, heavily spotted bananas give the deepest flavor.",
};

export const RECIPE_INGREDIENT_EXAMPLE: Record<string, unknown> = {
  __kind: RECIPE_INGREDIENT_KIND,
  amount: "2 cups",
  item: "all-purpose flour",
};

export const RECIPE_STEP_EXAMPLE: Record<string, unknown> = {
  __kind: RECIPE_STEP_KIND,
  action: "Bake",
  description: "Bake for 25 minutes until golden brown on top.",
  time: "25 minutes",
};
