-- ============================================================================
-- Item Presentation render block — platform registration (skill + content
-- blocks + render registry).
--
-- The block: a ```json fence keyed by `item_presentation` that renders a
-- clickable card for a platform entity (agent, note, task, file, …). The card
-- shows instantly from the inline name/about, auto-enriches recognized types
-- from the DB, and opens the matching window panel on click. Unknown types
-- still render a neutral, never-erroring card.
--
-- One migration, idempotent on business keys:
--   1. skl_categories 'render-blocks' — shared category for render-block skills.
--   2. skl_definitions 'item-presentation' — system skill teaching agents the
--      fence, the type enum, and editing etiquette. Opt-in via
--      agx_agent.skill_config.included; discoverable via skill_get.
--   3. skl_render_definitions + skl_render_components — the FE render registry
--      (web active; other platforms await server-side processing).
--   4. shortcut_categories 'Item Cards' (content-block) + content_blocks — the
--      user-injectable prompt snippets (one general + per-type).
-- ============================================================================

BEGIN;

-- ── 1. Skill category (shared with every render-block skill) ────────────────
INSERT INTO public.skl_categories
  (category_key, label, description, icon_name, sort_order, is_active)
VALUES (
  'render-blocks',
  'Render Blocks',
  'Teaching skills for first-class streamed render blocks: when and how to emit each block type.',
  'Blocks', 50, true
)
ON CONFLICT (category_key) DO NOTHING;

-- ── 2. System skill: item-presentation ──────────────────────────────────────
INSERT INTO public.skl_definitions
  (skill_id, label, description, skill_type, body, icon_name,
   is_active, is_system, is_public, category_id, sort_order, version, platform_targets)
SELECT
  'item-presentation',
  'Item Cards',
  'How and when to emit ```json item_presentation render blocks: the type enum, the id/name/about fields, click-to-open behavior, and editing etiquette.',
  'render_block',
  $SKILL_BODY$# Item Cards (item_presentation)

You can drop a **clickable card for a platform entity** into your reply — an agent,
note, task, project, file, picklist, and more. The card renders instantly from the
text you provide, then quietly fetches the real record from the database to enrich
itself, and (for supported types) **opens the item in a window panel when the user
clicks it**. Use it whenever you reference a specific thing the user can open, jump
to, or act on — it is far more useful than a bare name or a raw id.

## How to emit a card

Write a JSON code fence whose single top-level key is `item_presentation`. Nothing
else is needed — no wrapper tags:

```json
{
  "item_presentation": {
    "id": "1f8b1100-5fbf-4074-ac91-64cbb30e7d8b",
    "type": "agent",
    "name": "Project Copilot",
    "about": "Plans work, edits tasks & notes, searches the web and your docs."
  }
}
```

### Fields

| Field   | Required | Notes |
|---------|----------|-------|
| `type`  | **yes**  | One of the enum below. Determines the icon, accent, enrichment, and what opens on click. |
| `id`    | strongly | The record's UUID. Without a real id the card cannot enrich or open — it stays an informational card. |
| `name`  | recommended | Shown instantly (before enrichment) and as the fallback if the row can't be read. |
| `about` | recommended | One-line description. Same instant-display / fallback role as `name`. |

The card shows the moment you've streamed `type` — supply `name`/`about` so it reads
well immediately even before (or without) a DB hit.

## Type enum

`agent`, `app`, `note`, `task`, `project`, `scope_type`, `scope`, `context_item`,
`image`, `video`, `audio`, `file`, `session`, `table`, `picklist`, `workbook`,
`document`, `message`, `email`.

- **Recognized** types get a custom icon + accent, DB enrichment, and (where wired)
  click-to-open. Today **agent, note, file/image/video/audio, picklist** open a
  window panel; the rest render an enriched, informative card (openers are being
  added).
- **Unknown / future / misspelled** types never error — they render a neutral card
  that still shows your `name`/`about`. Prefer a value from the enum so it gets the
  custom treatment.

## Rules

- One entity per fence. To present several items, emit several `item_presentation`
  fences (optionally with a sentence between them).
- Always use the JSON fence — do **not** wrap it in `<artifact>` or any other tag.
- Use the entity's **real UUID** for `id`. Made-up ids render but won't enrich/open.
- Keep `about` to a single tight sentence; the card has limited room before expanding.
- When revising a card you already emitted, return ONE complete updated
  `item_presentation` fence (keep the same `id` and `type`).

## Quick reference (per type)

```json
{ "item_presentation": { "id": "<uuid>", "type": "agent", "name": "Research Assistant", "about": "Searches the web and your docs, then drafts a brief." } }
```
```json
{ "item_presentation": { "id": "<uuid>", "type": "note", "name": "Kickoff notes", "about": "Decisions and action items from the project kickoff." } }
```
```json
{ "item_presentation": { "id": "<uuid>", "type": "task", "name": "Ship onboarding flow", "about": "Due Friday — blocked on design sign-off." } }
```
```json
{ "item_presentation": { "id": "<uuid>", "type": "project", "name": "Q3 Launch", "about": "Cross-functional launch tracking GTM, eng, and support." } }
```
```json
{ "item_presentation": { "id": "<uuid>", "type": "file", "name": "Contract.pdf", "about": "Signed MSA, 12 pages." } }
```
```json
{ "item_presentation": { "id": "<uuid>", "type": "picklist", "name": "Lead statuses", "about": "New, Working, Qualified, Lost." } }
```
$SKILL_BODY$,
  'MousePointerClick',
  true, true, true,
  (SELECT id FROM public.skl_categories WHERE category_key = 'render-blocks'),
  20, '1.0.0', '["web"]'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM public.skl_definitions
  WHERE skill_id = 'item-presentation'
    AND user_id IS NULL AND organization_id IS NULL AND project_id IS NULL
);

-- ── 3. Render definition + per-platform components ──────────────────────────
INSERT INTO public.skl_render_definitions
  (block_id, label, description, icon_name, template, skill_id, is_active, is_public, sort_order)
SELECT
  'item_presentation',
  'Item Card',
  'Clickable platform-entity card emitted as a ```json item_presentation fence. Renders instantly, auto-enriches recognized types from the DB, and opens the matching window panel on click.',
  'MousePointerClick',
  E'```json\n{\n  "item_presentation": {\n    "id": "<uuid>",\n    "type": "agent",\n    "name": "Project Copilot",\n    "about": "Plans work, edits tasks & notes, searches your docs."\n  }\n}\n```',
  (SELECT id FROM public.skl_definitions WHERE skill_id = 'item-presentation'),
  true, true, 20
WHERE NOT EXISTS (
  SELECT 1 FROM public.skl_render_definitions WHERE block_id = 'item_presentation'
);

WITH rd AS (
  SELECT id FROM public.skl_render_definitions WHERE block_id = 'item_presentation' LIMIT 1
)
INSERT INTO public.skl_render_components
  (render_definition_id, component_key, platform, import_path, is_active, sort_order)
SELECT rd.id, v.component_key, v.platform, v.import_path, v.is_active, v.sort_order
FROM rd,
  (VALUES
    ('ItemPresentationBlock', 'web',              '@/features/item-presentation/ItemPresentationBlock', true,  10),
    ('ItemPresentationBlock', 'chrome-extension', NULL,                                                 false, 20),
    ('ItemPresentationBlock', 'desktop',          NULL,                                                 false, 30),
    ('ItemPresentationBlock', 'mobile',           NULL,                                                 false, 40)
  ) AS v(component_key, platform, import_path, is_active, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.skl_render_components c
  WHERE c.render_definition_id = rd.id AND c.platform = v.platform
);

-- ── 4. Content blocks (user-injectable prompt snippets) ─────────────────────
INSERT INTO public.shortcut_categories
  (placement_type, label, description, icon_name, sort_order, is_active)
SELECT 'content-block', 'Item Cards',
       'Inject instructions that teach an agent to emit a clickable card for a platform entity (agent, note, task, file, …) that opens in a window panel on click.',
       'MousePointerClick', 45, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.shortcut_categories
  WHERE placement_type = 'content-block' AND label = 'Item Cards'
    AND user_id IS NULL AND organization_id IS NULL
    AND project_id IS NULL AND task_id IS NULL
);

INSERT INTO public.content_blocks (block_id, label, description, icon_name, template, category_id, sort_order, is_active)
SELECT v.block_id, v.label, v.description, v.icon_name, v.template,
       (SELECT id FROM public.shortcut_categories
         WHERE placement_type = 'content-block' AND label = 'Item Cards'
           AND user_id IS NULL AND organization_id IS NULL AND project_id IS NULL AND task_id IS NULL LIMIT 1),
       v.sort_order, true
FROM (VALUES
  ('item-card-any', 'Item Card (any type)', 'Clickable card for any platform entity', 'MousePointerClick', 0,
   $CB$When you reference a specific platform entity the user can open (an agent, note, task, project, file, picklist, …), emit a clickable Item Card instead of a bare name:

```json
{ "item_presentation": { "id": "<real-uuid>", "type": "agent", "name": "Short name", "about": "One-line description." } }
```

- `type` is one of: agent, app, note, task, project, scope_type, scope, context_item, image, video, audio, file, session, table, picklist, workbook, document, message, email.
- Use the entity's REAL id so the card can enrich and open. One entity per fence.
- Always provide name + about so it reads well instantly.$CB$),

  ('item-card-agent', 'Agent Card', 'Clickable card that opens an agent', 'Bot', 10,
   $CB$When you reference an agent the user can open, emit an Item Card:

```json
{ "item_presentation": { "id": "<agent-uuid>", "type": "agent", "name": "Project Copilot", "about": "Plans work, edits tasks & notes, searches your docs." } }
```

- Use the agent's real id. Clicking opens the agent in a window panel.$CB$),

  ('item-card-note', 'Note Card', 'Clickable card that opens a note', 'StickyNote', 20,
   $CB$When you reference a note the user can open, emit an Item Card:

```json
{ "item_presentation": { "id": "<note-uuid>", "type": "note", "name": "Kickoff notes", "about": "Decisions and action items from the kickoff." } }
```

- Use the note's real id. Clicking opens the note in a window panel.$CB$),

  ('item-card-task', 'Task Card', 'Clickable card for a task', 'CheckSquare', 30,
   $CB$When you reference a task, emit an Item Card:

```json
{ "item_presentation": { "id": "<task-uuid>", "type": "task", "name": "Ship onboarding flow", "about": "Due Friday — blocked on design sign-off." } }
```

- Use the task's real id. Keep `about` to one tight line (status / due / blocker).$CB$),

  ('item-card-project', 'Project Card', 'Clickable card for a project', 'FolderKanban', 40,
   $CB$When you reference a project, emit an Item Card:

```json
{ "item_presentation": { "id": "<project-uuid>", "type": "project", "name": "Q3 Launch", "about": "Cross-functional launch tracking GTM, eng, and support." } }
```

- Use the project's real id. One project per fence.$CB$),

  ('item-card-file', 'File Card', 'Clickable card that opens a file', 'File', 50,
   $CB$When you reference a file, image, video, or audio clip the user can open, emit an Item Card:

```json
{ "item_presentation": { "id": "<file-uuid>", "type": "file", "name": "Contract.pdf", "about": "Signed MSA, 12 pages." } }
```

- `type` can be file, image, video, or audio. Clicking opens a preview window.$CB$),

  ('item-card-picklist', 'Picklist Card', 'Clickable card that opens a picklist', 'ListChecks', 60,
   $CB$When you reference a picklist, emit an Item Card:

```json
{ "item_presentation": { "id": "<picklist-uuid>", "type": "picklist", "name": "Lead statuses", "about": "New, Working, Qualified, Lost." } }
```

- Use the picklist's real id. Clicking opens the picklist manager.$CB$),

  ('item-card-document', 'Document Card', 'Clickable card for a document', 'FileText', 70,
   $CB$When you reference a document, emit an Item Card:

```json
{ "item_presentation": { "id": "<document-uuid>", "type": "document", "name": "Spec v2", "about": "Working draft of the feature spec." } }
```

- Use the document's real id. One document per fence.$CB$),

  ('item-card-data', 'Data Cards (table / workbook / picklist)', 'Clickable cards for data entities', 'Table', 80,
   $CB$When you reference a data entity the user can open, emit an Item Card — pick the type that fits:

- A tabular dataset → `table`
- A multi-sheet workbook → `workbook`
- A reusable option list → `picklist`

```json
{ "item_presentation": { "id": "<uuid>", "type": "table", "name": "Leads", "about": "1,204 rows across 9 columns." } }
```

- Use the entity's real id. One entity per fence.$CB$),

  ('item-card-context', 'Context Cards (scope / scope type / context item)', 'Clickable cards for context entities', 'Boxes', 90,
   $CB$When you reference a context/scope entity, emit an Item Card — pick the type that fits:

- A scope instance (a Client, Case, Repo, …) → `scope`
- A scope type (the dimension itself) → `scope_type`
- A single context item → `context_item`

```json
{ "item_presentation": { "id": "<uuid>", "type": "scope", "name": "Acme Corp", "about": "Client scope — 14 active matters." } }
```

- Use the entity's real id. One entity per fence.$CB$),

  ('item-card-comms', 'Communication Cards (message / email)', 'Clickable cards for messages and emails', 'Mail', 100,
   $CB$When you reference a message or email, emit an Item Card — pick the type that fits:

- A chat / conversation message → `message`
- An email → `email`

```json
{ "item_presentation": { "id": "<uuid>", "type": "email", "name": "Re: Contract", "about": "From legal@acme.com — requests two redlines." } }
```

- Use the entity's real id. One entity per fence.$CB$)
) AS v(block_id, label, description, icon_name, sort_order, template)
ON CONFLICT (block_id) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  icon_name = EXCLUDED.icon_name,
  template = EXCLUDED.template,
  category_id = EXCLUDED.category_id,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

COMMIT;
