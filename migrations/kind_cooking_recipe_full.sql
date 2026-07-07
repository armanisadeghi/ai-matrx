-- kind_cooking_recipe_full.sql
-- Shape System: the cooking_recipe kind (+ recipe_ingredient / recipe_step
-- children) engineered from the existing cooking-recipe renderable.
--
-- SOURCE OF TRUTH: features/content-ir/kinds/cooking-recipe.ts. Every jsonb
-- payload below (data[], emitted_block_schema, emitted_json_schema,
-- emitted_fingerprint, example data) was MACHINE-EMITTED from that module by
-- the real converters — kindSchemaToStorage (registry/kind-storage-transform.ts)
-- and kindSchemaToJsonSchema (convert/kind-to-json-schema.ts, strict; __kind
-- injected for the block schema, plain for the json schema) with
-- fingerprintText over the block schema — never hand-written.
--
-- VALIDATION: every kind_example row below passed Draft 2020-12 validation
-- (ajv via registry/kind-dual-gate.ts#validateStructuralLeg — the exact
-- activation semantics) AND the full dual gate (structural + render legs,
-- render leg through the real cookingRecipeServerDataFromEnvelope bridge)
-- BEFORE validation_status='passed' was written here. Proof lives in
-- features/content-ir/__tests__/kind-cooking-recipe.test.ts (green).
--
-- HELD INACTIVE BY DESIGN: kind_definition.is_active=false AND both
-- kind_surface rows is_active=false until the central integration pass
-- splices the definitions into system-kinds.ts and the
-- 'cooking_recipe_legacy_text' strategy into xml-finalize.ts'
-- SURFACE_PARSER_STRATEGIES — the warm surface registry loads is_active=true
-- rows, and an active row naming an unimplemented strategy screams
-- (console.error) on every completed recipe region. Flip both together.
--
-- Legacy coexistence: the live wave-2 'cooking-recipe' skill (markdown fence
-- syntax) and its 'cooking-recipe-block' content block are UNTOUCHED — this
-- adds the JSON-kind counterparts (skill 'kind_cooking_recipe', blocks
-- 'kind-cooking-recipe-simple'/'kind-cooking-recipe-full') per R9
-- coexist-not-clobber.
--
-- Idempotent: INSERT ... WHERE NOT EXISTS on business keys; drift-refresh
-- UPDATEs never touch is_active (a later activation survives re-apply).

BEGIN;

-- ============================================================================
-- 1. kind_definition — cooking_recipe + recipe_ingredient + recipe_step
-- ============================================================================

insert into content_ir.kind_definition
  (kind, label, authoring_owner, data, emitted_block_schema, emitted_json_schema, emitted_fingerprint, is_active, visibility, organization_id, metadata)
select 'cooking_recipe', 'Cooking Recipe', 'ts',
  $mtx$[{"name":"title","required":true,"type":"string"},{"name":"yields","type":"string"},{"name":"totalTime","type":"string"},{"name":"prepTime","type":"string"},{"name":"cookTime","type":"string"},{"name":"ingredients","required":true,"type":"array"},{"name":"instructions","required":true,"type":"array"},{"name":"notes","type":"string"},{"name":"additionalDetails","type":"inline_object","fields":[]}]$mtx$::jsonb,
  $mtx${"type":"object","properties":{"title":{"type":"string"},"yields":{"type":"string"},"totalTime":{"type":"string"},"prepTime":{"type":"string"},"cookTime":{"type":"string"},"ingredients":{"type":"array","items":{"$ref":"#/$defs/recipe_ingredient"}},"instructions":{"type":"array","items":{"$ref":"#/$defs/recipe_step"}},"notes":{"type":"string"},"additionalDetails":{"type":"object","properties":{},"required":[],"additionalProperties":false},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"cooking_recipe"}},"required":["__kind","title","ingredients","instructions"],"additionalProperties":false,"$defs":{"recipe_ingredient":{"type":"object","properties":{"amount":{"type":"string"},"item":{"type":"string"},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"recipe_ingredient"}},"required":["__kind","amount","item"],"additionalProperties":false},"recipe_step":{"type":"object","properties":{"action":{"type":"string"},"description":{"type":"string"},"time":{"type":"string"},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"recipe_step"}},"required":["__kind","action","description"],"additionalProperties":false}}}$mtx$::jsonb,
  $mtx${"type":"object","properties":{"title":{"type":"string"},"yields":{"type":"string"},"totalTime":{"type":"string"},"prepTime":{"type":"string"},"cookTime":{"type":"string"},"ingredients":{"type":"array","items":{"$ref":"#/$defs/recipe_ingredient"}},"instructions":{"type":"array","items":{"$ref":"#/$defs/recipe_step"}},"notes":{"type":"string"},"additionalDetails":{"type":"object","properties":{},"required":[],"additionalProperties":false}},"required":["title","ingredients","instructions"],"additionalProperties":false,"$defs":{"recipe_ingredient":{"type":"object","properties":{"amount":{"type":"string"},"item":{"type":"string"}},"required":["amount","item"],"additionalProperties":false},"recipe_step":{"type":"object","properties":{"action":{"type":"string"},"description":{"type":"string"},"time":{"type":"string"}},"required":["action","description"],"additionalProperties":false}}}$mtx$::jsonb,
  'yl-ejo9851bj1byb',
  false, 'public', '39c38960-d30c-4840-b0c1-c9960de95582',
  '{"family":"render_block","legacy_block_type":"cooking_recipe","artifact_canvas_type":"recipe"}'::jsonb
where not exists (
  select 1 from content_ir.kind_definition
  where organization_id='39c38960-d30c-4840-b0c1-c9960de95582' and kind='cooking_recipe' and deleted_at is null
);

insert into content_ir.kind_definition
  (kind, label, authoring_owner, data, emitted_block_schema, emitted_json_schema, emitted_fingerprint, is_active, visibility, organization_id, metadata)
select 'recipe_ingredient', 'Recipe Ingredient', 'ts',
  $mtx$[{"name":"amount","required":true,"type":"string"},{"name":"item","required":true,"type":"string"}]$mtx$::jsonb,
  $mtx${"type":"object","properties":{"amount":{"type":"string"},"item":{"type":"string"},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"recipe_ingredient"}},"required":["__kind","amount","item"],"additionalProperties":false}$mtx$::jsonb,
  $mtx${"type":"object","properties":{"amount":{"type":"string"},"item":{"type":"string"}},"required":["amount","item"],"additionalProperties":false}$mtx$::jsonb,
  '7b-70nx8t1mzwapb',
  false, 'public', '39c38960-d30c-4840-b0c1-c9960de95582',
  '{"family":"render_block","parent":"cooking_recipe"}'::jsonb
where not exists (
  select 1 from content_ir.kind_definition
  where organization_id='39c38960-d30c-4840-b0c1-c9960de95582' and kind='recipe_ingredient' and deleted_at is null
);

insert into content_ir.kind_definition
  (kind, label, authoring_owner, data, emitted_block_schema, emitted_json_schema, emitted_fingerprint, is_active, visibility, organization_id, metadata)
select 'recipe_step', 'Recipe Step', 'ts',
  $mtx$[{"name":"action","required":true,"type":"string"},{"name":"description","required":true,"type":"string"},{"name":"time","type":"string"}]$mtx$::jsonb,
  $mtx${"type":"object","properties":{"action":{"type":"string"},"description":{"type":"string"},"time":{"type":"string"},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"recipe_step"}},"required":["__kind","action","description"],"additionalProperties":false}$mtx$::jsonb,
  $mtx${"type":"object","properties":{"action":{"type":"string"},"description":{"type":"string"},"time":{"type":"string"}},"required":["action","description"],"additionalProperties":false}$mtx$::jsonb,
  '88-19lfjtu1viy7y8',
  false, 'public', '39c38960-d30c-4840-b0c1-c9960de95582',
  '{"family":"render_block","parent":"cooking_recipe"}'::jsonb
where not exists (
  select 1 from content_ir.kind_definition
  where organization_id='39c38960-d30c-4840-b0c1-c9960de95582' and kind='recipe_step' and deleted_at is null
);

-- Drift refresh on re-apply: schemas/data may be re-emitted; NEVER is_active.
update content_ir.kind_definition set
  label = 'Cooking Recipe',
  data = $mtx$[{"name":"title","required":true,"type":"string"},{"name":"yields","type":"string"},{"name":"totalTime","type":"string"},{"name":"prepTime","type":"string"},{"name":"cookTime","type":"string"},{"name":"ingredients","required":true,"type":"array"},{"name":"instructions","required":true,"type":"array"},{"name":"notes","type":"string"},{"name":"additionalDetails","type":"inline_object","fields":[]}]$mtx$::jsonb,
  emitted_block_schema = $mtx${"type":"object","properties":{"title":{"type":"string"},"yields":{"type":"string"},"totalTime":{"type":"string"},"prepTime":{"type":"string"},"cookTime":{"type":"string"},"ingredients":{"type":"array","items":{"$ref":"#/$defs/recipe_ingredient"}},"instructions":{"type":"array","items":{"$ref":"#/$defs/recipe_step"}},"notes":{"type":"string"},"additionalDetails":{"type":"object","properties":{},"required":[],"additionalProperties":false},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"cooking_recipe"}},"required":["__kind","title","ingredients","instructions"],"additionalProperties":false,"$defs":{"recipe_ingredient":{"type":"object","properties":{"amount":{"type":"string"},"item":{"type":"string"},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"recipe_ingredient"}},"required":["__kind","amount","item"],"additionalProperties":false},"recipe_step":{"type":"object","properties":{"action":{"type":"string"},"description":{"type":"string"},"time":{"type":"string"},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"recipe_step"}},"required":["__kind","action","description"],"additionalProperties":false}}}$mtx$::jsonb,
  emitted_json_schema = $mtx${"type":"object","properties":{"title":{"type":"string"},"yields":{"type":"string"},"totalTime":{"type":"string"},"prepTime":{"type":"string"},"cookTime":{"type":"string"},"ingredients":{"type":"array","items":{"$ref":"#/$defs/recipe_ingredient"}},"instructions":{"type":"array","items":{"$ref":"#/$defs/recipe_step"}},"notes":{"type":"string"},"additionalDetails":{"type":"object","properties":{},"required":[],"additionalProperties":false}},"required":["title","ingredients","instructions"],"additionalProperties":false,"$defs":{"recipe_ingredient":{"type":"object","properties":{"amount":{"type":"string"},"item":{"type":"string"}},"required":["amount","item"],"additionalProperties":false},"recipe_step":{"type":"object","properties":{"action":{"type":"string"},"description":{"type":"string"},"time":{"type":"string"}},"required":["action","description"],"additionalProperties":false}}}$mtx$::jsonb,
  emitted_fingerprint = 'yl-ejo9851bj1byb',
  updated_at = now()
where organization_id='39c38960-d30c-4840-b0c1-c9960de95582' and kind='cooking_recipe' and deleted_at is null
  and emitted_fingerprint is distinct from 'yl-ejo9851bj1byb';

update content_ir.kind_definition set
  label = 'Recipe Ingredient',
  data = $mtx$[{"name":"amount","required":true,"type":"string"},{"name":"item","required":true,"type":"string"}]$mtx$::jsonb,
  emitted_block_schema = $mtx${"type":"object","properties":{"amount":{"type":"string"},"item":{"type":"string"},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"recipe_ingredient"}},"required":["__kind","amount","item"],"additionalProperties":false}$mtx$::jsonb,
  emitted_json_schema = $mtx${"type":"object","properties":{"amount":{"type":"string"},"item":{"type":"string"}},"required":["amount","item"],"additionalProperties":false}$mtx$::jsonb,
  emitted_fingerprint = '7b-70nx8t1mzwapb',
  updated_at = now()
where organization_id='39c38960-d30c-4840-b0c1-c9960de95582' and kind='recipe_ingredient' and deleted_at is null
  and emitted_fingerprint is distinct from '7b-70nx8t1mzwapb';

update content_ir.kind_definition set
  label = 'Recipe Step',
  data = $mtx$[{"name":"action","required":true,"type":"string"},{"name":"description","required":true,"type":"string"},{"name":"time","type":"string"}]$mtx$::jsonb,
  emitted_block_schema = $mtx${"type":"object","properties":{"action":{"type":"string"},"description":{"type":"string"},"time":{"type":"string"},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"recipe_step"}},"required":["__kind","action","description"],"additionalProperties":false}$mtx$::jsonb,
  emitted_json_schema = $mtx${"type":"object","properties":{"action":{"type":"string"},"description":{"type":"string"},"time":{"type":"string"}},"required":["action","description"],"additionalProperties":false}$mtx$::jsonb,
  emitted_fingerprint = '88-19lfjtu1viy7y8',
  updated_at = now()
where organization_id='39c38960-d30c-4840-b0c1-c9960de95582' and kind='recipe_step' and deleted_at is null
  and emitted_fingerprint is distinct from '88-19lfjtu1viy7y8';

-- ============================================================================
-- 2. kind_edge — cooking_recipe.ingredients → recipe_ingredient (position 0)
--                cooking_recipe.instructions → recipe_step (position 0)
--    (exactly the kindSchemaToStorage edge specs; field_name = field PATH)
-- ============================================================================

insert into content_ir.kind_edge (parent_definition_id, field_name, child_definition_id, position, organization_id)
select p.id, 'ingredients', c.id, 0, '39c38960-d30c-4840-b0c1-c9960de95582'
from content_ir.kind_definition p, content_ir.kind_definition c
where p.organization_id='39c38960-d30c-4840-b0c1-c9960de95582' and p.kind='cooking_recipe' and p.deleted_at is null
  and c.organization_id='39c38960-d30c-4840-b0c1-c9960de95582' and c.kind='recipe_ingredient' and c.deleted_at is null
  and not exists (
    select 1 from content_ir.kind_edge e
    where e.parent_definition_id=p.id and e.field_name='ingredients' and e.child_definition_id=c.id and e.deleted_at is null
  );

insert into content_ir.kind_edge (parent_definition_id, field_name, child_definition_id, position, organization_id)
select p.id, 'instructions', c.id, 0, '39c38960-d30c-4840-b0c1-c9960de95582'
from content_ir.kind_definition p, content_ir.kind_definition c
where p.organization_id='39c38960-d30c-4840-b0c1-c9960de95582' and p.kind='cooking_recipe' and p.deleted_at is null
  and c.organization_id='39c38960-d30c-4840-b0c1-c9960de95582' and c.kind='recipe_step' and c.deleted_at is null
  and not exists (
    select 1 from content_ir.kind_edge e
    where e.parent_definition_id=p.id and e.field_name='instructions' and e.child_definition_id=c.id and e.deleted_at is null
  );

-- ============================================================================
-- 3. kind_example — 2 root examples (first canonical) + 1 per child kind.
--    Block form (carry __kind), matching the flashcard_set convention.
-- ============================================================================

insert into content_ir.kind_example
  (kind_definition_id, kind_version, data, label, description, source, is_canonical, validation_status, validated_at, organization_id)
select kd.id, kd.version,
  $mtx${"__kind":"cooking_recipe","title":"Quick Garlic Butter Pasta","yields":"Serves 2","totalTime":"20 minutes","prepTime":"5 minutes","cookTime":"15 minutes","ingredients":[{"__kind":"recipe_ingredient","amount":"8 oz","item":"spaghetti"},{"__kind":"recipe_ingredient","amount":"3 tbsp","item":"butter"},{"__kind":"recipe_ingredient","amount":"4","item":"cloves garlic, minced"},{"__kind":"recipe_ingredient","amount":"1/4 cup","item":"grated parmesan"}],"instructions":[{"__kind":"recipe_step","action":"Boil","description":"Cook the spaghetti in salted water until al dente, about 9 minutes.","time":"9 minutes"},{"__kind":"recipe_step","action":"Sizzle","description":"Melt the butter and cook the garlic until fragrant, about 1 minute.","time":"1 minute"},{"__kind":"recipe_step","action":"Toss","description":"Drain the pasta and toss with the garlic butter and parmesan."}]}$mtx$::jsonb,
  'Quick garlic butter pasta (canonical)',
  'Minimal correct recipe: title, yields, three times, 4 ingredients, 3 steps (2 with explicit step timers).',
  'authored', true, 'passed', now(), '39c38960-d30c-4840-b0c1-c9960de95582'
from content_ir.kind_definition kd
where kd.organization_id='39c38960-d30c-4840-b0c1-c9960de95582' and kd.kind='cooking_recipe' and kd.deleted_at is null
  and not exists (
    select 1 from content_ir.kind_example e
    where e.kind_definition_id=kd.id and e.label='Quick garlic butter pasta (canonical)' and e.deleted_at is null
  );

insert into content_ir.kind_example
  (kind_definition_id, kind_version, data, label, description, source, is_canonical, validation_status, validated_at, organization_id)
select kd.id, kd.version,
  $mtx${"__kind":"cooking_recipe","title":"Classic Banana Bread","yields":"1 loaf (serves 8)","totalTime":"1 hour 15 minutes","prepTime":"15 minutes","cookTime":"60 minutes","ingredients":[{"__kind":"recipe_ingredient","amount":"3","item":"ripe bananas, mashed"},{"__kind":"recipe_ingredient","amount":"1/3 cup","item":"melted butter"},{"__kind":"recipe_ingredient","amount":"3/4 cup","item":"sugar"},{"__kind":"recipe_ingredient","amount":"1","item":"large egg, beaten"},{"__kind":"recipe_ingredient","amount":"1 tsp","item":"vanilla extract"},{"__kind":"recipe_ingredient","amount":"1 tsp","item":"baking soda"},{"__kind":"recipe_ingredient","amount":"","item":"pinch of salt"},{"__kind":"recipe_ingredient","amount":"1 1/2 cups","item":"all-purpose flour"}],"instructions":[{"__kind":"recipe_step","action":"Prep","description":"Preheat the oven to 175 C (350 F) and butter a 9x5 inch loaf pan."},{"__kind":"recipe_step","action":"Mix wet","description":"Stir the mashed bananas into the melted butter, then mix in the sugar, egg, and vanilla."},{"__kind":"recipe_step","action":"Combine","description":"Sprinkle the baking soda and salt over the mixture, then fold in the flour until just combined."},{"__kind":"recipe_step","action":"Bake","description":"Pour into the pan and bake for 60 minutes, until a toothpick comes out clean.","time":"60 minutes"},{"__kind":"recipe_step","action":"Cool","description":"Cool in the pan for 10 minutes, then turn out onto a wire rack.","time":"10 minutes"}],"notes":"A drizzle of honey while warm makes it extra good. Overripe, heavily spotted bananas give the deepest flavor."}$mtx$::jsonb,
  'Classic banana bread (full)',
  'Full-surface recipe: 8 ingredients incl. an amount-less one (empty string), 5 steps, notes.',
  'authored', false, 'passed', now(), '39c38960-d30c-4840-b0c1-c9960de95582'
from content_ir.kind_definition kd
where kd.organization_id='39c38960-d30c-4840-b0c1-c9960de95582' and kd.kind='cooking_recipe' and kd.deleted_at is null
  and not exists (
    select 1 from content_ir.kind_example e
    where e.kind_definition_id=kd.id and e.label='Classic banana bread (full)' and e.deleted_at is null
  );

insert into content_ir.kind_example
  (kind_definition_id, kind_version, data, label, source, is_canonical, validation_status, validated_at, organization_id)
select kd.id, kd.version,
  $mtx${"__kind":"recipe_ingredient","amount":"2 cups","item":"all-purpose flour"}$mtx$::jsonb,
  'Canonical example', 'authored', true, 'passed', now(), '39c38960-d30c-4840-b0c1-c9960de95582'
from content_ir.kind_definition kd
where kd.organization_id='39c38960-d30c-4840-b0c1-c9960de95582' and kd.kind='recipe_ingredient' and kd.deleted_at is null
  and not exists (
    select 1 from content_ir.kind_example e
    where e.kind_definition_id=kd.id and e.is_canonical and e.deleted_at is null
  );

insert into content_ir.kind_example
  (kind_definition_id, kind_version, data, label, source, is_canonical, validation_status, validated_at, organization_id)
select kd.id, kd.version,
  $mtx${"__kind":"recipe_step","action":"Bake","description":"Bake for 25 minutes until golden brown on top.","time":"25 minutes"}$mtx$::jsonb,
  'Canonical example', 'authored', true, 'passed', now(), '39c38960-d30c-4840-b0c1-c9960de95582'
from content_ir.kind_definition kd
where kd.organization_id='39c38960-d30c-4840-b0c1-c9960de95582' and kd.kind='recipe_step' and kd.deleted_at is null
  and not exists (
    select 1 from content_ir.kind_example e
    where e.kind_definition_id=kd.id and e.is_canonical and e.deleted_at is null
  );

-- ============================================================================
-- 4. kind_surface — BOTH arrival forms, one strategy (THE KEYSTONE).
--    is_active=false until xml-finalize.ts implements the strategy (see header).
-- ============================================================================

insert into content_ir.kind_surface
  (kind_definition_id, surface_type, token, parser_strategy, streaming, priority, is_active, organization_id, metadata)
select kd.id, 'xml_tag', 'cooking_recipe', 'cooking_recipe_legacy_text', true, 100, false, '39c38960-d30c-4840-b0c1-c9960de95582',
  '{"grammar":"legacy_recipe_markdown","streaming_gate":"host releases streamed content only after an H3 title AND an H4 section header WITH a trailing colon (#### Ingredients: / #### Instructions:) — colon-less headers render only at completion","activate_with":"xml-finalize.ts SURFACE_PARSER_STRATEGIES splice"}'::jsonb
from content_ir.kind_definition kd
where kd.organization_id='39c38960-d30c-4840-b0c1-c9960de95582' and kd.kind='cooking_recipe' and kd.deleted_at is null
  and not exists (
    select 1 from content_ir.kind_surface s
    where s.surface_type='xml_tag' and s.token='cooking_recipe' and s.deleted_at is null
  );

insert into content_ir.kind_surface
  (kind_definition_id, surface_type, token, parser_strategy, streaming, priority, is_active, organization_id, metadata)
select kd.id, 'fence_lang', 'cooking_recipe', 'cooking_recipe_legacy_text', true, 100, false, '39c38960-d30c-4840-b0c1-c9960de95582',
  '{"grammar":"legacy_recipe_markdown","note":"host-level fence finalize does not exist yet (XML only today); row is the declared surface for the central fence-convergence pass","activate_with":"xml-finalize.ts SURFACE_PARSER_STRATEGIES splice"}'::jsonb
from content_ir.kind_definition kd
where kd.organization_id='39c38960-d30c-4840-b0c1-c9960de95582' and kd.kind='cooking_recipe' and kd.deleted_at is null
  and not exists (
    select 1 from content_ir.kind_surface s
    where s.surface_type='fence_lang' and s.token='cooking_recipe' and s.deleted_at is null
  );

-- ============================================================================
-- 5. kind_component — web/output → the legacy block type (BlockComponentRegistry
--    key 'cooking_recipe' → RecipeArtifact/RecipeViewer), flashcards precedent.
-- ============================================================================

insert into content_ir.kind_component
  (kind_definition_id, platform, role, component_key, source, is_default, is_active, organization_id, metadata)
select kd.id, 'web', 'output', 'cooking_recipe', 'bundled', true, true, '39c38960-d30c-4840-b0c1-c9960de95582',
  '{"renderer":"features/canvas/artifact-types/renderers/RecipeArtifact.tsx","component":"components/mardown-display/blocks/cooking-recipes/cookingRecipeDisplay.tsx"}'::jsonb
from content_ir.kind_definition kd
where kd.organization_id='39c38960-d30c-4840-b0c1-c9960de95582' and kd.kind='cooking_recipe' and kd.deleted_at is null
  and not exists (
    select 1 from content_ir.kind_component c
    where c.kind_definition_id=kd.id and c.platform='web' and c.role='output' and c.component_key='cooking_recipe' and c.deleted_at is null
  );

-- ============================================================================
-- 6. SKILL — kind_cooking_recipe (JSON syntax; R9: one skill per kind per
--    syntax). The fence/XML markdown counterpart is the LIVE wave-2 skill
--    'cooking-recipe' — untouched.
-- ============================================================================

insert into skill.definition
  (skill_id, label, description, skill_type, body, icon_name, platform_targets, semver, category_id, is_active, is_system, sort_order, organization_id, visibility, metadata)
select
  'kind_cooking_recipe',
  'Recipe (Structured JSON)',
  'Emit an interactive cooking recipe (ingredient checklist, serving scaler, step timers) as canonical {"__kind":"cooking_recipe"} JSON — the structured-output counterpart of the cooking-recipe markdown fence skill.',
  'render_block'::public.skl_skill_type,
  $BODY$# Recipe (Structured JSON) — the `cooking_recipe` kind

You can render a full, interactive cooking recipe by emitting ONE JSON object
carrying `"__kind": "cooking_recipe"`. It renders as the same rich recipe card
the markdown `cooking_recipe` block produces — a title card with yield/time
stat tiles, a checkable ingredients list with a serving scaler, numbered step
cards the cook ticks off (with per-step timers), a Pro Tips notes panel, and a
print/cook-mode toolbar — and persists as an editable, shareable artifact.

Reach for it any time the user asks for a recipe, a dish, or "how to make"
something to cook — and PREFER this JSON kind over the markdown fence when
your output is structurally bound (a `response_format` / output schema built
from the kind) or when you are composing the recipe programmatically. For
free-flowing chat prose the markdown counterpart skill `cooking-recipe`
(```cooking_recipe fence / `<cooking_recipe>` tag) renders the identical
component; both arrival forms converge to this same canonical shape. One
markdown-only caveat worth knowing when choosing: the markdown surface only
streams progressively when its `#### Ingredients:` / `#### Instructions:`
headers carry the trailing colon — the JSON kind has no such gate.

## The shape

Emit a JSON object matching this structure (you may wrap it in a ```json
fence for clarity — both render). Every object carries its own `__kind`:
the root is `cooking_recipe`, each ingredient is `recipe_ingredient`, each
step is `recipe_step`.

```json
{
  "__kind": "cooking_recipe",
  "title": "Quick Garlic Butter Pasta",
  "yields": "Serves 2",
  "totalTime": "20 minutes",
  "prepTime": "5 minutes",
  "cookTime": "15 minutes",
  "ingredients": [
    { "__kind": "recipe_ingredient", "amount": "8 oz", "item": "spaghetti" },
    { "__kind": "recipe_ingredient", "amount": "3 tbsp", "item": "butter" },
    { "__kind": "recipe_ingredient", "amount": "4", "item": "cloves garlic, minced" }
  ],
  "instructions": [
    {
      "__kind": "recipe_step",
      "action": "Boil",
      "description": "Cook the spaghetti in salted water until al dente, about 9 minutes.",
      "time": "9 minutes"
    },
    {
      "__kind": "recipe_step",
      "action": "Toss",
      "description": "Drain the pasta and toss with the garlic butter."
    }
  ],
  "notes": "Reserve a splash of pasta water to loosen the sauce."
}
```

## Field reference

Root (`cooking_recipe`):

| Field | Required | What it renders |
|---|---|---|
| `title` | YES | The recipe name (header card headline). |
| `ingredients` | YES | Array of `recipe_ingredient` — the checkable, scalable list. |
| `instructions` | YES | Array of `recipe_step` — the numbered step cards. |
| `yields` | no | Serving line under the title ("Serves 4" when omitted). |
| `totalTime` | no | "Total" stat tile ("30 minutes" when omitted). |
| `prepTime` | no | "Prep" stat tile ("15 minutes" when omitted). |
| `cookTime` | no | "Cook" stat tile ("15 minutes" when omitted). |
| `notes` | no | The amber "Pro Tips" panel. |

`recipe_ingredient`: `amount` (required string — may be `""` for unmeasured
items) + `item` (required string).

`recipe_step`: `action` (required — short imperative headline like "Boil",
"Mix wet") + `description` (required — the full step text) + `time`
(optional — a duration string like "9 minutes" that renders the step timer).

## Syntax rules that prevent render failures

These are the real breakage classes in the renderer/bridge — follow them
exactly:

1. AT LEAST ONE INGREDIENT OR STEP. A recipe whose `ingredients` AND
   `instructions` are both empty REFUSES to render as a recipe card (the
   progress math would divide by zero) — it falls back to plain text.
2. AMOUNT IS ITS OWN FIELD, QUANTITY-ONLY. The serving scaler multiplies the
   digits inside `amount` and ONLY `amount`. A quantity fused into `item`
   never scales.
   - Wrong: `{ "amount": "", "item": "2 cups flour" }`
   - Right: `{ "amount": "2 cups", "item": "flour" }`
3. TIMES ARE DISPLAY STRINGS, NOT NUMBERS. `"20 minutes"`, `"1 hour 15
   minutes"` — never `20` or `{"minutes":20}`. Every field in this kind is a
   string; a number fails validation.
4. SET `time` EXPLICITLY FOR STEP TIMERS. On the JSON path a step timer
   renders only from the `time` field — a duration mentioned inside
   `description` alone does NOT surface a timer (that derivation is a
   markdown-surface behavior).
5. NO EXTRA KEYS. The schema is strict (`additionalProperties: false`).
   `servings`, `cuisine`, `difficulty`, per-ingredient `notes` — all fail
   validation. Put such extras in the root `notes` prose.
6. EVERY OBJECT CARRIES ITS `__kind`. Root `"cooking_recipe"`, each
   ingredient `"recipe_ingredient"`, each step `"recipe_step"`. A missing or
   misspelled discriminator drops the object to generic rendering.
7. FILL THE TIMES FOR REAL RECIPES. Omitted `yields`/`totalTime`/`prepTime`/
   `cookTime` render placeholder defaults ("Serves 4" / "30 minutes" /
   "15 minutes" / "15 minutes") — fine for a sketch, wrong for a real dish.
8. ONE RECIPE PER BLOCK. For a multi-course menu, emit one `cooking_recipe`
   object per dish, never one giant object.
9. NEVER wrap the JSON in `<artifact>` tags — the recipe block IS the
   artifact.

## Sizing

Best for a single dish: roughly 3-25 ingredients and 3-15 steps. `action`
stays short (1-3 words) — it is the step card headline; the detail lives in
`description`.

## Editing an existing recipe

When asked to change a recipe, return ONE complete `cooking_recipe` JSON
object with the full updated content — all required fields present, `__kind`
kept on the root and every child. Never send a diff, a partial object, or a
second recipe appended to the first.

## Minimal correct example

```json
{
  "__kind": "cooking_recipe",
  "title": "Buttered Toast",
  "ingredients": [
    { "__kind": "recipe_ingredient", "amount": "2 slices", "item": "bread" },
    { "__kind": "recipe_ingredient", "amount": "1 tbsp", "item": "butter" }
  ],
  "instructions": [
    {
      "__kind": "recipe_step",
      "action": "Toast",
      "description": "Toast the bread until golden, about 3 minutes.",
      "time": "3 minutes"
    },
    {
      "__kind": "recipe_step",
      "action": "Butter",
      "description": "Spread the butter over the hot toast."
    }
  ]
}
```$BODY$,
  'ChefHat',
  '["web"]'::jsonb,
  '1.0.0',
  '49c845cb-9314-485c-88ed-a7ace4f286ca',
  true, true, 10,
  '39c38960-d30c-4840-b0c1-c9960de95582',
  'public',
  '{"kind":"cooking_recipe","syntax":"json","counterpart_skill_id":"cooking-recipe"}'::jsonb
where not exists (
  select 1 from skill.definition
  where skill_id='kind_cooking_recipe' and organization_id='39c38960-d30c-4840-b0c1-c9960de95582' and deleted_at is null
);

update skill.definition set
  label = 'Recipe (Structured JSON)',
  description = 'Emit an interactive cooking recipe (ingredient checklist, serving scaler, step timers) as canonical {"__kind":"cooking_recipe"} JSON — the structured-output counterpart of the cooking-recipe markdown fence skill.',
  skill_type = 'render_block'::public.skl_skill_type,
  body = $BODY$# Recipe (Structured JSON) — the `cooking_recipe` kind

You can render a full, interactive cooking recipe by emitting ONE JSON object
carrying `"__kind": "cooking_recipe"`. It renders as the same rich recipe card
the markdown `cooking_recipe` block produces — a title card with yield/time
stat tiles, a checkable ingredients list with a serving scaler, numbered step
cards the cook ticks off (with per-step timers), a Pro Tips notes panel, and a
print/cook-mode toolbar — and persists as an editable, shareable artifact.

Reach for it any time the user asks for a recipe, a dish, or "how to make"
something to cook — and PREFER this JSON kind over the markdown fence when
your output is structurally bound (a `response_format` / output schema built
from the kind) or when you are composing the recipe programmatically. For
free-flowing chat prose the markdown counterpart skill `cooking-recipe`
(```cooking_recipe fence / `<cooking_recipe>` tag) renders the identical
component; both arrival forms converge to this same canonical shape. One
markdown-only caveat worth knowing when choosing: the markdown surface only
streams progressively when its `#### Ingredients:` / `#### Instructions:`
headers carry the trailing colon — the JSON kind has no such gate.

## The shape

Emit a JSON object matching this structure (you may wrap it in a ```json
fence for clarity — both render). Every object carries its own `__kind`:
the root is `cooking_recipe`, each ingredient is `recipe_ingredient`, each
step is `recipe_step`.

```json
{
  "__kind": "cooking_recipe",
  "title": "Quick Garlic Butter Pasta",
  "yields": "Serves 2",
  "totalTime": "20 minutes",
  "prepTime": "5 minutes",
  "cookTime": "15 minutes",
  "ingredients": [
    { "__kind": "recipe_ingredient", "amount": "8 oz", "item": "spaghetti" },
    { "__kind": "recipe_ingredient", "amount": "3 tbsp", "item": "butter" },
    { "__kind": "recipe_ingredient", "amount": "4", "item": "cloves garlic, minced" }
  ],
  "instructions": [
    {
      "__kind": "recipe_step",
      "action": "Boil",
      "description": "Cook the spaghetti in salted water until al dente, about 9 minutes.",
      "time": "9 minutes"
    },
    {
      "__kind": "recipe_step",
      "action": "Toss",
      "description": "Drain the pasta and toss with the garlic butter."
    }
  ],
  "notes": "Reserve a splash of pasta water to loosen the sauce."
}
```

## Field reference

Root (`cooking_recipe`):

| Field | Required | What it renders |
|---|---|---|
| `title` | YES | The recipe name (header card headline). |
| `ingredients` | YES | Array of `recipe_ingredient` — the checkable, scalable list. |
| `instructions` | YES | Array of `recipe_step` — the numbered step cards. |
| `yields` | no | Serving line under the title ("Serves 4" when omitted). |
| `totalTime` | no | "Total" stat tile ("30 minutes" when omitted). |
| `prepTime` | no | "Prep" stat tile ("15 minutes" when omitted). |
| `cookTime` | no | "Cook" stat tile ("15 minutes" when omitted). |
| `notes` | no | The amber "Pro Tips" panel. |

`recipe_ingredient`: `amount` (required string — may be `""` for unmeasured
items) + `item` (required string).

`recipe_step`: `action` (required — short imperative headline like "Boil",
"Mix wet") + `description` (required — the full step text) + `time`
(optional — a duration string like "9 minutes" that renders the step timer).

## Syntax rules that prevent render failures

These are the real breakage classes in the renderer/bridge — follow them
exactly:

1. AT LEAST ONE INGREDIENT OR STEP. A recipe whose `ingredients` AND
   `instructions` are both empty REFUSES to render as a recipe card (the
   progress math would divide by zero) — it falls back to plain text.
2. AMOUNT IS ITS OWN FIELD, QUANTITY-ONLY. The serving scaler multiplies the
   digits inside `amount` and ONLY `amount`. A quantity fused into `item`
   never scales.
   - Wrong: `{ "amount": "", "item": "2 cups flour" }`
   - Right: `{ "amount": "2 cups", "item": "flour" }`
3. TIMES ARE DISPLAY STRINGS, NOT NUMBERS. `"20 minutes"`, `"1 hour 15
   minutes"` — never `20` or `{"minutes":20}`. Every field in this kind is a
   string; a number fails validation.
4. SET `time` EXPLICITLY FOR STEP TIMERS. On the JSON path a step timer
   renders only from the `time` field — a duration mentioned inside
   `description` alone does NOT surface a timer (that derivation is a
   markdown-surface behavior).
5. NO EXTRA KEYS. The schema is strict (`additionalProperties: false`).
   `servings`, `cuisine`, `difficulty`, per-ingredient `notes` — all fail
   validation. Put such extras in the root `notes` prose.
6. EVERY OBJECT CARRIES ITS `__kind`. Root `"cooking_recipe"`, each
   ingredient `"recipe_ingredient"`, each step `"recipe_step"`. A missing or
   misspelled discriminator drops the object to generic rendering.
7. FILL THE TIMES FOR REAL RECIPES. Omitted `yields`/`totalTime`/`prepTime`/
   `cookTime` render placeholder defaults ("Serves 4" / "30 minutes" /
   "15 minutes" / "15 minutes") — fine for a sketch, wrong for a real dish.
8. ONE RECIPE PER BLOCK. For a multi-course menu, emit one `cooking_recipe`
   object per dish, never one giant object.
9. NEVER wrap the JSON in `<artifact>` tags — the recipe block IS the
   artifact.

## Sizing

Best for a single dish: roughly 3-25 ingredients and 3-15 steps. `action`
stays short (1-3 words) — it is the step card headline; the detail lives in
`description`.

## Editing an existing recipe

When asked to change a recipe, return ONE complete `cooking_recipe` JSON
object with the full updated content — all required fields present, `__kind`
kept on the root and every child. Never send a diff, a partial object, or a
second recipe appended to the first.

## Minimal correct example

```json
{
  "__kind": "cooking_recipe",
  "title": "Buttered Toast",
  "ingredients": [
    { "__kind": "recipe_ingredient", "amount": "2 slices", "item": "bread" },
    { "__kind": "recipe_ingredient", "amount": "1 tbsp", "item": "butter" }
  ],
  "instructions": [
    {
      "__kind": "recipe_step",
      "action": "Toast",
      "description": "Toast the bread until golden, about 3 minutes.",
      "time": "3 minutes"
    },
    {
      "__kind": "recipe_step",
      "action": "Butter",
      "description": "Spread the butter over the hot toast."
    }
  ]
}
```$BODY$,
  icon_name = 'ChefHat',
  platform_targets = '["web"]'::jsonb,
  semver = '1.0.0',
  category_id = '49c845cb-9314-485c-88ed-a7ace4f286ca',
  is_active = true, is_system = true,
  visibility = 'public',
  metadata = '{"kind":"cooking_recipe","syntax":"json","counterpart_skill_id":"cooking-recipe"}'::jsonb,
  updated_at = now()
where skill_id='kind_cooking_recipe' and organization_id='39c38960-d30c-4840-b0c1-c9960de95582' and deleted_at is null;

-- ============================================================================
-- 7. CONTENT BLOCKS — two per skill (simple + full), Agent Skills category,
--    metadata carries the pairing skill_id. New block_ids — never clobbers
--    the live wave-2 'cooking-recipe-block'.
-- ============================================================================

insert into public.content_blocks
  (block_id, label, description, template, icon_name, organization_id, category_id, metadata, version, is_active, sort_order)
values (
  'kind-cooking-recipe-simple',
  'Recipe Card',
  'Teaches the agent to emit an interactive cooking recipe as canonical {"__kind":"cooking_recipe"} JSON (minimal shape).',
  $CB$When the user asks for a recipe or how to cook a dish, emit an interactive recipe card as ONE JSON object carrying __kind:

```json
{
  "__kind": "cooking_recipe",
  "title": "Quick Garlic Butter Pasta",
  "ingredients": [
    { "__kind": "recipe_ingredient", "amount": "8 oz", "item": "spaghetti" },
    { "__kind": "recipe_ingredient", "amount": "3 tbsp", "item": "butter" }
  ],
  "instructions": [
    { "__kind": "recipe_step", "action": "Boil", "description": "Cook the spaghetti until al dente, about 9 minutes.", "time": "9 minutes" },
    { "__kind": "recipe_step", "action": "Toss", "description": "Drain and toss with the garlic butter." }
  ]
}
```

Rules: `title`, `ingredients`, `instructions` are required and at least one ingredient or step must exist; `amount` holds the quantity ONLY (the serving scaler multiplies it — never fuse it into `item`); every value is a string; every object keeps its `__kind`; no extra keys (strict schema); one recipe per block.$CB$,
  'ChefHat',
  '39c38960-d30c-4840-b0c1-c9960de95582',
  '2c324058-95e9-4b7e-a991-884f4443eb6e',
  '{"skill_id":"kind_cooking_recipe"}'::jsonb,
  1, true, 10
)
on conflict (block_id) do update set
  label = excluded.label,
  description = excluded.description,
  template = excluded.template,
  icon_name = excluded.icon_name,
  category_id = excluded.category_id,
  metadata = excluded.metadata,
  is_active = excluded.is_active,
  sort_order = excluded.sort_order,
  updated_at = now();

insert into public.content_blocks
  (block_id, label, description, template, icon_name, organization_id, category_id, metadata, version, is_active, sort_order)
values (
  'kind-cooking-recipe-full',
  'Recipe Card (Detailed)',
  'Teaches the agent the full cooking_recipe JSON shape: yields, prep/cook/total times, step timers, and notes.',
  $CB$For a complete cooking recipe (yield, prep/cook/total times, step timers, pro tips), emit ONE JSON object carrying __kind:

```json
{
  "__kind": "cooking_recipe",
  "title": "Classic Banana Bread",
  "yields": "1 loaf (serves 8)",
  "totalTime": "1 hour 15 minutes",
  "prepTime": "15 minutes",
  "cookTime": "60 minutes",
  "ingredients": [
    { "__kind": "recipe_ingredient", "amount": "3", "item": "ripe bananas, mashed" },
    { "__kind": "recipe_ingredient", "amount": "1/3 cup", "item": "melted butter" },
    { "__kind": "recipe_ingredient", "amount": "1 1/2 cups", "item": "all-purpose flour" },
    { "__kind": "recipe_ingredient", "amount": "", "item": "pinch of salt" }
  ],
  "instructions": [
    { "__kind": "recipe_step", "action": "Prep", "description": "Preheat the oven to 175 C and butter a 9x5 inch loaf pan." },
    { "__kind": "recipe_step", "action": "Bake", "description": "Pour into the pan and bake for 60 minutes.", "time": "60 minutes" }
  ],
  "notes": "Overripe, heavily spotted bananas give the deepest flavor."
}
```

Rules: times are display strings ("60 minutes", never numbers); a step timer renders ONLY from `time` — set it explicitly; omitted yields/times show placeholder defaults ("Serves 4" / "30 minutes"), so fill them for real dishes; `amount` may be "" for unmeasured items; no extra keys (strict schema); return ONE complete updated object when editing.$CB$,
  'ChefHat',
  '39c38960-d30c-4840-b0c1-c9960de95582',
  '2c324058-95e9-4b7e-a991-884f4443eb6e',
  '{"skill_id":"kind_cooking_recipe"}'::jsonb,
  1, true, 11
)
on conflict (block_id) do update set
  label = excluded.label,
  description = excluded.description,
  template = excluded.template,
  icon_name = excluded.icon_name,
  category_id = excluded.category_id,
  metadata = excluded.metadata,
  is_active = excluded.is_active,
  sort_order = excluded.sort_order,
  updated_at = now();

COMMIT;
