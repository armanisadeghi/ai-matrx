-- ============================================================================
-- content-ir kind `structured_info` — full fleet package (definition family +
-- edges + examples + surface + component + skill + content blocks).
--
-- The canonical Shape behind the ```structured_info fence (legacy component:
-- StructuredPlanBlock, components/mardown-display/blocks/plan/ — a collapsible
-- "Structured Information" card whose stat parser counts **bold** runs as
-- sections and asterisk-led lines as bullets). The kind names that implied
-- structure explicitly:
--   structured_info          — title + optional description + sections[]
--   structured_info_section  — heading + optional body + items[]
--   structured_info_item     — text + optional label (key-value bullets)
--
-- data[] / kind_edge / emitted_json_schema are CONVERTER-EMITTED (never
-- hand-written): kindSchemaToStorage + kindSchemaToJsonSchema({strict:true,
-- injectKind:false}) over the schemas in
-- features/content-ir/kinds/structured-info.ts — the stored flashcard_set
-- precedent (emitted schema is SOURCE-shaped: strict, no __kind; the dual
-- gate strips __kind from samples before validating).
--
-- kind_example payloads are the EXACT fixtures proven green by
-- features/content-ir/__tests__/kind-structured-info.test.ts against
-- validateStructuralLeg (the real activation ajv config) — validation_status
-- 'passed' is earned, not asserted.
--
-- is_active stays FALSE on all three kind_definition rows: activation is the
-- central integration pass's call (dual gate + resolver wiring), expected.
-- The fence-finalize host hook does not exist yet (XML only today) — the
-- kind_surface row is the correct forward registration; convergence lands in
-- the integration pass.
--
-- Idempotent on business keys; content blocks NEVER clobber (insert-only).
-- ============================================================================

BEGIN;

-- ── 1. kind_definition — structured_info + children ─────────────────────────

-- NOTE: content_ir.kind_definition has NO description column — per-kind prose
-- rides metadata.description (verified against the live schema at apply time).

insert into content_ir.kind_definition
  (kind, label, authoring_owner, data, emitted_json_schema, is_active, visibility, organization_id, metadata)
select
  'structured_info',
  'Structured Info',
  'ts',
  $mtx$[{"name":"title","required":true,"type":"string"},{"name":"description","type":"string"},{"name":"sections","required":true,"type":"array"}]$mtx$::jsonb,
  $mtx${"type":"object","properties":{"title":{"type":"string"},"description":{"type":"string"},"sections":{"type":"array","items":{"$ref":"#/$defs/structured_info_section"}}},"required":["title","sections"],"additionalProperties":false,"$defs":{"structured_info_section":{"type":"object","properties":{"heading":{"type":"string"},"body":{"type":"string"},"items":{"type":"array","items":{"$ref":"#/$defs/structured_info_item"}}},"required":["heading"],"additionalProperties":false},"structured_info_item":{"type":"object","properties":{"label":{"type":"string"},"text":{"type":"string"}},"required":["text"],"additionalProperties":false}}}$mtx$::jsonb,
  false, 'public', '39c38960-d30c-4840-b0c1-c9960de95582',
  $mtx${"category":"pure","legacy_block_type":"structured_info","description":"Organized reference/summary document: a title, an optional intro, and labelled sections of bullet items. Canonical kind behind the legacy structured_info fence (StructuredPlanBlock)."}$mtx$::jsonb
where not exists (select 1 from content_ir.kind_definition where organization_id='39c38960-d30c-4840-b0c1-c9960de95582' and kind='structured_info' and deleted_at is null);

insert into content_ir.kind_definition
  (kind, label, authoring_owner, data, emitted_json_schema, is_active, visibility, organization_id, metadata)
select
  'structured_info_section',
  'Structured Info Section',
  'ts',
  $mtx$[{"name":"heading","required":true,"type":"string"},{"name":"body","type":"string"},{"name":"items","type":"array"}]$mtx$::jsonb,
  $mtx${"type":"object","properties":{"heading":{"type":"string"},"body":{"type":"string"},"items":{"type":"array","items":{"$ref":"#/$defs/structured_info_item"}}},"required":["heading"],"additionalProperties":false,"$defs":{"structured_info_item":{"type":"object","properties":{"label":{"type":"string"},"text":{"type":"string"}},"required":["text"],"additionalProperties":false}}}$mtx$::jsonb,
  false, 'public', '39c38960-d30c-4840-b0c1-c9960de95582',
  $mtx${"category":"pure","description":"One labelled section of a structured_info document: a heading (rendered as a bold run), an optional body paragraph, and bullet items."}$mtx$::jsonb
where not exists (select 1 from content_ir.kind_definition where organization_id='39c38960-d30c-4840-b0c1-c9960de95582' and kind='structured_info_section' and deleted_at is null);

insert into content_ir.kind_definition
  (kind, label, authoring_owner, data, emitted_json_schema, is_active, visibility, organization_id, metadata)
select
  'structured_info_item',
  'Structured Info Item',
  'ts',
  $mtx$[{"name":"label","type":"string"},{"name":"text","required":true,"type":"string"}]$mtx$::jsonb,
  $mtx${"type":"object","properties":{"label":{"type":"string"},"text":{"type":"string"}},"required":["text"],"additionalProperties":false}$mtx$::jsonb,
  false, 'public', '39c38960-d30c-4840-b0c1-c9960de95582',
  $mtx${"category":"pure","description":"One bullet of a structured_info section: text, with an optional label for the key-value convention (Backend: Priya)."}$mtx$::jsonb
where not exists (select 1 from content_ir.kind_definition where organization_id='39c38960-d30c-4840-b0c1-c9960de95582' and kind='structured_info_item' and deleted_at is null);

-- ── 2. kind_edge — converter-emitted ref graph ──────────────────────────────
-- structured_info.sections → structured_info_section (position 0)
-- structured_info_section.items → structured_info_item (position 0)

insert into content_ir.kind_edge (parent_definition_id, field_name, child_definition_id, position, organization_id)
select p.id, 'sections', c.id, 0, '39c38960-d30c-4840-b0c1-c9960de95582'
from content_ir.kind_definition p, content_ir.kind_definition c
where p.organization_id='39c38960-d30c-4840-b0c1-c9960de95582' and p.kind='structured_info' and p.deleted_at is null
  and c.organization_id='39c38960-d30c-4840-b0c1-c9960de95582' and c.kind='structured_info_section' and c.deleted_at is null
  and not exists (
    select 1 from content_ir.kind_edge e
    where e.parent_definition_id=p.id and e.field_name='sections' and e.child_definition_id=c.id and e.deleted_at is null);

insert into content_ir.kind_edge (parent_definition_id, field_name, child_definition_id, position, organization_id)
select p.id, 'items', c.id, 0, '39c38960-d30c-4840-b0c1-c9960de95582'
from content_ir.kind_definition p, content_ir.kind_definition c
where p.organization_id='39c38960-d30c-4840-b0c1-c9960de95582' and p.kind='structured_info_section' and p.deleted_at is null
  and c.organization_id='39c38960-d30c-4840-b0c1-c9960de95582' and c.kind='structured_info_item' and c.deleted_at is null
  and not exists (
    select 1 from content_ir.kind_edge e
    where e.parent_definition_id=p.id and e.field_name='items' and e.child_definition_id=c.id and e.deleted_at is null);

-- ── 3. kind_example — 2 examples, first canonical ───────────────────────────
-- Both payloads passed validateStructuralLeg (real ajv over the emitted
-- schema, __kind stripped) in kind-structured-info.test.ts before this file
-- was applied.

insert into content_ir.kind_example
  (kind_definition_id, kind_version, data, label, description, source, is_canonical, validation_status, validated_at, organization_id)
select kd.id, kd.version,
  $mtx${"__kind":"structured_info","title":"Project Atlas Migration — Status Brief","description":"Point-in-time summary of the billing migration off the legacy monolith.","sections":[{"__kind":"structured_info_section","heading":"Goal","items":[{"__kind":"structured_info_item","text":"Move billing off the legacy monolith by Q3."},{"__kind":"structured_info_item","text":"Zero customer-visible downtime."}]},{"__kind":"structured_info_section","heading":"Owners","items":[{"__kind":"structured_info_item","label":"Backend","text":"Priya"},{"__kind":"structured_info_item","label":"Frontend","text":"Marco"},{"__kind":"structured_info_item","label":"QA","text":"Dana"}]},{"__kind":"structured_info_section","heading":"Open risks","body":"Both risks are tracked in the RAID log.","items":[{"__kind":"structured_info_item","text":"Data backfill window is tight."},{"__kind":"structured_info_item","text":"Third-party webhook contract is unversioned."}]}]}$mtx$::jsonb,
  'Project status brief (canonical)',
  'Full shape: title, intro description, plain bullets, key-value (label) bullets, and a section body paragraph.',
  'authored', true, 'passed', now(), '39c38960-d30c-4840-b0c1-c9960de95582'
from content_ir.kind_definition kd
where kd.organization_id='39c38960-d30c-4840-b0c1-c9960de95582' and kd.kind='structured_info' and kd.deleted_at is null
  and not exists (
    select 1 from content_ir.kind_example e
    where e.kind_definition_id=kd.id and e.label='Project status brief (canonical)' and e.deleted_at is null);

insert into content_ir.kind_example
  (kind_definition_id, kind_version, data, label, description, source, is_canonical, validation_status, validated_at, organization_id)
select kd.id, kd.version,
  $mtx${"__kind":"structured_info","title":"Team Sync — Decisions and Actions","sections":[{"__kind":"structured_info_section","heading":"Decisions","items":[{"__kind":"structured_info_item","text":"Ship the beta behind a feature flag."}]},{"__kind":"structured_info_section","heading":"Action items","items":[{"__kind":"structured_info_item","label":"Owner","text":"Sam drafts the rollout checklist by Friday."}]}]}$mtx$::jsonb,
  'Meeting notes (minimal)',
  'Minimal shape: title + two sections, no description, one labelled item.',
  'authored', false, 'passed', now(), '39c38960-d30c-4840-b0c1-c9960de95582'
from content_ir.kind_definition kd
where kd.organization_id='39c38960-d30c-4840-b0c1-c9960de95582' and kd.kind='structured_info' and kd.deleted_at is null
  and not exists (
    select 1 from content_ir.kind_example e
    where e.kind_definition_id=kd.id and e.label='Meeting notes (minimal)' and e.deleted_at is null);

-- ── 4. kind_surface — the ```structured_info fence arrival form ─────────────
-- Named strategy implemented at
-- features/content-ir/surfaces/structured-info-legacy-text.ts. The fence-
-- finalize host hook does not exist yet (XML only today); this row is the
-- forward registration the integration pass consumes.

insert into content_ir.kind_surface
  (kind_definition_id, surface_type, token, parser_strategy, streaming, organization_id, metadata)
select kd.id, 'fence_lang', 'structured_info', 'structured_info_legacy_text', true,
  '39c38960-d30c-4840-b0c1-c9960de95582',
  '{"host_hook":"pending_fence_finalize"}'::jsonb
from content_ir.kind_definition kd
where kd.organization_id='39c38960-d30c-4840-b0c1-c9960de95582' and kd.kind='structured_info' and kd.deleted_at is null
  and not exists (
    select 1 from content_ir.kind_surface s
    where s.surface_type='fence_lang' and s.token='structured_info' and s.deleted_at is null);

-- ── 5. kind_component — web output renderer (the legacyBlockType facade) ────

insert into content_ir.kind_component
  (kind_definition_id, platform, role, component_key, source, organization_id, metadata)
select kd.id, 'web', 'output', 'structured_info', 'bundled',
  '39c38960-d30c-4840-b0c1-c9960de95582',
  '{"component":"StructuredPlanBlock","module":"components/mardown-display/blocks/plan/StructuredPlanBlock.tsx"}'::jsonb
from content_ir.kind_definition kd
where kd.organization_id='39c38960-d30c-4840-b0c1-c9960de95582' and kd.kind='structured_info' and kd.deleted_at is null
  and not exists (
    select 1 from content_ir.kind_component c
    where c.kind_definition_id=kd.id and c.platform='web' and c.role='output' and c.component_key='structured_info' and c.deleted_at is null);

-- ── 6. Skill: kind_structured_info (JSON syntax; fence skill is counterpart) ─
-- skill.definition has composite scoping (no simple unique on skill_id) →
-- WHERE NOT EXISTS on the global business key; a follow-up UPDATE keeps the
-- body fresh on re-apply.

insert into skill.definition
  (skill_id, label, description, skill_type, body, icon_name,
   is_active, is_system, visibility, category_id, sort_order, version,
   platform_targets, organization_id)
select
  'kind_structured_info',
  'Structured Info (JSON kind)',
  'How and when to emit a structured_info render block as canonical "__kind" JSON: title + sections of bullet items (with key-value labels), the exact field shapes, rules that prevent dropped blocks, and editing etiquette. JSON counterpart of the structured-info-blocks fence skill.',
  'render_block',
  $SKILL_BODY$# Structured Info (JSON kind)

You can present well-organized reference or summary content as a **structured
info** block by emitting a single JSON object marked with
`"__kind": "structured_info"`. It renders as the platform's collapsible
"Structured Information" card — a title, labelled sections, and scannable
bullet points, with a one-click Copy All button and a stat line (sections,
bullet points, words) — and persists as a versioned artifact the user can
reopen, copy, and edit later.

This is the CANONICAL JSON form of the same renderable the
```structured_info markdown fence produces (see the counterpart skill
`structured-info-blocks`). Both arrive at the identical card; prefer this
JSON form when you are producing structured data anyway (extraction,
profiles, briefs assembled from fields) — the structure survives as data
instead of being flattened into prose.

## When to use it

Reach for `structured_info` when the user asks you to organize, summarize,
brief, or lay out facts they will scan, copy, or refer back to:

- a project brief or status summary
- a requirements or spec digest
- a person / company / product profile ("here's everything about X")
- meeting notes with decisions and owners
- a structured answer to a multi-part question

Choose a different block when the content is really something else: a
step-by-step plan to execute (tasks), a verbatim conversation (transcript),
side-by-side option scoring (comparison_set), recall drilling
(flashcard_set), or a visual process/hierarchy (diagram_spec / mermaid).

## How to emit one

Emit ONE JSON object. It may sit inside a ```json fence for clarity or stand
bare in the message — the pipeline recognizes `"__kind": "structured_info"`
either way. No wrapper tags, no front matter:

```json
{
  "__kind": "structured_info",
  "title": "Project Atlas Migration — Status Brief",
  "description": "Point-in-time summary of the billing migration.",
  "sections": [
    {
      "__kind": "structured_info_section",
      "heading": "Goal",
      "items": [
        { "__kind": "structured_info_item", "text": "Move billing off the legacy monolith by Q3." },
        { "__kind": "structured_info_item", "text": "Zero customer-visible downtime." }
      ]
    },
    {
      "__kind": "structured_info_section",
      "heading": "Owners",
      "items": [
        { "__kind": "structured_info_item", "label": "Backend", "text": "Priya" },
        { "__kind": "structured_info_item", "label": "Frontend", "text": "Marco" }
      ]
    }
  ]
}
```

## The root shape (`structured_info`)

| Field | Type | Required | Notes |
|---|---|---|---|
| `__kind` | string | yes | Always the literal `"structured_info"`. |
| `title` | string | yes | The document heading. Never empty. |
| `description` | string | no | One short intro paragraph shown before the first section. |
| `sections` | array | yes | One or more section objects, in display order. |

## Sections (`structured_info_section`)

| Field | Type | Required | Notes |
|---|---|---|---|
| `__kind` | string | yes | Always `"structured_info_section"`. |
| `heading` | string | yes | The section title (rendered bold; counted in the stat line). |
| `body` | string | no | A short paragraph under the heading, before the bullets. |
| `items` | array | no | The section's bullet points. |

## Items (`structured_info_item`)

| Field | Type | Required | Notes |
|---|---|---|---|
| `__kind` | string | yes | Always `"structured_info_item"`. |
| `text` | string | yes | The bullet text (or the value half of a key-value pair). |
| `label` | string | no | The key half of a key-value bullet — renders as `Label: text` with the label bold. |

Use `label` for facts with a named slot (owner, status, deadline, metric);
use plain `text` for prose points. Mix freely within one section.

## Rules that prevent dropped blocks

1. It must be VALID JSON — double-quoted keys and strings, no trailing
   commas, no comments. One malformed object drops the whole block.
2. Every object carries its own `__kind` — the root AND every section AND
   every item. A missing child `__kind` demotes that node.
3. `title` (root), `heading` (section), and `text` (item) are required and
   non-empty. A section with no heading fails validation.
4. Stick to the declared fields. Extra keys are not silently lost (they
   surface under "Additional details"), but they are not part of the shape —
   if a fact matters, give it a labelled item instead.
5. Emit ONE `structured_info` object per block. For a second document, emit
   a second block.

## Sizing

- 2-8 sections is the sweet spot; more becomes a wall.
- Up to ~10 items per section; split a longer list into two sections.
- Keep `text` to one line where possible; use `body` for the one paragraph
  a section genuinely needs.
- `description` is one or two sentences, not an essay.

## Editing etiquette

When the user asks for a change, return ONE complete updated
`structured_info` block — never a diff or a fragment. Keep `__kind` on every
object, preserve the existing section order unless asked to reorder, and
carry unchanged sections through verbatim.

## Minimal example

```json
{
  "__kind": "structured_info",
  "title": "Team Sync — Decisions and Actions",
  "sections": [
    {
      "__kind": "structured_info_section",
      "heading": "Decisions",
      "items": [
        { "__kind": "structured_info_item", "text": "Ship the beta behind a feature flag." }
      ]
    },
    {
      "__kind": "structured_info_section",
      "heading": "Action items",
      "items": [
        { "__kind": "structured_info_item", "label": "Owner", "text": "Sam drafts the rollout checklist by Friday." }
      ]
    }
  ]
}
```
$SKILL_BODY$,
  'AlignLeft',
  true, true, 'public',
  '49c845cb-9314-485c-88ed-a7ace4f286ca',
  0, 1,
  '["web"]'::jsonb,
  '39c38960-d30c-4840-b0c1-c9960de95582'
where not exists (
  select 1 from skill.definition d
  where d.skill_id='kind_structured_info' and d.organization_id='39c38960-d30c-4840-b0c1-c9960de95582'
    and d.project_id is null and d.task_id is null and d.deleted_at is null);

-- Keep description fresh on re-apply (the guard above only inserts once).
update skill.definition d
set description = 'How and when to emit a structured_info render block as canonical "__kind" JSON: title + sections of bullet items (with key-value labels), the exact field shapes, rules that prevent dropped blocks, and editing etiquette. JSON counterpart of the structured-info-blocks fence skill.',
    updated_at = now()
where d.skill_id='kind_structured_info' and d.organization_id='39c38960-d30c-4840-b0c1-c9960de95582'
  and d.project_id is null and d.task_id is null and d.deleted_at is null;

-- ── 7. Content blocks — NEVER clobber (insert-only, no ON CONFLICT UPDATE) ──
-- Category 2c324058-… = "Agent Skills" (shortcut dimension, content-block
-- placement). metadata.skill_id pairs each block with the skill above.

insert into public.content_blocks
  (block_id, label, description, icon_name, template, category_id, sort_order, is_active, organization_id, metadata)
select
  'kind-structured-info-simple',
  'Structured Info (Simple)',
  'Emit a structured_info "__kind" JSON block: title + sections of bullet items.',
  'AlignLeft',
  $CB1$Present organized reference or summary content as a structured_info block — one JSON object, fenced or bare:

```json
{
  "__kind": "structured_info",
  "title": "Team Sync — Decisions and Actions",
  "sections": [
    { "__kind": "structured_info_section", "heading": "Decisions",
      "items": [ { "__kind": "structured_info_item", "text": "Ship the beta behind a feature flag." } ] }
  ]
}
```

Rules:
- Valid JSON; every object carries its own "__kind".
- Required: title (root), heading (each section), text (each item).
- 2-8 sections; one structured_info object per block.$CB1$,
  '2c324058-95e9-4b7e-a991-884f4443eb6e',
  0, true,
  '39c38960-d30c-4840-b0c1-c9960de95582',
  '{"skill_id":"kind_structured_info"}'::jsonb
where not exists (select 1 from public.content_blocks b where b.block_id='kind-structured-info-simple' and b.deleted_at is null);

insert into public.content_blocks
  (block_id, label, description, icon_name, template, category_id, sort_order, is_active, organization_id, metadata)
select
  'kind-structured-info-full',
  'Structured Info (Full)',
  'Emit a full structured_info "__kind" JSON block: intro description, key-value labelled items, and section body paragraphs.',
  'AlignLeft',
  $CB2$Present a rich brief/profile/summary as a structured_info block — one JSON object, fenced or bare:

```json
{
  "__kind": "structured_info",
  "title": "Project Atlas — Status Brief",
  "description": "Point-in-time summary of the migration.",
  "sections": [
    { "__kind": "structured_info_section", "heading": "Owners",
      "items": [ { "__kind": "structured_info_item", "label": "Backend", "text": "Priya" } ] },
    { "__kind": "structured_info_section", "heading": "Open risks",
      "body": "Both risks are tracked in the RAID log.",
      "items": [ { "__kind": "structured_info_item", "text": "Data backfill window is tight." } ] }
  ]
}
```

Rules:
- Valid JSON; every object carries its own "__kind".
- Required: title, heading per section, text per item; label is the optional key half of a key-value bullet.
- Use description for a 1-2 sentence intro; body for the one paragraph a section needs.
- Return ONE complete updated block when editing.$CB2$,
  '2c324058-95e9-4b7e-a991-884f4443eb6e',
  1, true,
  '39c38960-d30c-4840-b0c1-c9960de95582',
  '{"skill_id":"kind_structured_info"}'::jsonb
where not exists (select 1 from public.content_blocks b where b.block_id='kind-structured-info-full' and b.deleted_at is null);

COMMIT;
