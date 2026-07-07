-- kind_progress_tracker_full.sql — the full Shape System package for the
-- PROGRESS TRACKER renderable (components/mardown-display/blocks/progress/):
--   kind_definition x3 (progress_tracker + progress_phase + progress_step,
--   ts-owned, is_active=false until integration) · kind_edge x2 ·
--   kind_example x2 (canonical first; REAL ajv validation via
--   validateStructuralLeg in features/content-ir/__tests__/
--   kind-progress-tracker.test.ts) · kind_surface (xml_tag/progress_tracker,
--   is_active=false until progress_tracker_legacy_text is registered in
--   surfaces/xml-finalize.ts) · kind_component (web/output →
--   legacyBlockType "progress_tracker") · skill kind_progress_tracker
--   (render_block, JSON syntax; XML counterpart = existing skill
--   "progress-tracker") · 2 content blocks under the Agent Skills category.
--
-- `data` and `emitted_json_schema` are CONVERTER-EMITTED (kindSchemaToStorage
-- + kindSchemaToJsonSchema {strict:true, injectKind:false}) from the
-- KindSchemas in features/content-ir/kinds/progress-tracker.ts — never
-- hand-written. Idempotent on business keys; coexist-not-clobber (the live
-- legacy skill/blocks are untouched; content blocks use ON CONFLICT DO
-- NOTHING).

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. kind_definition — progress_step (leaf first so edges can resolve)
-- ---------------------------------------------------------------------------

insert into content_ir.kind_definition
  (kind, label, authoring_owner, data, emitted_json_schema, is_active, visibility, organization_id)
select
  'progress_step',
  'Progress Step',
  'ts',
  $mtx$[{"name":"id","type":"string"},{"name":"text","required":true,"type":"string"},{"name":"completed","required":true,"type":"boolean"},{"name":"optional","type":"boolean"},{"name":"priority","type":"enum","values":["low","medium","high"]},{"name":"estimated_hours","type":"number"},{"name":"category","type":"string"}]$mtx$::jsonb,
  $mtx${"type":"object","properties":{"id":{"type":"string"},"text":{"type":"string"},"completed":{"type":"boolean"},"optional":{"type":"boolean"},"priority":{"type":"string","enum":["low","medium","high"]},"estimated_hours":{"type":"number"},"category":{"type":"string"}},"required":["text","completed"],"additionalProperties":false}$mtx$::jsonb,
  false,
  'public',
  '39c38960-d30c-4840-b0c1-c9960de95582'
where not exists (
  select 1 from content_ir.kind_definition
  where organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
    and kind = 'progress_step' and deleted_at is null
);

-- ---------------------------------------------------------------------------
-- 2. kind_definition — progress_phase
-- ---------------------------------------------------------------------------

insert into content_ir.kind_definition
  (kind, label, authoring_owner, data, emitted_json_schema, is_active, visibility, organization_id)
select
  'progress_phase',
  'Progress Phase',
  'ts',
  $mtx$[{"name":"id","type":"string"},{"name":"name","required":true,"type":"string"},{"name":"description","type":"string"},{"name":"color","type":"string"},{"name":"completion_percentage","type":"number"},{"name":"steps","required":true,"type":"array"}]$mtx$::jsonb,
  $mtx${"type":"object","properties":{"id":{"type":"string"},"name":{"type":"string"},"description":{"type":"string"},"color":{"type":"string"},"completion_percentage":{"type":"number"},"steps":{"type":"array","items":{"$ref":"#/$defs/progress_step"}}},"required":["name","steps"],"additionalProperties":false,"$defs":{"progress_step":{"type":"object","properties":{"id":{"type":"string"},"text":{"type":"string"},"completed":{"type":"boolean"},"optional":{"type":"boolean"},"priority":{"type":"string","enum":["low","medium","high"]},"estimated_hours":{"type":"number"},"category":{"type":"string"}},"required":["text","completed"],"additionalProperties":false}}}$mtx$::jsonb,
  false,
  'public',
  '39c38960-d30c-4840-b0c1-c9960de95582'
where not exists (
  select 1 from content_ir.kind_definition
  where organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
    and kind = 'progress_phase' and deleted_at is null
);

-- ---------------------------------------------------------------------------
-- 3. kind_definition — progress_tracker (root)
-- ---------------------------------------------------------------------------

insert into content_ir.kind_definition
  (kind, label, authoring_owner, data, emitted_json_schema, is_active, visibility, organization_id)
select
  'progress_tracker',
  'Progress Tracker',
  'ts',
  $mtx$[{"name":"title","required":true,"type":"string"},{"name":"description","type":"string"},{"name":"phases","required":true,"type":"array"},{"name":"overall_progress","type":"number"},{"name":"start_date","type":"string"},{"name":"target_date","type":"string"},{"name":"total_items","type":"number"},{"name":"completed_items","type":"number"}]$mtx$::jsonb,
  $mtx${"type":"object","properties":{"title":{"type":"string"},"description":{"type":"string"},"phases":{"type":"array","items":{"$ref":"#/$defs/progress_phase"}},"overall_progress":{"type":"number"},"start_date":{"type":"string"},"target_date":{"type":"string"},"total_items":{"type":"number"},"completed_items":{"type":"number"}},"required":["title","phases"],"additionalProperties":false,"$defs":{"progress_phase":{"type":"object","properties":{"id":{"type":"string"},"name":{"type":"string"},"description":{"type":"string"},"color":{"type":"string"},"completion_percentage":{"type":"number"},"steps":{"type":"array","items":{"$ref":"#/$defs/progress_step"}}},"required":["name","steps"],"additionalProperties":false},"progress_step":{"type":"object","properties":{"id":{"type":"string"},"text":{"type":"string"},"completed":{"type":"boolean"},"optional":{"type":"boolean"},"priority":{"type":"string","enum":["low","medium","high"]},"estimated_hours":{"type":"number"},"category":{"type":"string"}},"required":["text","completed"],"additionalProperties":false}}}$mtx$::jsonb,
  false,
  'public',
  '39c38960-d30c-4840-b0c1-c9960de95582'
where not exists (
  select 1 from content_ir.kind_definition
  where organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
    and kind = 'progress_tracker' and deleted_at is null
);

-- ---------------------------------------------------------------------------
-- 4. kind_edge — progress_tracker.phases → progress_phase;
--                progress_phase.steps → progress_step
--    (position 0: single-member itemKinds unions, kindSchemaToStorage order)
-- ---------------------------------------------------------------------------

insert into content_ir.kind_edge
  (parent_definition_id, field_name, child_definition_id, position, organization_id)
select parent.id, 'phases', child.id, 0, '39c38960-d30c-4840-b0c1-c9960de95582'
from content_ir.kind_definition parent, content_ir.kind_definition child
where parent.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
  and parent.kind = 'progress_tracker' and parent.deleted_at is null
  and child.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
  and child.kind = 'progress_phase' and child.deleted_at is null
  and not exists (
    select 1 from content_ir.kind_edge e
    where e.parent_definition_id = parent.id
      and e.field_name = 'phases'
      and e.child_definition_id = child.id
      and e.deleted_at is null
  );

insert into content_ir.kind_edge
  (parent_definition_id, field_name, child_definition_id, position, organization_id)
select parent.id, 'steps', child.id, 0, '39c38960-d30c-4840-b0c1-c9960de95582'
from content_ir.kind_definition parent, content_ir.kind_definition child
where parent.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
  and parent.kind = 'progress_phase' and parent.deleted_at is null
  and child.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
  and child.kind = 'progress_step' and child.deleted_at is null
  and not exists (
    select 1 from content_ir.kind_edge e
    where e.parent_definition_id = parent.id
      and e.field_name = 'steps'
      and e.child_definition_id = child.id
      and e.deleted_at is null
  );

-- ---------------------------------------------------------------------------
-- 5. kind_example — canonical (simple-variant shape) + full-union example.
--    Both passed the REAL structural leg (ajv over emitted_json_schema via
--    validateStructuralLeg) in kind-progress-tracker.test.ts before this
--    file was written — validation_status 'passed' is earned, not asserted.
-- ---------------------------------------------------------------------------

insert into content_ir.kind_example
  (kind_definition_id, kind_version, data, label, source, is_canonical, validation_status, validated_at, organization_id)
select
  kd.id, kd.version,
  $mtx${"__kind":"progress_tracker","title":"Learning Progress","phases":[{"__kind":"progress_phase","name":"React Fundamentals","completion_percentage":60,"steps":[{"__kind":"progress_step","text":"Components & JSX","completed":true},{"__kind":"progress_step","text":"Props & State","completed":true},{"__kind":"progress_step","text":"Event Handling","completed":true},{"__kind":"progress_step","text":"Lifecycle Methods","completed":false},{"__kind":"progress_step","text":"Hooks","completed":false}]},{"__kind":"progress_phase","name":"Advanced Topics","completion_percentage":25,"steps":[{"__kind":"progress_step","text":"Context API","completed":true},{"__kind":"progress_step","text":"Performance Optimization","completed":false},{"__kind":"progress_step","text":"Testing","completed":false},{"__kind":"progress_step","text":"Custom Hooks","completed":false}]}]}$mtx$::jsonb,
  'Learning progress (canonical, simple variant)',
  'authored', true, 'passed', now(),
  '39c38960-d30c-4840-b0c1-c9960de95582'
from content_ir.kind_definition kd
where kd.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
  and kd.kind = 'progress_tracker' and kd.deleted_at is null
  and not exists (
    select 1 from content_ir.kind_example e
    where e.kind_definition_id = kd.id and e.is_canonical and e.deleted_at is null
  );

insert into content_ir.kind_example
  (kind_definition_id, kind_version, data, label, source, is_canonical, validation_status, validated_at, organization_id)
select
  kd.id, kd.version,
  $mtx${"__kind":"progress_tracker","title":"Q4 Platform Launch","description":"Everything required to ship the platform by end of quarter.","start_date":"2026-10-01","target_date":"2026-12-19","overall_progress":33,"total_items":6,"completed_items":2,"phases":[{"__kind":"progress_phase","id":"phase-build","name":"Core Build","description":"Engineering workstream for the launch-blocking features.","color":"from-blue-500 to-blue-600","completion_percentage":50,"steps":[{"__kind":"progress_step","id":"step-auth","text":"Ship authentication flow","completed":true,"priority":"high","estimated_hours":12},{"__kind":"progress_step","id":"step-billing","text":"Integrate billing provider","completed":true,"priority":"high","estimated_hours":8},{"__kind":"progress_step","id":"step-realtime","text":"Realtime sync hardening","completed":false,"priority":"medium","estimated_hours":16,"category":"Infrastructure"},{"__kind":"progress_step","id":"step-docs","text":"Developer documentation pass","completed":false,"priority":"low","estimated_hours":6,"optional":true}]},{"__kind":"progress_phase","id":"phase-launch","name":"Launch Readiness","completion_percentage":0,"steps":[{"__kind":"progress_step","id":"step-loadtest","text":"Load test at 10x projected traffic","completed":false,"priority":"high","estimated_hours":10},{"__kind":"progress_step","id":"step-runbook","text":"Incident runbook review","completed":false,"priority":"medium","estimated_hours":3}]}]}$mtx$::jsonb,
  'Q4 launch (full union: notes, timestamps, priorities, hours, optional, ids)',
  'authored', false, 'passed', now(),
  '39c38960-d30c-4840-b0c1-c9960de95582'
from content_ir.kind_definition kd
where kd.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
  and kd.kind = 'progress_tracker' and kd.deleted_at is null
  and not exists (
    select 1 from content_ir.kind_example e
    where e.kind_definition_id = kd.id
      and e.label like 'Q4 launch%' and e.deleted_at is null
  );

-- ---------------------------------------------------------------------------
-- 6. kind_surface — xml_tag/progress_tracker → progress_tracker_legacy_text.
--    is_active=false ON PURPOSE: the strategy ships in
--    surfaces/progress-tracker-legacy-text.ts but is not yet registered in
--    surfaces/xml-finalize.ts SURFACE_PARSER_STRATEGIES; an active row would
--    make every deployed build scream "strategy not implemented" on every
--    <progress_tracker> region (loud fail-open). Flip active at integration.
-- ---------------------------------------------------------------------------

insert into content_ir.kind_surface
  (kind_definition_id, surface_type, token, parser_strategy, streaming, is_active, organization_id, metadata)
select
  kd.id, 'xml_tag', 'progress_tracker', 'progress_tracker_legacy_text', true, false,
  '39c38960-d30c-4840-b0c1-c9960de95582',
  $mtx${"activation_note":"flip is_active only after progress_tracker_legacy_text is registered in features/content-ir/surfaces/xml-finalize.ts"}$mtx$::jsonb
from content_ir.kind_definition kd
where kd.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
  and kd.kind = 'progress_tracker' and kd.deleted_at is null
  and not exists (
    select 1 from content_ir.kind_surface s
    where s.surface_type = 'xml_tag' and s.token = 'progress_tracker'
      and s.deleted_at is null
  );

-- ---------------------------------------------------------------------------
-- 7. kind_component — web/output → the legacy block type (R1 resolver row).
-- ---------------------------------------------------------------------------

insert into content_ir.kind_component
  (kind_definition_id, platform, role, component_key, source, config, is_default, organization_id)
select
  kd.id, 'web', 'output', 'progress_tracker', 'bundled',
  $mtx${"legacyBlockType":"progress_tracker"}$mtx$::jsonb,
  true,
  '39c38960-d30c-4840-b0c1-c9960de95582'
from content_ir.kind_definition kd
where kd.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
  and kd.kind = 'progress_tracker' and kd.deleted_at is null
  and not exists (
    select 1 from content_ir.kind_component c
    where c.kind_definition_id = kd.id
      and c.platform = 'web' and c.role = 'output' and c.deleted_at is null
  );

-- ---------------------------------------------------------------------------
-- 8. skill.definition — kind_progress_tracker (render_block, JSON syntax).
--    Coexists with the live XML-syntax skill "progress-tracker" (cited in
--    the body as the counterpart); never clobbers it.
-- ---------------------------------------------------------------------------

insert into skill.definition
  (skill_id, label, description, skill_type, body, icon_name, platform_targets, semver, category_id, is_active, is_system, organization_id, visibility)
select
  'kind_progress_tracker',
  'Progress Tracker (__kind)',
  'Emit a structured progress tracker (phases, checklist steps, statuses, percentages, dates, notes) as canonical __kind JSON that renders as the interactive Progress Tracker block.',
  'render_block',
  $SKL$# Progress Tracker — `__kind` JSON render block

Emit ONE JSON object carrying `"__kind": "progress_tracker"` and it renders live as the interactive Progress Tracker block (checklists grouped into phases, per-phase progress bars, overall stats, priority/time chips, import-to-tasks, canvas, print). The same component also renders the `<progress_tracker>` XML/markdown block — that syntax is taught by the separate `progress-tracker` skill; this skill is its structured-JSON counterpart. Prefer this JSON form when the tracker is produced or edited programmatically, when steps carry metadata (priorities, hours, ids), or when the output feeds workflow I/O.

## When to use it

- Project / launch plans with phases and checkable steps
- Learning paths and skill checklists with completion tracking
- Any "how far along are we" answer where the user should be able to tick items off

## Structure

```json
{
  "__kind": "progress_tracker",
  "title": "Q4 Platform Launch",
  "description": "Everything required to ship by end of quarter.",
  "start_date": "2026-10-01",
  "target_date": "2026-12-19",
  "phases": [
    {
      "__kind": "progress_phase",
      "name": "Core Build",
      "description": "Engineering workstream.",
      "completion_percentage": 50,
      "steps": [
        { "__kind": "progress_step", "text": "Ship authentication flow", "completed": true, "priority": "high", "estimated_hours": 12 },
        { "__kind": "progress_step", "text": "Realtime sync hardening", "completed": false, "priority": "medium", "estimated_hours": 16, "category": "Infrastructure" },
        { "__kind": "progress_step", "text": "Developer documentation pass", "completed": false, "priority": "low", "estimated_hours": 6, "optional": true }
      ]
    }
  ]
}
```

Field inventory (snake_case, exactly as in the registered schema):

- **progress_tracker** (root): `title` (string, REQUIRED) · `description` (string — the tracker's note line) · `phases` (array of progress_phase, REQUIRED) · `overall_progress` (number 0-100) · `start_date` / `target_date` (ISO date strings) · `total_items` / `completed_items` (numbers).
- **progress_phase**: `name` (string, REQUIRED) · `steps` (array of progress_step, REQUIRED) · `id` (string) · `description` (string — phase note) · `color` (Tailwind gradient token, e.g. "from-blue-500 to-blue-600") · `completion_percentage` (number 0-100).
- **progress_step**: `text` (string, REQUIRED) · `completed` (boolean, REQUIRED — the step's status) · `id` (string) · `optional` (boolean) · `priority` ("low" | "medium" | "high") · `estimated_hours` (number) · `category` (string cross-cutting label).

## Rules that prevent render failures

1. `title` must be a non-empty string and `phases` must contain at least one phase whose `steps` has at least one step with non-empty `text` — otherwise the whole block declines and falls back to raw text.
2. `completed` is REQUIRED on every step and must be a JSON boolean (`true`/`false`), never `"yes"`, `1`, or omitted.
3. `priority` accepts only lowercase `"low"`, `"medium"`, `"high"` — anything else is dropped silently.
4. `estimated_hours` is a NUMBER of hours (`1.5`, not `"90min"` or `"1.5h"`).
5. Every nested object carries its own `__kind` (`progress_phase`, `progress_step`).
6. Omit `id` fields unless you need stable references — the system synthesizes `category-N` / `item-N` automatically. If you set ids, keep them unique.
7. Omit `overall_progress` / `total_items` / `completed_items` unless you have authoritative values — they are computed from the steps when absent (authored values win).

## Sizing

Keep trackers scannable: 2-6 phases, 3-10 steps per phase. Beyond ~40 total steps, split into multiple trackers.

## Editing etiquette

When updating an existing tracker, return ONE complete replacement object: keep `"__kind"` on every node, preserve existing `id` values (checked-off state is keyed by them), and change only what the user asked.

## Minimal example

```json
{
  "__kind": "progress_tracker",
  "title": "Onboarding Checklist",
  "phases": [
    {
      "__kind": "progress_phase",
      "name": "Week 1",
      "steps": [
        { "__kind": "progress_step", "text": "Set up development environment", "completed": true },
        { "__kind": "progress_step", "text": "Read the architecture docs", "completed": false }
      ]
    }
  ]
}
```$SKL$,
  'ListChecks',
  $mtx$["web"]$mtx$::jsonb,
  '1.0.0',
  '49c845cb-9314-485c-88ed-a7ace4f286ca',
  true,
  true,
  '39c38960-d30c-4840-b0c1-c9960de95582',
  'public'
where not exists (
  select 1 from skill.definition
  where skill_id = 'kind_progress_tracker' and deleted_at is null
);

-- ---------------------------------------------------------------------------
-- 9. content_blocks — simple + full, Agent Skills category, paired with the
--    skill via metadata.skill_id. ON CONFLICT DO NOTHING: never clobber.
-- ---------------------------------------------------------------------------

insert into public.content_blocks
  (block_id, label, description, icon_name, template, sort_order, is_active, category_id, organization_id, metadata)
values
  (
    'kind-progress-tracker-simple',
    'Progress Tracker',
    'Interactive phase/step checklist emitted as structured __kind JSON.',
    'ListChecks',
    $CB$When the user needs a progress tracker (phases with checkable steps), emit ONE JSON object:

```json
{
  "__kind": "progress_tracker",
  "title": "Learning Progress",
  "phases": [
    {
      "__kind": "progress_phase",
      "name": "React Fundamentals",
      "steps": [
        { "__kind": "progress_step", "text": "Components & JSX", "completed": true },
        { "__kind": "progress_step", "text": "Hooks", "completed": false }
      ]
    }
  ]
}
```

- `title`, `phases`, and each phase's `name` + `steps` are required; every step needs `text` and a boolean `completed`.
- Every nested object carries its own `__kind`.
- 2-6 phases, 3-10 steps each keeps it scannable.
- When editing, return ONE complete updated object and preserve any `id` values.$CB$,
    40,
    true,
    '2c324058-95e9-4b7e-a991-884f4443eb6e',
    '39c38960-d30c-4840-b0c1-c9960de95582',
    $mtx${"skill_id":"kind_progress_tracker"}$mtx$::jsonb
  ),
  (
    'kind-progress-tracker-full',
    'Progress Tracker (Detailed)',
    'Progress tracker with priorities, time estimates, dates, notes, and optional steps as structured __kind JSON.',
    'ListChecks',
    $CB$For a detailed progress tracker (priorities, time estimates, dates, notes), emit ONE JSON object:

```json
{
  "__kind": "progress_tracker",
  "title": "Q4 Platform Launch",
  "description": "Everything required to ship by end of quarter.",
  "start_date": "2026-10-01",
  "target_date": "2026-12-19",
  "phases": [
    {
      "__kind": "progress_phase",
      "name": "Core Build",
      "description": "Engineering workstream.",
      "completion_percentage": 50,
      "steps": [
        { "__kind": "progress_step", "text": "Ship authentication flow", "completed": true, "priority": "high", "estimated_hours": 12 },
        { "__kind": "progress_step", "text": "Documentation pass", "completed": false, "priority": "low", "estimated_hours": 6, "optional": true }
      ]
    }
  ]
}
```

- Required: `title`, `phases[]`, per phase `name` + `steps[]`, per step `text` + boolean `completed`.
- `priority` is only "low" | "medium" | "high" (lowercase); `estimated_hours` is a number, not "2h".
- Dates are ISO strings; `completion_percentage` is 0-100.
- Omit `overall_progress`/`total_items`/`completed_items` — they are computed from steps.
- When editing, return ONE complete updated object and preserve `id` values.$CB$,
    41,
    true,
    '2c324058-95e9-4b7e-a991-884f4443eb6e',
    '39c38960-d30c-4840-b0c1-c9960de95582',
    $mtx${"skill_id":"kind_progress_tracker"}$mtx$::jsonb
  )
on conflict (block_id) do nothing;

COMMIT;
