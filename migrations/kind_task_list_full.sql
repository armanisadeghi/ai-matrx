-- ============================================================================
-- content-ir kind `task_list` (+ child `task_item`) — FULL package.
--
-- The platform kind for the existing ```tasks fence renderable (TasksBlock /
-- TasksArtifact / TaskChecklist, all parsing ONE markdown-checklist string via
-- parseMarkdownChecklist). Canonical `__kind` JSON shape:
--
--   { "__kind": "task_list", "title"?, "items": [
--       { "__kind": "task_item", "title", "item_type"? (section|task|subtask),
--         "checked"?, "bold"?, "children"?: [task_item…] } ] }
--
-- Slug is `task_list` (NOT `tasks`) to avoid colliding with the app-domain
-- task entities (workspace.tasks).
--
-- Rows applied here:
--   * content_ir.kind_definition  — task_list + task_item. `data` /
--     `emitted_block_schema` / `emitted_json_schema` / `emitted_fingerprint`
--     are CONVERTER-EMITTED (kindSchemaToStorage / kindSchemaToJsonSchema /
--     fingerprintText over features/content-ir/kinds/task-list.ts; emit
--     script output 2026-07-06) — never hand-written. Fingerprint parity is
--     pinned by features/content-ir/__tests__/kind-task-list.test.ts.
--     authoring_owner 'ts', platform org, visibility public, is_active FALSE
--     until the central integration pass registers + gates the kind.
--   * content_ir.kind_edge        — task_list.items → task_item and the
--     recursive task_item.children → task_item self-edge.
--   * content_ir.kind_example     — 2 task_list examples (canonical full +
--     simple) and 1 canonical task_item example. validation_status 'passed'
--     is REAL: each example passes validateStructuralLeg against the emitted
--     schema in the jest suite above (structural leg green 2026-07-06).
--   * content_ir.kind_surface     — fence_lang/'tasks' → task_list via named
--     strategy `tasks_legacy_text` (features/content-ir/surfaces/
--     tasks-legacy-text.ts, wrapping the REAL parseMarkdownChecklist). The
--     host fence-finalize hook does not exist yet (XML only today); the row
--     is the correct config for the integration pass.
--   * content_ir.kind_component   — web/output → component_key 'tasks' (the
--     legacyBlockType facade into BlockComponentRegistry/artifact renderers).
--   * skill.definition            — `kind_task_list` (render_block): teaches
--     the `__kind` JSON syntax; the live `tasks-block` skill remains the
--     ```tasks fence counterpart (R9: one skill per kind per syntax).
--   * public.content_blocks       — `kind-task-list-simple` /
--     `kind-task-list-full` under the Agent Skills content-block category,
--     metadata {"skill_id":"kind_task_list"}; insert-only (never clobber).
--
-- Idempotent on business keys; re-apply is safe. is_active on existing
-- kind_definition rows is deliberately NOT touched on re-apply (the
-- integration pass owns activation).
-- ============================================================================

BEGIN;

-- ── 1. kind_definition: task_item first (task_list's edge resolves to it) ───

INSERT INTO content_ir.kind_definition
  (kind, label, authoring_owner, data, sample_data,
   emitted_block_schema, emitted_json_schema, emitted_fingerprint,
   is_active, organization_id, visibility)
VALUES
  (
    'task_item',
    'Task Item',
    'ts',
    $J$[{"name":"title","required":true,"type":"string"},{"name":"item_type","type":"enum","values":["section","task","subtask"]},{"name":"checked","type":"boolean"},{"name":"bold","type":"boolean"},{"name":"children","type":"array"}]$J$::jsonb,
    $J${"__kind":"task_item","item_type":"task","title":"Configure analytics","checked":false,"bold":true,"children":[{"__kind":"task_item","item_type":"subtask","title":"Install the tracking snippet","checked":true}]}$J$::jsonb,
    $J${"type":"object","properties":{"title":{"type":"string"},"item_type":{"type":"string","enum":["section","task","subtask"]},"checked":{"type":"boolean"},"bold":{"type":"boolean"},"children":{"type":"array","items":{"$ref":"#"}},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"task_item"}},"required":["__kind","title"],"additionalProperties":false}$J$::jsonb,
    $J${"type":"object","properties":{"title":{"type":"string"},"item_type":{"type":"string","enum":["section","task","subtask"]},"checked":{"type":"boolean"},"bold":{"type":"boolean"},"children":{"type":"array","items":{"$ref":"#"}}},"required":["title"],"additionalProperties":false}$J$::jsonb,
    'av-dmjjii1t4pyn0',
    false,
    '39c38960-d30c-4840-b0c1-c9960de95582',
    'public'
  ),
  (
    'task_list',
    'Task Checklist',
    'ts',
    $J$[{"name":"title","type":"string"},{"name":"items","required":true,"type":"array"}]$J$::jsonb,
    $J${"__kind":"task_list","title":"Product release plan","items":[{"__kind":"task_item","item_type":"section","title":"Planning","children":[{"__kind":"task_item","item_type":"task","title":"Define scope","checked":true},{"__kind":"task_item","item_type":"task","title":"Set the budget","checked":false}]},{"__kind":"task_item","item_type":"section","title":"Execution","children":[{"__kind":"task_item","item_type":"task","title":"Kick off the work","checked":false,"bold":true,"children":[{"__kind":"task_item","item_type":"subtask","title":"Assign owners","checked":true},{"__kind":"task_item","item_type":"subtask","title":"Schedule the kickoff call","checked":false}]},{"__kind":"task_item","item_type":"task","title":"Track progress","checked":false}]}]}$J$::jsonb,
    $J${"type":"object","properties":{"title":{"type":"string"},"items":{"type":"array","items":{"$ref":"#/$defs/task_item"}},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"task_list"}},"required":["__kind","items"],"additionalProperties":false,"$defs":{"task_item":{"type":"object","properties":{"title":{"type":"string"},"item_type":{"type":"string","enum":["section","task","subtask"]},"checked":{"type":"boolean"},"bold":{"type":"boolean"},"children":{"type":"array","items":{"$ref":"#/$defs/task_item"}},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"task_item"}},"required":["__kind","title"],"additionalProperties":false}}}$J$::jsonb,
    $J${"type":"object","properties":{"title":{"type":"string"},"items":{"type":"array","items":{"$ref":"#/$defs/task_item"}}},"required":["items"],"additionalProperties":false,"$defs":{"task_item":{"type":"object","properties":{"title":{"type":"string"},"item_type":{"type":"string","enum":["section","task","subtask"]},"checked":{"type":"boolean"},"bold":{"type":"boolean"},"children":{"type":"array","items":{"$ref":"#/$defs/task_item"}}},"required":["title"],"additionalProperties":false}}}$J$::jsonb,
    'jt-198ecyprauqjf',
    false,
    '39c38960-d30c-4840-b0c1-c9960de95582',
    'public'
  )
ON CONFLICT (organization_id, kind) DO UPDATE SET
  label = EXCLUDED.label,
  authoring_owner = EXCLUDED.authoring_owner,
  data = EXCLUDED.data,
  sample_data = EXCLUDED.sample_data,
  emitted_block_schema = EXCLUDED.emitted_block_schema,
  emitted_json_schema = EXCLUDED.emitted_json_schema,
  emitted_fingerprint = EXCLUDED.emitted_fingerprint,
  visibility = EXCLUDED.visibility,
  updated_at = now();
  -- is_active deliberately NOT updated: activation belongs to the
  -- integration pass; a drift re-apply must never de-activate a gated kind.

-- ── 2. kind_edge: items → task_item; recursive children self-edge ───────────

INSERT INTO content_ir.kind_edge
  (parent_definition_id, field_name, child_definition_id, position, organization_id)
SELECT p.id, e.field_name, c.id, e.position, p.organization_id
FROM (VALUES
  ('task_list', 'items',    'task_item', 0),
  ('task_item', 'children', 'task_item', 0)
) AS e(parent_kind, field_name, child_kind, position)
JOIN content_ir.kind_definition p
  ON p.kind = e.parent_kind
 AND p.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
 AND p.deleted_at IS NULL
JOIN content_ir.kind_definition c
  ON c.kind = e.child_kind
 AND c.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
 AND c.deleted_at IS NULL
ON CONFLICT (parent_definition_id, field_name, child_definition_id) DO UPDATE SET
  position = EXCLUDED.position,
  updated_at = now();

-- ── 3. kind_example: REAL validation (structural leg green in the jest
--      suite features/content-ir/__tests__/kind-task-list.test.ts) ──────────

INSERT INTO content_ir.kind_example
  (kind_definition_id, kind_version, data, label, description,
   source, is_canonical, validation_status, validated_at, organization_id)
SELECT d.id, d.version, v.data::jsonb, v.label, v.description,
       'authored', v.is_canonical, 'passed', now(), d.organization_id
FROM (VALUES
  (
    'task_list', 'Release plan (canonical)', true,
    'Full shape: sections, tasks, one-level subtasks, checked state, bold emphasis.',
    $J${"__kind":"task_list","title":"Product release plan","items":[{"__kind":"task_item","item_type":"section","title":"Planning","children":[{"__kind":"task_item","item_type":"task","title":"Define scope","checked":true},{"__kind":"task_item","item_type":"task","title":"Set the budget","checked":false}]},{"__kind":"task_item","item_type":"section","title":"Execution","children":[{"__kind":"task_item","item_type":"task","title":"Kick off the work","checked":false,"bold":true,"children":[{"__kind":"task_item","item_type":"subtask","title":"Assign owners","checked":true},{"__kind":"task_item","item_type":"subtask","title":"Schedule the kickoff call","checked":false}]},{"__kind":"task_item","item_type":"task","title":"Track progress","checked":false}]}]}$J$
  ),
  (
    'task_list', 'Flat checklist (minimal)', false,
    'Minimal form: item_type omitted (defaults to task), no set title, no nesting.',
    $J${"__kind":"task_list","items":[{"__kind":"task_item","title":"Draft the project brief","checked":false},{"__kind":"task_item","title":"Review with the team","checked":false},{"__kind":"task_item","title":"Create the shared repository","checked":true}]}$J$
  ),
  (
    'task_item', 'Task with a subtask (canonical)', true,
    'A bold task carrying one checked subtask child.',
    $J${"__kind":"task_item","item_type":"task","title":"Configure analytics","checked":false,"bold":true,"children":[{"__kind":"task_item","item_type":"subtask","title":"Install the tracking snippet","checked":true}]}$J$
  )
) AS v(kind, label, is_canonical, description, data)
JOIN content_ir.kind_definition d
  ON d.kind = v.kind
 AND d.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
 AND d.deleted_at IS NULL
WHERE NOT EXISTS (
  SELECT 1 FROM content_ir.kind_example x
  WHERE x.kind_definition_id = d.id AND x.label = v.label AND x.deleted_at IS NULL
);

-- ── 4. kind_surface: ```tasks fence → task_list via tasks_legacy_text ───────

INSERT INTO content_ir.kind_surface
  (kind_definition_id, surface_type, token, parser_strategy,
   parser_config, streaming, priority, is_active, organization_id)
SELECT d.id, 'fence_lang', 'tasks', 'tasks_legacy_text',
       '{}'::jsonb, true, 100, true, d.organization_id
FROM content_ir.kind_definition d
WHERE d.kind = 'task_list'
  AND d.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
  AND d.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM content_ir.kind_surface s
    WHERE s.surface_type = 'fence_lang' AND s.token = 'tasks'
      AND s.deleted_at IS NULL
  );

-- ── 5. kind_component: web output → the legacy 'tasks' renderer ─────────────

INSERT INTO content_ir.kind_component
  (kind_definition_id, platform, role, component_key, source,
   config, is_default, is_active, sort_order, organization_id)
SELECT d.id, 'web', 'output', 'tasks', 'bundled',
       $J${"legacyBlockType": "tasks"}$J$::jsonb, true, true, 100, d.organization_id
FROM content_ir.kind_definition d
WHERE d.kind = 'task_list'
  AND d.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
  AND d.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM content_ir.kind_component c
    WHERE c.kind_definition_id = d.id
      AND c.platform = 'web' AND c.role = 'output' AND c.component_key = 'tasks'
      AND c.deleted_at IS NULL
  );

-- ── 6. Skill: kind_task_list (the __kind JSON syntax; the live `tasks-block`
--      skill stays the ```tasks fence counterpart) ──────────────────────────
-- Live skill.definition columns verified 2026-07-06 (no user_id / is_public;
-- semver is the text version). Composite scoping → WHERE NOT EXISTS guard.

INSERT INTO skill.definition
  (skill_id, label, description, skill_type, body, icon_name,
   is_active, is_system, visibility, category_id, sort_order,
   semver, platform_targets, organization_id, metadata)
SELECT
  'kind_task_list',
  'Task Checklist (structured)',
  'How and when to emit a task_list render block as structured "__kind" JSON: the root and task_item shapes, sections vs tasks vs subtasks, the rules that prevent dropped items, sizing guidance, and editing etiquette. Counterpart of the tasks-block skill, which teaches the same renderable via the legacy ```tasks fence.',
  'render_block',
  $SB$# Task Checklist (structured JSON)

You can create a live, interactive **task checklist** by emitting a single JSON
object marked with `"__kind": "task_list"`. It renders as the platform's
checkable task list — progress bar ("Main: 3 of 8 · All: 5 of 14 (36%)"), a
"hide completed" toggle, per-item edit / add / delete — and the user can push
the whole list into their task manager with one click ("Convert to tasks").
Reach for it whenever the user wants a to-do list, a step-by-step procedure
they can tick off, a checklist, an action plan, acceptance criteria, or any
set of items with done/not-done state.

This is the structured counterpart of the ` ```tasks ` markdown fence (see the
`tasks-block` skill). Both converge to the same renderable; prefer this JSON
shape when you are producing structured output, filling a typed slot, or
programmatically building the list — the fence remains ideal for quick prose-
adjacent checklists.

## How to emit a task checklist

Emit one JSON object. It may sit inside a ` ```json ` fence for clarity or
stand bare in the message — the pipeline recognizes `"__kind": "task_list"`
either way. Nothing else (no wrapper tags) is needed:

```json
{
  "__kind": "task_list",
  "title": "Website launch",
  "items": [
    { "__kind": "task_item", "title": "Draft the project brief", "checked": false },
    { "__kind": "task_item", "title": "Review with the team", "checked": false },
    { "__kind": "task_item", "title": "Create the shared repository", "checked": true }
  ]
}
```

Rules:
- ONE checklist per JSON object. The root `__kind` is exactly `task_list`.
- The root requires `items` (an array of task items); `title` is optional.
- Every item in `items` (and every nested child) carries its own
  `"__kind": "task_item"`.
- It is valid JSON — double-quoted keys and strings, no trailing commas, no
  comments. A single malformed object drops the whole block.

## The root shape

| Field | Type | Required | Notes |
|---|---|---|---|
| `__kind` | string | yes | Always the literal `"task_list"`. |
| `title` | string | no | Optional list name (the block header itself reads "Tasks"). |
| `items` | array | yes | One or more `task_item` objects. |

## The task_item shape

| Field | Type | Required | Notes |
|---|---|---|---|
| `__kind` | string | yes | Always the literal `"task_item"`. |
| `title` | string | yes | The item text. One line of plain prose. |
| `item_type` | string | no | `"section"`, `"task"`, or `"subtask"`. Omitted means `"task"`. |
| `checked` | boolean | no | Done state. Omitted means not done. Booleans only — never `"x"` or `"yes"`. |
| `bold` | boolean | no | Renders the title in a heavier weight (use for a critical lead item). |
| `children` | array | no | Nested `task_item` objects (see structure below). |

## The three structural levels

**1. Task** — the default checkable item. A flat list of tasks is perfectly
valid (and common).

**2. Subtask** — a task's `children`, each with `"item_type": "subtask"`.
Checking a parent task auto-checks its subtasks; the progress bar counts main
tasks and all items separately.

```json
{ "__kind": "task_item", "item_type": "task", "title": "Prepare the presentation", "checked": false,
  "children": [
    { "__kind": "task_item", "item_type": "subtask", "title": "Write the outline", "checked": false },
    { "__kind": "task_item", "item_type": "subtask", "title": "Gather the data", "checked": true }
  ] }
```

**3. Section** — a grouping header, `"item_type": "section"`, whose `children`
are tasks. A section is a container, not a checkable item: it has no checkbox,
takes no `checked`, and does not count toward progress.

```json
{ "__kind": "task_item", "item_type": "section", "title": "Planning",
  "children": [
    { "__kind": "task_item", "item_type": "task", "title": "Define scope", "checked": true },
    { "__kind": "task_item", "item_type": "task", "title": "Set the budget", "checked": false }
  ] }
```

Top-level `items` may mix sections and plain tasks.

## Rules that prevent dropped or mis-rendered items

1. `checked` is a JSON boolean (`true` / `false`) — never the strings `"x"`,
   `"true"`, or `"yes"`.
2. Keep `__kind` on the root AND on every item at every depth.
3. `title` is required on every item and must be non-empty. An item with an
   empty title cannot render as a checklist line.
4. Keep each `title` to ONE line of plain prose — the checklist renders line
   by line; embedded newlines are collapsed.
5. Respect the structure the surface renders: sections contain tasks; tasks
   contain subtasks; subtasks do not nest further. Deeper `children` are
   flattened up to the subtask level, and a top-level `subtask` is promoted
   to a task — don't rely on either; author the intended structure.
6. Do not put `checked` on a section — sections carry no checkbox.
7. Valid JSON only: no trailing commas, no comments, no single quotes.

## Sizing guidance

- A focused list is ~5–25 items. For a large effort, group with sections
  rather than one long flat wall of checkboxes.
- Subtasks: 2–6 per parent task. More than that, promote them to their own
  tasks or split into a new section.
- Two clearly different efforts: emit two separate `task_list` objects with a
  sentence of context between them, rather than one giant list.

## Editing an existing checklist

When asked to modify a task list (yours or one provided as context):

- Return ONE complete `task_list` JSON object containing the FULL updated
  checklist — never a single item, a fragment, or prose mixed with partial JSON.
- Keep the root `__kind: "task_list"` and every item's `__kind`.
- Preserve the existing `checked` state and wording of items you weren't asked
  to change; only flip the booleans or edit the titles requested.
- Keep the section structure and subtask nesting intact unless asked to
  reorganize.
- To add items, append them; to remove, omit them — do not leave emptied-out
  items in place.

## One correct minimal example

```json
{
  "__kind": "task_list",
  "title": "Launch checklist",
  "items": [
    { "__kind": "task_item", "item_type": "section", "title": "Pre-launch",
      "children": [
        { "__kind": "task_item", "item_type": "task", "title": "Finalize the landing page copy", "checked": false, "bold": true,
          "children": [
            { "__kind": "task_item", "item_type": "subtask", "title": "Write the headline", "checked": true },
            { "__kind": "task_item", "item_type": "subtask", "title": "Proofread", "checked": false }
          ] },
        { "__kind": "task_item", "item_type": "task", "title": "Configure analytics", "checked": false }
      ] },
    { "__kind": "task_item", "item_type": "task", "title": "Send the announcement email", "checked": false }
  ]
}
```
$SB$,
  'ListChecks',
  true, true, 'public',
  '49c845cb-9314-485c-88ed-a7ace4f286ca',  -- platform.categories: dimension 'skill', "Render Blocks" (same as tasks-block)
  30, '1.0.0', '["web"]'::jsonb,
  '39c38960-d30c-4840-b0c1-c9960de95582',
  '{"kind": "task_list"}'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM skill.definition
  WHERE skill_id = 'kind_task_list'
    AND organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
    AND project_id IS NULL AND task_id IS NULL
    AND deleted_at IS NULL
);

-- ── 7. Content blocks — Agent Skills category, paired to the skill.
--      Insert-only (coexist-not-clobber): an existing block_id is NEVER
--      overwritten. ─────────────────────────────────────────────────────────

INSERT INTO public.content_blocks
  (block_id, label, description, icon_name, template,
   category_id, sort_order, is_active, organization_id, metadata)
SELECT v.block_id, v.label, v.description, v.icon_name, v.template,
       '2c324058-95e9-4b7e-a991-884f4443eb6e',
       v.sort_order, true,
       '39c38960-d30c-4840-b0c1-c9960de95582',
       '{"skill_id": "kind_task_list"}'::jsonb
FROM (VALUES
  (
    'kind-task-list-simple', 'Task Checklist',
    'Condensed instructions for emitting a task_list render block (flat checklist).',
    'ListChecks', 10,
    $CB$When the user wants a to-do list, action plan, step-by-step procedure, or acceptance criteria they can tick off, emit a task checklist — it renders live as a checkable list with a progress bar and can be converted into tracked tasks with one click:

```json
{ "__kind": "task_list", "title": "List title", "items": [
  { "__kind": "task_item", "title": "First thing to do", "checked": false },
  { "__kind": "task_item", "title": "Already done thing", "checked": true }
] }
```

- Root `__kind` is `task_list`; `items` is required (`title` optional). Every item carries `"__kind": "task_item"`.
- `checked` is a JSON boolean (`true`/`false`) — never `"x"` or `"yes"`; omit it for not-done.
- Every item needs a non-empty single-line `title`; set `"bold": true` on a critical lead item.
- Valid JSON only — no trailing commas. Keep lists focused (~5-25 items).$CB$
  ),
  (
    'kind-task-list-full', 'Task Checklist (Sections & Subtasks)',
    'Task list render block with section grouping and one level of subtasks.',
    'ListTree', 20,
    $CB$For a larger effort, group the checklist with sections and break tasks into subtasks:

```json
{ "__kind": "task_list", "title": "Release plan", "items": [
  { "__kind": "task_item", "item_type": "section", "title": "Planning", "children": [
    { "__kind": "task_item", "item_type": "task", "title": "Define scope", "checked": true },
    { "__kind": "task_item", "item_type": "task", "title": "Kick off the work", "checked": false, "children": [
      { "__kind": "task_item", "item_type": "subtask", "title": "Assign owners", "checked": false }
    ] }
  ] }
] }
```

- `item_type` is `"section"`, `"task"`, or `"subtask"` (omitted = task). Sections are containers: no checkbox, no `checked`, excluded from progress.
- Structure is sections → tasks → subtasks; subtasks do not nest further.
- Checking a parent task auto-checks its subtasks; keep 2-6 subtasks per task.
- Every item keeps its own `__kind` and a non-empty one-line `title`; `checked` is a boolean.$CB$
  )
) AS v(block_id, label, description, icon_name, sort_order, template)
WHERE NOT EXISTS (
  SELECT 1 FROM public.content_blocks b WHERE b.block_id = v.block_id
);

COMMIT;
