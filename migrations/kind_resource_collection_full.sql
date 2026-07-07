-- kind_resource_collection_full.sql
-- The full Shape System package for the RESOURCE COLLECTION renderable
-- (components/mardown-display/blocks/resources/ResourceCollectionBlock.tsx):
--   kind_definition  : resource_collection / resource_category / resource_item
--   kind_edge        : collection.categories -> category, category.resources -> item
--   kind_example     : 4 examples (2 on the root; firsts canonical) — every one
--                      REALLY validated pre-write via the dual gate's structural
--                      leg (ajv Draft 2020-12 over emitted_json_schema) AND the
--                      render leg (resourcesServerDataFromEnvelope output accepted
--                      by validateResourceCollection).
--   kind_surface     : xml_tag/resources -> resources_legacy_text (INACTIVE — the
--                      strategy ships in features/content-ir/surfaces/
--                      resources-legacy-text.ts but is not yet wired into
--                      xml-finalize.ts; activating now would only scream).
--   kind_component   : web/output -> component_key 'resources' (the
--                      BlockComponentRegistry legacyBlockType facade).
--   skill.definition : kind_resource_collection — the JSON (__kind) syntax skill.
--                      The XML counterpart skill 'render-block-resources' stays
--                      the live teacher until this kind activates.
--   content_blocks   : kind-resource-collection-simple / -full. NEVER touches the
--                      live 'resource-collection' (v2 content block) or
--                      'resource-collection-block' (XML skill block) rows — the
--                      naming collision wave 2 discovered is respected here.
--
-- All data[] / emitted_json_schema / emitted_block_schema / fingerprints below
-- are CONVERTER-EMITTED (kindSchemaToStorage + kindSchemaToJsonSchema +
-- fingerprintText over the schemas in
-- features/content-ir/kinds/resource-collection.ts) — never hand-written.
--
-- is_active=false everywhere new (kind rows, surface, skill, blocks) until
-- integration wires the strategy + registration and flips the gates together.
-- Idempotent: business-key guarded; re-apply is safe.
--
-- Constants:
--   system org                  : 39c38960-d30c-4840-b0c1-c9960de95582
--   skill category (Render Blocks, dimension=skill)      : 49c845cb-9314-485c-88ed-a7ace4f286ca
--   content-block category (Agent Skills, content-block) : 2c324058-95e9-4b7e-a991-884f4443eb6e

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. kind_definition — leaf first, then category, then the root.
-- ---------------------------------------------------------------------------

INSERT INTO content_ir.kind_definition
  (kind, label, authoring_owner, data, emitted_json_schema, emitted_block_schema,
   emitted_fingerprint, is_active, visibility, organization_id, metadata)
SELECT
  'resource_item', 'Resource Item', 'ts',
  $mtx$[{"name":"id","type":"string"},{"name":"title","required":true,"type":"string"},{"name":"url","required":true,"type":"string"},{"name":"description","type":"string"},{"name":"type","type":"enum","values":["documentation","tool","video","article","course","book","tutorial","other"]},{"name":"duration","type":"string"},{"name":"difficulty","type":"enum","values":["beginner","intermediate","advanced"]},{"name":"rating","type":"number"},{"name":"tags","type":"string[]"},{"name":"isFavorite","type":"boolean"},{"name":"isCompleted","type":"boolean"}]$mtx$::jsonb,
  $mtx${"type":"object","properties":{"id":{"type":"string"},"title":{"type":"string"},"url":{"type":"string"},"description":{"type":"string"},"type":{"type":"string","enum":["documentation","tool","video","article","course","book","tutorial","other"]},"duration":{"type":"string"},"difficulty":{"type":"string","enum":["beginner","intermediate","advanced"]},"rating":{"type":"number"},"tags":{"type":"array","items":{"type":"string"}},"isFavorite":{"type":"boolean"},"isCompleted":{"type":"boolean"}},"required":["title","url"],"additionalProperties":false}$mtx$::jsonb,
  $mtx${"type":"object","properties":{"id":{"type":"string"},"title":{"type":"string"},"url":{"type":"string"},"description":{"type":"string"},"type":{"type":"string","enum":["documentation","tool","video","article","course","book","tutorial","other"]},"duration":{"type":"string"},"difficulty":{"type":"string","enum":["beginner","intermediate","advanced"]},"rating":{"type":"number"},"tags":{"type":"array","items":{"type":"string"}},"isFavorite":{"type":"boolean"},"isCompleted":{"type":"boolean"},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"resource_item"}},"required":["__kind","title","url"],"additionalProperties":false}$mtx$::jsonb,
  'ik-1d87zni79fsp8', false, 'public', '39c38960-d30c-4840-b0c1-c9960de95582', '{}'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM content_ir.kind_definition
  WHERE organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
    AND kind = 'resource_item' AND deleted_at IS NULL
);

INSERT INTO content_ir.kind_definition
  (kind, label, authoring_owner, data, emitted_json_schema, emitted_block_schema,
   emitted_fingerprint, is_active, visibility, organization_id, metadata)
SELECT
  'resource_category', 'Resource Category', 'ts',
  $mtx$[{"name":"id","type":"string"},{"name":"name","required":true,"type":"string"},{"name":"description","type":"string"},{"name":"resources","required":true,"type":"array"}]$mtx$::jsonb,
  $mtx${"type":"object","properties":{"id":{"type":"string"},"name":{"type":"string"},"description":{"type":"string"},"resources":{"type":"array","items":{"$ref":"#/$defs/resource_item"}}},"required":["name","resources"],"additionalProperties":false,"$defs":{"resource_item":{"type":"object","properties":{"id":{"type":"string"},"title":{"type":"string"},"url":{"type":"string"},"description":{"type":"string"},"type":{"type":"string","enum":["documentation","tool","video","article","course","book","tutorial","other"]},"duration":{"type":"string"},"difficulty":{"type":"string","enum":["beginner","intermediate","advanced"]},"rating":{"type":"number"},"tags":{"type":"array","items":{"type":"string"}},"isFavorite":{"type":"boolean"},"isCompleted":{"type":"boolean"}},"required":["title","url"],"additionalProperties":false}}}$mtx$::jsonb,
  $mtx${"type":"object","properties":{"id":{"type":"string"},"name":{"type":"string"},"description":{"type":"string"},"resources":{"type":"array","items":{"$ref":"#/$defs/resource_item"}},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"resource_category"}},"required":["__kind","name","resources"],"additionalProperties":false,"$defs":{"resource_item":{"type":"object","properties":{"id":{"type":"string"},"title":{"type":"string"},"url":{"type":"string"},"description":{"type":"string"},"type":{"type":"string","enum":["documentation","tool","video","article","course","book","tutorial","other"]},"duration":{"type":"string"},"difficulty":{"type":"string","enum":["beginner","intermediate","advanced"]},"rating":{"type":"number"},"tags":{"type":"array","items":{"type":"string"}},"isFavorite":{"type":"boolean"},"isCompleted":{"type":"boolean"},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"resource_item"}},"required":["__kind","title","url"],"additionalProperties":false}}}$mtx$::jsonb,
  'tf-toqzs6h4hq88', false, 'public', '39c38960-d30c-4840-b0c1-c9960de95582', '{}'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM content_ir.kind_definition
  WHERE organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
    AND kind = 'resource_category' AND deleted_at IS NULL
);

INSERT INTO content_ir.kind_definition
  (kind, label, authoring_owner, data, emitted_json_schema, emitted_block_schema,
   emitted_fingerprint, is_active, visibility, organization_id, metadata)
SELECT
  'resource_collection', 'Resource Collection', 'ts',
  $mtx$[{"name":"title","required":true,"type":"string"},{"name":"description","type":"string"},{"name":"categories","required":true,"type":"array"}]$mtx$::jsonb,
  $mtx${"type":"object","properties":{"title":{"type":"string"},"description":{"type":"string"},"categories":{"type":"array","items":{"$ref":"#/$defs/resource_category"}}},"required":["title","categories"],"additionalProperties":false,"$defs":{"resource_category":{"type":"object","properties":{"id":{"type":"string"},"name":{"type":"string"},"description":{"type":"string"},"resources":{"type":"array","items":{"$ref":"#/$defs/resource_item"}}},"required":["name","resources"],"additionalProperties":false},"resource_item":{"type":"object","properties":{"id":{"type":"string"},"title":{"type":"string"},"url":{"type":"string"},"description":{"type":"string"},"type":{"type":"string","enum":["documentation","tool","video","article","course","book","tutorial","other"]},"duration":{"type":"string"},"difficulty":{"type":"string","enum":["beginner","intermediate","advanced"]},"rating":{"type":"number"},"tags":{"type":"array","items":{"type":"string"}},"isFavorite":{"type":"boolean"},"isCompleted":{"type":"boolean"}},"required":["title","url"],"additionalProperties":false}}}$mtx$::jsonb,
  $mtx${"type":"object","properties":{"title":{"type":"string"},"description":{"type":"string"},"categories":{"type":"array","items":{"$ref":"#/$defs/resource_category"}},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"resource_collection"}},"required":["__kind","title","categories"],"additionalProperties":false,"$defs":{"resource_category":{"type":"object","properties":{"id":{"type":"string"},"name":{"type":"string"},"description":{"type":"string"},"resources":{"type":"array","items":{"$ref":"#/$defs/resource_item"}},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"resource_category"}},"required":["__kind","name","resources"],"additionalProperties":false},"resource_item":{"type":"object","properties":{"id":{"type":"string"},"title":{"type":"string"},"url":{"type":"string"},"description":{"type":"string"},"type":{"type":"string","enum":["documentation","tool","video","article","course","book","tutorial","other"]},"duration":{"type":"string"},"difficulty":{"type":"string","enum":["beginner","intermediate","advanced"]},"rating":{"type":"number"},"tags":{"type":"array","items":{"type":"string"}},"isFavorite":{"type":"boolean"},"isCompleted":{"type":"boolean"},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"resource_item"}},"required":["__kind","title","url"],"additionalProperties":false}}}$mtx$::jsonb,
  '13r-1fcfl5w1dcvp1a', false, 'public', '39c38960-d30c-4840-b0c1-c9960de95582', '{}'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM content_ir.kind_definition
  WHERE organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
    AND kind = 'resource_collection' AND deleted_at IS NULL
);

-- ---------------------------------------------------------------------------
-- 2. kind_edge — kind-to-kind refs (field path -> child), position 0 arrays.
-- ---------------------------------------------------------------------------

INSERT INTO content_ir.kind_edge
  (parent_definition_id, field_name, child_definition_id, position, organization_id)
SELECT p.id, 'categories', c.id, 0, '39c38960-d30c-4840-b0c1-c9960de95582'
FROM content_ir.kind_definition p, content_ir.kind_definition c
WHERE p.kind = 'resource_collection' AND c.kind = 'resource_category'
  AND p.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
  AND c.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
  AND p.deleted_at IS NULL AND c.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM content_ir.kind_edge e
    WHERE e.parent_definition_id = p.id AND e.field_name = 'categories'
      AND e.child_definition_id = c.id AND e.deleted_at IS NULL
  );

INSERT INTO content_ir.kind_edge
  (parent_definition_id, field_name, child_definition_id, position, organization_id)
SELECT p.id, 'resources', c.id, 0, '39c38960-d30c-4840-b0c1-c9960de95582'
FROM content_ir.kind_definition p, content_ir.kind_definition c
WHERE p.kind = 'resource_category' AND c.kind = 'resource_item'
  AND p.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
  AND c.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
  AND p.deleted_at IS NULL AND c.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM content_ir.kind_edge e
    WHERE e.parent_definition_id = p.id AND e.field_name = 'resources'
      AND e.child_definition_id = c.id AND e.deleted_at IS NULL
  );

-- ---------------------------------------------------------------------------
-- 3. kind_example — validation_status='passed' is REAL: every example below
--    passed validateStructuralLeg (ajv Draft 2020-12, __kind-stripped, against
--    the emitted_json_schema above) before this file was written, and both
--    root examples passed the render leg (bridge -> validateResourceCollection).
-- ---------------------------------------------------------------------------

INSERT INTO content_ir.kind_example
  (kind_definition_id, kind_version, data, label, source, is_canonical,
   validation_status, validated_at, organization_id)
SELECT kd.id, kd.version,
  $mtx${"__kind":"resource_collection","title":"TypeScript Learning Path","description":"Everything you need to go from JavaScript to confident TypeScript.","categories":[{"__kind":"resource_category","name":"Official Documentation","resources":[{"__kind":"resource_item","title":"TypeScript Handbook","url":"https://www.typescriptlang.org/docs/","description":"The canonical reference, from basics to advanced types.","type":"documentation","difficulty":"beginner","rating":5},{"__kind":"resource_item","title":"TypeScript Playground","url":"https://www.typescriptlang.org/play","description":"Experiment with types directly in the browser.","type":"tool","difficulty":"beginner","rating":5}]},{"__kind":"resource_category","name":"Practice","description":"Hands-on exercises to cement the concepts.","resources":[{"__kind":"resource_item","title":"Type Challenges","url":"https://github.com/type-challenges/type-challenges","description":"Solve real type-level puzzles of increasing difficulty.","type":"tutorial","duration":"20 hours","difficulty":"advanced","rating":5,"tags":["free","community"]}]}]}$mtx$::jsonb,
  'TypeScript learning path (canonical)', 'authored', true, 'passed', now(),
  '39c38960-d30c-4840-b0c1-c9960de95582'
FROM content_ir.kind_definition kd
WHERE kd.kind = 'resource_collection' AND kd.deleted_at IS NULL
  AND kd.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
  AND NOT EXISTS (
    SELECT 1 FROM content_ir.kind_example e
    WHERE e.kind_definition_id = kd.id AND e.is_canonical AND e.deleted_at IS NULL
  );

INSERT INTO content_ir.kind_example
  (kind_definition_id, kind_version, data, label, source, is_canonical,
   validation_status, validated_at, organization_id)
SELECT kd.id, kd.version,
  $mtx${"__kind":"resource_collection","title":"Machine Learning Starter Kit","description":"A guided path from zero to training your first model.","categories":[{"__kind":"resource_category","id":"category-1","name":"Foundations","description":"Core concepts before any code.","resources":[{"__kind":"resource_item","id":"resource-1","title":"StatQuest: Machine Learning","url":"https://www.youtube.com/playlist?list=PLblh5JKOoLUICTaGLRoHQDuF_7q2GfuJF","description":"Short visual explanations of every core ML idea.","type":"video","duration":"12 hours","difficulty":"beginner","rating":5,"tags":["free","video-course"],"isFavorite":true,"isCompleted":false},{"__kind":"resource_item","id":"resource-2","title":"An Introduction to Statistical Learning","url":"https://www.statlearning.com/","description":"The classic free textbook with R and Python labs.","type":"book","duration":"40 hours","difficulty":"intermediate","rating":4,"tags":["free","textbook"],"isFavorite":false,"isCompleted":true}]},{"__kind":"resource_category","id":"category-2","name":"Hands-on","resources":[{"__kind":"resource_item","id":"resource-3","title":"Kaggle Learn","url":"https://www.kaggle.com/learn","description":"Bite-size interactive courses with instant feedback.","type":"course","duration":"4 hours","difficulty":"beginner","rating":4,"tags":["free","interactive"]},{"__kind":"resource_item","id":"resource-4","title":"scikit-learn User Guide","url":"https://scikit-learn.org/stable/user_guide.html","description":"The reference for the library you will actually use.","type":"documentation","difficulty":"intermediate","rating":5}]}]}$mtx$::jsonb,
  'Machine learning starter kit (every field)', 'authored', false, 'passed', now(),
  '39c38960-d30c-4840-b0c1-c9960de95582'
FROM content_ir.kind_definition kd
WHERE kd.kind = 'resource_collection' AND kd.deleted_at IS NULL
  AND kd.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
  AND NOT EXISTS (
    SELECT 1 FROM content_ir.kind_example e
    WHERE e.kind_definition_id = kd.id
      AND e.label = 'Machine learning starter kit (every field)'
      AND e.deleted_at IS NULL
  );

INSERT INTO content_ir.kind_example
  (kind_definition_id, kind_version, data, label, source, is_canonical,
   validation_status, validated_at, organization_id)
SELECT kd.id, kd.version,
  $mtx${"__kind":"resource_category","id":"category-1","name":"Official Documentation","description":"Primary references straight from the source.","resources":[{"__kind":"resource_item","id":"resource-1","title":"React Documentation","url":"https://react.dev/","description":"The modern React docs with interactive examples.","type":"documentation","difficulty":"beginner","rating":5}]}$mtx$::jsonb,
  'Documentation category (canonical)', 'authored', true, 'passed', now(),
  '39c38960-d30c-4840-b0c1-c9960de95582'
FROM content_ir.kind_definition kd
WHERE kd.kind = 'resource_category' AND kd.deleted_at IS NULL
  AND kd.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
  AND NOT EXISTS (
    SELECT 1 FROM content_ir.kind_example e
    WHERE e.kind_definition_id = kd.id AND e.is_canonical AND e.deleted_at IS NULL
  );

INSERT INTO content_ir.kind_example
  (kind_definition_id, kind_version, data, label, source, is_canonical,
   validation_status, validated_at, organization_id)
SELECT kd.id, kd.version,
  $mtx${"__kind":"resource_item","id":"resource-1","title":"Rust in 100 Minutes","url":"https://www.youtube.com/watch?v=example","description":"A fast visual introduction to the whole language.","type":"video","duration":"100 min","difficulty":"beginner","rating":5,"tags":["free"],"isFavorite":false,"isCompleted":false}$mtx$::jsonb,
  'Single resource link (canonical)', 'authored', true, 'passed', now(),
  '39c38960-d30c-4840-b0c1-c9960de95582'
FROM content_ir.kind_definition kd
WHERE kd.kind = 'resource_item' AND kd.deleted_at IS NULL
  AND kd.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
  AND NOT EXISTS (
    SELECT 1 FROM content_ir.kind_example e
    WHERE e.kind_definition_id = kd.id AND e.is_canonical AND e.deleted_at IS NULL
  );

-- ---------------------------------------------------------------------------
-- 4. kind_surface — xml_tag/resources -> resources_legacy_text. INACTIVE until
--    the strategy is registered in surfaces/xml-finalize.ts (integration step);
--    an active row naming an unimplemented strategy would console.error on
--    every completed <resources> region. Guarded on the FULL (surface_type,
--    token) key so no existing surface is ever clobbered.
-- ---------------------------------------------------------------------------

INSERT INTO content_ir.kind_surface
  (kind_definition_id, surface_type, token, parser_strategy, streaming,
   is_active, organization_id, metadata)
SELECT kd.id, 'xml_tag', 'resources', 'resources_legacy_text', true,
  false, '39c38960-d30c-4840-b0c1-c9960de95582',
  $mtx${"activation_gate":"strategy resources_legacy_text must be registered in features/content-ir/surfaces/xml-finalize.ts before this row is activated"}$mtx$::jsonb
FROM content_ir.kind_definition kd
WHERE kd.kind = 'resource_collection' AND kd.deleted_at IS NULL
  AND kd.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
  AND NOT EXISTS (
    SELECT 1 FROM content_ir.kind_surface s
    WHERE s.surface_type = 'xml_tag' AND s.token = 'resources'
      AND s.deleted_at IS NULL
  );

-- ---------------------------------------------------------------------------
-- 5. kind_component — web/output resolves to the legacy block type facade
--    ('resources' in BlockComponentRegistry -> ResourceCollectionBlock).
--    Render trust stays gated by kind_definition.is_active (R6).
-- ---------------------------------------------------------------------------

INSERT INTO content_ir.kind_component
  (kind_definition_id, platform, role, component_key, source, is_default,
   is_active, organization_id)
SELECT kd.id, 'web', 'output', 'resources', 'bundled', true, true,
  '39c38960-d30c-4840-b0c1-c9960de95582'
FROM content_ir.kind_definition kd
WHERE kd.kind = 'resource_collection' AND kd.deleted_at IS NULL
  AND kd.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
  AND NOT EXISTS (
    SELECT 1 FROM content_ir.kind_component c
    WHERE c.kind_definition_id = kd.id AND c.platform = 'web'
      AND c.role = 'output' AND c.component_key = 'resources'
      AND c.deleted_at IS NULL
  );

-- ---------------------------------------------------------------------------
-- 6. The JSON-syntax skill: kind_resource_collection (R9: kind_<slug>).
--    INACTIVE until the kind activates — the XML skill 'render-block-resources'
--    remains the one live teacher for this renderable until then (coexist,
--    never clobber).
-- ---------------------------------------------------------------------------

INSERT INTO skill.definition
  (skill_id, label, description, skill_type, body, icon_name, platform_targets,
   semver, category_id, is_system, is_active, visibility, organization_id,
   sort_order, metadata)
SELECT
  'kind_resource_collection',
  'Resource Collection (__kind)',
  'How and when to emit a resource_collection render block as __kind JSON: the collection/category/item structure, the title-and-url rules that keep cards from being dropped, the recognized type and difficulty vocabularies, id stability when editing, sizing, and the relationship to the legacy <resources> XML surface.',
  'render_block',
  $BODY$# Resource Collection (__kind JSON)

You can present a curated, interactive collection of links by emitting a single
JSON object carrying `"__kind": "resource_collection"`. It renders as a
searchable, categorized card grid with per-item type / difficulty / duration /
rating badges, favorite and completed toggles, a live progress meter, print,
full-screen, and canvas expansion — and persists as an editable artifact.
Prefer it whenever you hand the user a set of links (docs, tools, videos,
courses, books) instead of a plain bullet list.

## How to emit a resource collection

Emit ONE JSON object with `"__kind": "resource_collection"`. The system
recognizes it live, fenced or unfenced; a ```json fence is fine for clarity:

```json
{
  "__kind": "resource_collection",
  "title": "TypeScript Learning Path",
  "description": "Everything you need to go from JavaScript to confident TypeScript.",
  "categories": [
    {
      "__kind": "resource_category",
      "name": "Official Documentation",
      "resources": [
        {
          "__kind": "resource_item",
          "title": "TypeScript Handbook",
          "url": "https://www.typescriptlang.org/docs/",
          "description": "The canonical reference, from basics to advanced types.",
          "type": "documentation",
          "difficulty": "beginner",
          "rating": 5
        }
      ]
    }
  ]
}
```

One collection per JSON object. Never wrap it in `<artifact>` tags — the JSON
object IS the artifact.

## When to use it

| User intent | Do this |
|---|---|
| "Give me resources / links to learn X" | A resource_collection — the primary case |
| A reading list, tool list, or curriculum | A resource_collection |
| A study path grouped by topic or medium | One resource_category per group |
| A single link inline in a sentence | No — just write a normal markdown link |
| Structured non-link data (steps, timeline) | No — use the matching block |

## The `__kind` + field structure

**resource_collection** (the root object):

| Field | Type | Required | Notes |
|---|---|---|---|
| `__kind` | string | yes | Must be exactly `"resource_collection"`. |
| `title` | string | yes | The collection title shown in the header. |
| `categories` | array | yes | One or more `resource_category` objects. |
| `description` | string | no | A one-line subtitle under the title. |

**resource_category** (each item in `categories`):

| Field | Type | Required | Notes |
|---|---|---|---|
| `__kind` | string | yes | Must be exactly `"resource_category"`. |
| `name` | string | yes | The collapsible section header. |
| `resources` | array | yes | One or more `resource_item` objects. |
| `description` | string | no | A one-line subtitle under the header. |
| `id` | string | no | Omit — the system synthesizes `category-N`. |

**resource_item** (each item in `resources`):

| Field | Type | Required | Notes |
|---|---|---|---|
| `__kind` | string | yes | Must be exactly `"resource_item"`. |
| `title` | string | yes | The card title. |
| `url` | string | yes | The link the Open button targets. Use a clean, full URL. |
| `description` | string | no | Card body text. Falls back to the title if omitted — always supply one. |
| `type` | string | no | `documentation` \| `tool` \| `video` \| `article` \| `course` \| `book` \| `tutorial` \| `other`. Drives the card icon and the type filter. Defaults to `other`. |
| `duration` | string | no | Free text with a time unit, e.g. `"2 hours"`, `"45 min"`. Shown with a clock badge. |
| `difficulty` | string | no | `beginner` \| `intermediate` \| `advanced`. Colored pill + the level filter. |
| `rating` | number | no | 1-5. Renders as a star row. |
| `tags` | string[] | no | Search keywords (matched by the search box; not shown as chips). |
| `id` | string | no | Omit for new blocks; PRESERVE when editing (see etiquette). |
| `isFavorite` / `isCompleted` | boolean | no | Initial-state seeds; normally omit. |

## Syntax rules that PREVENT render failures

These map to how the block resolves your JSON — break them and cards silently
drop or the whole block falls back to raw text:

1. **`title` and a non-empty `categories` array are mandatory on the root.**
   Missing either drops the WHOLE collection to a raw JSON view.
2. **Every category needs `name` and at least one valid resource.** A category
   with no name, no `resources` array, or only invalid items is silently
   dropped. If every category drops, the whole block does.
3. **Every item needs `title` AND `url`.** An item missing either cannot render
   a card and is dropped.
4. **Use the exact `type` vocabulary.** Unlike the `<resources>` XML parser,
   the JSON path does NOT alias-map (`docs`, `vid`, `guide` are not converted)
   — an unrecognized type renders the generic globe icon. Pick from the eight
   listed values.
5. **`difficulty` must be exactly `beginner`, `intermediate`, or `advanced`**
   for the colored pill; anything else renders unstyled.
6. **`rating` must be 1-5.** The star row fills `rating` of five stars.
7. **Keep all three `__kind` markers** — the collection, EVERY category, and
   EVERY item each carry their own.
8. **Valid JSON only** — double-quoted keys/strings, no trailing commas, no
   comments. Escape any quote inside a string.

## Sizing

Aim for 2-6 categories and 3-10 resources each. The block is searchable and
scrollable, so a large well-grouped collection is fine; a flat list of 40 loose
links is not — group them.

## Editing etiquette

When the user asks you to change a collection, return ONE complete updated
`resource_collection` object — the full block, not a diff:
- Keep every `__kind` marker.
- **Preserve existing `id` values** on categories and items you keep — they are
  the identity behind the user's favorite/completed toggles. New items may omit
  `id`.
- Re-emit every category and resource you intend to keep; an omitted item is a
  deleted item.

## Relationship to the `<resources>` XML surface

The same renderable also accepts a legacy XML form — a `<resources>` tag
wrapping light markdown — taught by the `render-block-resources` skill and the
`resource-collection-block` content block. Both surfaces converge to this same
canonical kind and render the same component. This `__kind` JSON form is the
canonical internal representation; do not mix the two in one block.

## One correct minimal example

```json
{
  "__kind": "resource_collection",
  "title": "Learn SQL Fast",
  "categories": [
    {
      "__kind": "resource_category",
      "name": "Interactive Practice",
      "resources": [
        {
          "__kind": "resource_item",
          "title": "SQLBolt",
          "url": "https://sqlbolt.com/",
          "description": "Hands-on lessons that run queries in the browser.",
          "type": "tutorial",
          "difficulty": "beginner",
          "rating": 5
        },
        {
          "__kind": "resource_item",
          "title": "PostgreSQL Exercises",
          "url": "https://pgexercises.com/",
          "description": "Realistic query problems against a sample dataset.",
          "type": "tool",
          "duration": "6 hours",
          "difficulty": "intermediate",
          "rating": 4
        }
      ]
    }
  ]
}
```
$BODY$,
  'FolderOpen',
  '["web"]'::jsonb,
  '1.0.0',
  '49c845cb-9314-485c-88ed-a7ace4f286ca',
  true,
  false,
  'public',
  '39c38960-d30c-4840-b0c1-c9960de95582',
  0,
  $mtx${"kind":"resource_collection","syntax":"json","activation_gate":"content_ir.kind_definition resource_collection is_active","xml_counterpart_skill":"render-block-resources","xml_counterpart_block":"resource-collection-block"}$mtx$::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM skill.definition
  WHERE skill_id = 'kind_resource_collection'
    AND organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
    AND deleted_at IS NULL
);

-- ---------------------------------------------------------------------------
-- 7. Content blocks — kind-resource-collection-simple / -full under the Agent
--    Skills content-block category. block_id is UNIQUE; the two ids here are
--    NEW and deliberately distinct from the live 'resource-collection' and
--    'resource-collection-block' rows, which this migration never touches.
-- ---------------------------------------------------------------------------

INSERT INTO public.content_blocks
  (block_id, label, description, icon_name, template, sort_order, is_active,
   category_id, organization_id, version, metadata)
VALUES
  (
    'kind-resource-collection-simple',
    'Resource Collection (JSON, simple)',
    'A categorized, searchable collection of links emitted as __kind JSON',
    'FolderOpen',
    $CB$When you hand the user a set of links (docs, tools, videos, courses), emit an interactive resource collection as a single JSON object with "__kind":"resource_collection" instead of a plain bullet list:

```json
{ "__kind": "resource_collection", "title": "Learn SQL Fast", "categories": [
  { "__kind": "resource_category", "name": "Interactive Practice", "resources": [
    { "__kind": "resource_item", "title": "SQLBolt", "url": "https://sqlbolt.com/", "description": "Hands-on lessons in the browser.", "type": "tutorial", "difficulty": "beginner", "rating": 5 }
  ] }
] }
```

Rules: the root needs `title` + a non-empty `categories` array; every category needs `name` + at least one resource; every resource needs `title` + `url` (and should have a `description`). Keep all three `__kind` markers. `type` is one of documentation | tool | video | article | course | book | tutorial | other. Valid JSON, no trailing commas.$CB$,
    10,
    false,
    '2c324058-95e9-4b7e-a991-884f4443eb6e',
    '39c38960-d30c-4840-b0c1-c9960de95582',
    1,
    '{"skill_id":"kind_resource_collection"}'::jsonb
  ),
  (
    'kind-resource-collection-full',
    'Resource Collection (JSON, full)',
    'A resource collection using every field: types, difficulty, duration, ratings, tags',
    'FolderOpen',
    $CB$For a rich, curated learning path or tool directory, emit a resource collection as a single JSON object with "__kind":"resource_collection", using the full per-item metadata so the block's filters, badges, and star ratings light up:

```json
{ "__kind": "resource_collection", "title": "Machine Learning Starter Kit", "description": "From zero to your first trained model.", "categories": [
  { "__kind": "resource_category", "name": "Foundations", "description": "Core concepts before any code.", "resources": [
    { "__kind": "resource_item", "title": "StatQuest: Machine Learning", "url": "https://www.youtube.com/playlist?list=PLblh5JKOoLUICTaGLRoHQDuF_7q2GfuJF", "description": "Short visual explanations of every core ML idea.", "type": "video", "duration": "12 hours", "difficulty": "beginner", "rating": 5, "tags": ["free"] }
  ] },
  { "__kind": "resource_category", "name": "Hands-on", "resources": [
    { "__kind": "resource_item", "title": "Kaggle Learn", "url": "https://www.kaggle.com/learn", "description": "Bite-size interactive courses with instant feedback.", "type": "course", "duration": "4 hours", "difficulty": "beginner", "rating": 4 }
  ] }
] }
```

Rules: `title` + non-empty `categories` on the root; `name` + non-empty `resources` per category; `title` + `url` per item, `description` strongly recommended. `type`: documentation | tool | video | article | course | book | tutorial | other (exact values — no aliases). `difficulty`: beginner | intermediate | advanced. `rating`: 1-5. `duration`: free text with a time unit ("2 hours", "45 min"). `tags` feed search. Aim for 2-6 categories of 3-10 items. Keep every `__kind` marker; valid JSON only.$CB$,
    11,
    false,
    '2c324058-95e9-4b7e-a991-884f4443eb6e',
    '39c38960-d30c-4840-b0c1-c9960de95582',
    1,
    '{"skill_id":"kind_resource_collection"}'::jsonb
  )
ON CONFLICT (block_id) DO UPDATE SET
  label        = EXCLUDED.label,
  description  = EXCLUDED.description,
  icon_name    = EXCLUDED.icon_name,
  template     = EXCLUDED.template,
  sort_order   = EXCLUDED.sort_order,
  is_active    = EXCLUDED.is_active,
  category_id  = EXCLUDED.category_id,
  metadata     = EXCLUDED.metadata,
  updated_at   = now();

COMMIT;
