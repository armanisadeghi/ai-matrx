/**
 * `cooking_recipe_legacy_text` — the named parser strategy behind BOTH
 * cooking-recipe surfaces (kind_surface: xml_tag/cooking_recipe AND
 * fence_lang/cooking_recipe → cooking_recipe).
 *
 * WRAPS the one existing legacy parser — `parseRecipeMarkdown`, the exact
 * code RecipeArtifact renders raw recipe markdown through today. It NEVER
 * re-implements that grammar; it only maps the parser's `RecipeData` onto
 * the canonical cooking_recipe value, so both wire framings converge to the
 * SAME shape a `__kind` JSON arrival carries (THE KEYSTONE).
 *
 * Framing: accepts BOTH hosts' region text. The accumulator's XML region
 * includes the literal `<cooking_recipe>` tags (stripped here, attributes
 * tolerated — the parser's own tag-strip regex only knows the bare form);
 * a fence region is inner-only markdown and passes through untouched.
 * Identical inner text from either host → identical values → identical
 * envelopes (the fingerprint hashes the value).
 *
 * Fidelity: RecipeData fields map verbatim — including parser artifacts like
 * a trailing colon captured inside a bold action ("Prep:") — because
 * convergence must not change what the legacy path renders today. Fields the
 * parser leaves undefined (per-step `time`, `notes`) are OMITTED, keeping
 * the value strict-schema-clean.
 *
 * Loud failure: `null` when the region yields NO ingredient and NO step
 * (parseRecipeMarkdown "succeeds" on arbitrary prose by returning an empty
 * recipe made of defaults — an empty recipe is a parse failure here). The
 * caller treats null as parse failure: legacy rendering untouched, error
 * captured. Known mis-parse this catches: a region with no H3 title has its
 * first `#### Ingredients:` header swallowed AS the title (the parser's
 * title check is `startsWith("###")`, which `####` satisfies), dropping
 * every ingredient — with no steps either, that region declines to null
 * instead of converging to a broken value.
 */

import { parseRecipeMarkdown } from "@/components/mardown-display/blocks/cooking-recipes/parseRecipeMarkdown";
import { KIND_KEY } from "../core/kind-schema.types";

/** Opening tag with optional attributes — accumulator host framing. */
const OPENING_TAG_RE = /^\s*<cooking_recipe(?:\s[^>]*)?>/i;
const CLOSING_TAG = "</cooking_recipe>";

/**
 * Completed `cooking_recipe` region text (XML-tagged or fence-inner) →
 * canonical cooking_recipe value, or null when the region yields no real
 * recipe (the caller treats null as parse failure: loud, legacy rendering
 * untouched).
 */
export function cookingRecipeLegacyTextToKindValue(
  regionText: string,
): Record<string, unknown> | null {
  let inner = regionText.replace(OPENING_TAG_RE, "");
  const closeIdx = inner.indexOf(CLOSING_TAG);
  if (closeIdx !== -1) inner = inner.slice(0, closeIdx);

  const recipe = parseRecipeMarkdown(inner);
  if (!recipe) return null;
  if (recipe.ingredients.length === 0 && recipe.instructions.length === 0) {
    return null;
  }

  const value: Record<string, unknown> = {
    [KIND_KEY]: "cooking_recipe",
    title: recipe.title,
    yields: recipe.yields,
    totalTime: recipe.totalTime,
    prepTime: recipe.prepTime,
    cookTime: recipe.cookTime,
    ingredients: recipe.ingredients.map((ingredient) => ({
      [KIND_KEY]: "recipe_ingredient",
      amount: ingredient.amount,
      item: ingredient.item,
    })),
    instructions: recipe.instructions.map((step) => {
      const mapped: Record<string, unknown> = {
        [KIND_KEY]: "recipe_step",
        action: step.action,
        description: step.description,
      };
      if (typeof step.time === "string" && step.time !== "") {
        mapped.time = step.time;
      }
      return mapped;
    }),
  };

  if (typeof recipe.notes === "string" && recipe.notes !== "") {
    value.notes = recipe.notes;
  }

  return value;
}
