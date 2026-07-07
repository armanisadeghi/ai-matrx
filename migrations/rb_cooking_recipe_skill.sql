-- rb_cooking_recipe_skill.sql
-- Render-block SKILL + content block for the `cooking_recipe` render block.
--
-- TRIGGER (confirmed against the live parser):
--   * Code fence:  ```cooking_recipe   (registered in SPECIAL_CODE_LANGUAGES)
--   * XML tag:     <cooking_recipe>…</cooking_recipe>  (registered in XML_TAG_BLOCKS)
--   Both fire. parseRecipeMarkdown strips the <cooking_recipe> tags and reads a
--   markdown sub-structure; the fence carries the same body without the tags.
--
-- STRUCTURE (from parseRecipeMarkdown.ts + validateRecipeStreaming in
-- content-splitter-v2.ts):
--   ### Title                         (H3, first heading)
--   **Yields:** <servings>
--   **Time:** <total> (<prep> prep, <cook> baking/cooking)
--   #### Ingredients:                 (H4)
--   - <amount> <item>
--   #### Instructions:                (H4)
--   1. **<Action>:** <description with optional inline time>
--   <free-text notes after the instructions>
--
--   Streaming release gate: content only renders once it has an `### ` title AND
--   at least one of `#### Ingredients` / `#### Instructions`.
--
-- Renderer: features/canvas/artifact-types/renderers/RecipeArtifact.tsx (canvasType
--   "recipe"; artifact-type-registry maps aliases ["recipe","cooking_recipe"],
--   materializable). Block is LIVE — not a dead block.
--
-- Legacy coexistence: none. No existing public.content_blocks row for recipe/cooking.
--
-- Idempotent. Schema-qualified. Do NOT apply directly (orchestrator applies centrally).

BEGIN;

-- ============================================================================
-- 1. SKILL  →  skill.definition
-- ============================================================================

INSERT INTO skill.definition (
    skill_id, label, description, skill_type, body, icon_name,
    platform_targets, semver, category_id,
    is_active, is_system, visibility, organization_id
)
SELECT
    'cooking-recipe',
    'Cooking Recipe',
    'Emit an interactive, structured cooking recipe (ingredients checklist, step-by-step instructions, serving scaler, timers) as a ```cooking_recipe code fence.',
    'render_block'::public.skl_skill_type,
    $BODY$# Cooking Recipe

You can render a full, interactive cooking recipe by emitting a `cooking_recipe`
block. It renders live as you stream — a title card with yield/time stats, a
checkable ingredients list with a serving scaler, and numbered step cards the cook
can tick off — and persists as an editable, shareable artifact. Reach for it any
time the user asks for a recipe, a dish, or "how to make" something to cook.

## How to emit a recipe

Write a `cooking_recipe` code fence whose body is plain markdown in the exact shape
below. (An equivalent `<cooking_recipe>…</cooking_recipe>` tag form also renders, but
the fence is preferred — it can't collide with surrounding prose.)

```cooking_recipe
### Classic Banana Bread
**Yields:** 1 loaf (Serves 8)
**Time:** 1 hour 15 minutes (15 minutes prep, 60 minutes baking)

#### Ingredients:
- 3 ripe bananas, mashed
- 1/3 cup melted butter
- 3/4 cup sugar
- 1 large egg, beaten
- 1 tsp vanilla extract
- 1 tsp baking soda
- 1 1/2 cups all-purpose flour

#### Instructions:
1. **Prep:** Preheat the oven to 175°C (350°F) and butter a 9x5 inch loaf pan.
2. **Mix wet:** Stir the mashed bananas into the melted butter, then mix in the sugar, egg, and vanilla.
3. **Combine:** Sprinkle the baking soda and salt over the mixture, then fold in the flour until just combined.
4. **Bake:** Pour into the pan and bake for 60 minutes, until a toothpick comes out clean.
5. **Cool:** Cool in the pan for 10 minutes, then turn out onto a wire rack.

A drizzle of honey while warm makes it extra good.
```

## The required structure

The parser reads specific markers. Emit them exactly:

1. **Title** — a single H3 (`### `) as the first heading. This is the recipe name.
2. **Metadata lines** (optional but recommended), each on its own line:
   - `**Yields:** <how much / how many servings>`
   - `**Time:** <total time> (<N minutes prep>, <N minutes baking/cooking>)` — the
     total is the text before the parenthesis; put prep and cook/baking times inside
     the parenthesis so the stat cards fill in.
3. **`#### Ingredients:`** — an H4 header (the word "Ingredient(s)" must appear),
   followed by a `- ` bullet list. Lead each bullet with the amount, then the item:
   `- 2 cups flour`. Amount-then-item lets the serving scaler multiply quantities.
4. **`#### Instructions:`** — an H4 header (the word "Instruction(s)" must appear),
   followed by a numbered list (`1.`, `2.`, …). Start each step with a bolded action
   label, then a colon and the detail: `3. **Bake:** Bake for 25 minutes.` Any
   duration you write in a step (e.g. "25 minutes", "1 hour") surfaces as a timer.
5. **Notes** (optional) — plain lines after the last instruction become recipe notes.

## Syntax rules that prevent render failures

These are the real breakage classes in the parser — follow them exactly:

1. TITLE MUST BE H3. The parser takes the first `### ` line as the title; a recipe
   with no `### ` heading loses its name and the streaming gate never releases it.
   - Wrong: `# Banana Bread` or `**Banana Bread**`
   - Right: `### Banana Bread`
2. SECTION HEADERS MUST BE H4 AND NAMED. The parser only switches into ingredient /
   instruction mode on an H4 whose text contains "ingredient" / "instruction".
   - Wrong: `### Ingredients` (H3) · `#### Shopping list` (word missing)
   - Right: `#### Ingredients:` · `#### Instructions:`
3. INGREDIENTS ARE `- ` BULLETS, AMOUNT FIRST. Lines that aren't `- ` bullets under
   the Ingredients header are ignored; put the quantity before the food.
   - Wrong: `* flour - 2 cups` · `Flour (2 cups)`
   - Right: `- 2 cups flour`
4. INSTRUCTIONS ARE A NUMBERED LIST. Steps must start with `N.` (`1.`, `2.`). Bullets
   under Instructions are dropped.
   - Wrong: `- Preheat the oven.`
   - Right: `1. **Preheat:** Heat the oven to 350°F.`
5. STEP ACTION LABEL IS BOLD, THEN A COLON. `**Action:** rest of the step`. Without
   it the renderer guesses a label from the first couple of words.
   - Wrong: `1. First preheat the oven and then mix everything.`
   - Right: `1. **Preheat:** Heat the oven to 350°F.`
6. ONE RECIPE PER BLOCK. Don't stack two recipes in one fence — the second title is
   ignored. Emit two separate `cooking_recipe` blocks.
7. NEVER wrap the fence inside `<artifact>` tags — the `cooking_recipe` block IS the
   artifact.

## Sizing

Best for a single dish: roughly 3–25 ingredients and 3–15 steps. For a full multi-
course menu, emit one `cooking_recipe` block per dish rather than one giant block.

## Editing an existing recipe

When asked to change a recipe, return ONE complete `cooking_recipe` block with the
full updated content — same fence type, all sections present (title, metadata,
ingredients, instructions). Don't send a diff or a partial block; the renderer
re-parses the whole block each time.

## Minimal correct example

```cooking_recipe
### Quick Garlic Butter Pasta
**Yields:** Serves 2
**Time:** 20 minutes (5 minutes prep, 15 minutes cooking)

#### Ingredients:
- 8 oz spaghetti
- 3 tbsp butter
- 4 cloves garlic, minced
- 1/4 cup grated parmesan
- 2 tbsp chopped parsley

#### Instructions:
1. **Boil:** Cook the spaghetti in salted water until al dente, about 9 minutes.
2. **Sizzle:** Melt the butter and cook the garlic until fragrant, about 1 minute.
3. **Toss:** Drain the pasta, toss with the garlic butter and parmesan, and finish with parsley.
```
$BODY$,
    'ChefHat',
    '["web"]'::jsonb,
    '1.0.0',
    '49c845cb-9314-485c-88ed-a7ace4f286ca',
    true, true, 'public', '39c38960-d30c-4840-b0c1-c9960de95582'
WHERE NOT EXISTS (
    SELECT 1 FROM skill.definition
    WHERE skill_id = 'cooking-recipe' AND created_by IS NULL
);

-- ============================================================================
-- 2. CONTENT BLOCK  →  public.content_blocks
-- ============================================================================

INSERT INTO public.content_blocks (
    block_id, label, description, template, icon_name,
    organization_id, category_id, metadata, version, is_active, sort_order
)
VALUES (
    'cooking-recipe-block',
    'Recipe',
    'Teaches the agent to emit an interactive cooking recipe as a ```cooking_recipe block.',
    $CB$When the user asks for a recipe or how to cook a dish, emit an interactive `cooking_recipe` block:

```cooking_recipe
### Quick Garlic Butter Pasta
**Yields:** Serves 2
**Time:** 20 minutes (5 minutes prep, 15 minutes cooking)

#### Ingredients:
- 8 oz spaghetti
- 3 tbsp butter
- 4 cloves garlic, minced

#### Instructions:
1. **Boil:** Cook the spaghetti until al dente, about 9 minutes.
2. **Toss:** Drain and toss with the garlic butter.
```

Rules: title is a single `### ` H3; section headers are `#### Ingredients:` / `#### Instructions:` (H4, named); ingredients are `- ` bullets with the amount first; instructions are a numbered list, each starting `N. **Action:** …`; one recipe per block; never wrap the fence in <artifact> tags.$CB$,
    'ChefHat',
    '39c38960-d30c-4840-b0c1-c9960de95582',
    '6913d9fc-b8c0-4107-af40-27d55c177694',
    '{}'::jsonb,
    1, true, 10
)
ON CONFLICT (block_id) DO UPDATE SET
    label          = EXCLUDED.label,
    description    = EXCLUDED.description,
    template       = EXCLUDED.template,
    icon_name      = EXCLUDED.icon_name,
    category_id    = EXCLUDED.category_id,
    metadata       = EXCLUDED.metadata,
    version        = EXCLUDED.version,
    is_active      = EXCLUDED.is_active,
    sort_order     = EXCLUDED.sort_order,
    updated_at     = now();

COMMIT;
