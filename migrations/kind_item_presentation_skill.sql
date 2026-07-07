-- kind_item_presentation_skill.sql
-- ---------------------------------------------------------------------------
-- content-ir `__kind` render-block skill + content block for `item_presentation`.
--
-- Teaches agents the CANONICAL content-ir shape:
--     { "__kind": "item_presentation", "type": "...", "id": "...", ... }
-- (flat, `__kind`-carrying) — NOT the legacy `{ "item_presentation": {...} }`
-- wrapper. The live parser (features/item-presentation/parseItemPresentation.ts)
-- reads `parsed?.item_presentation ?? parsed`, so both shapes render, but the
-- content-ir spine, envelope, and every other kind use the flat `__kind` form —
-- that is what this skill/block standardize on.
--
-- Distinct from the pre-existing legacy skill `item-presentation` (which teaches
-- the wrapper shape); that row is left untouched.
--
-- Idempotent & schema-qualified. Safe to re-apply. Do NOT hand-apply — the
-- orchestrator applies all kind skills centrally.
-- ---------------------------------------------------------------------------

BEGIN;

-- ── 1. The skill (skill.definition, global, render_block) ───────────────────
-- Composite-unique table → guard on (skill_id, user_id IS NULL). No ON CONFLICT.
INSERT INTO skill.definition (
    skill_id,
    label,
    description,
    skill_type,
    body,
    icon_name,
    platform_targets,
    semver,
    category_id,
    is_system,
    is_active,
    visibility,
    organization_id,
    project_id,
    task_id
)
SELECT
    'item-presentation-kind',
    'Item Card (__kind)',
    'How and when to emit item_presentation as a content-ir __kind block: the flat { "__kind": "item_presentation", "type", "id", ... } shape, the type enum, click-to-open enrichment, and editing etiquette.',
    'render_block'::public.skl_skill_type,
    $BODY$# Item Card — content-ir `__kind` block (`item_presentation`)

You can drop a **clickable card for a platform entity** into your reply — an agent, note, task, project, file, picklist, and more. The card renders instantly from the text you provide, then quietly fetches the real record from the database to enrich itself, and (for supported types) **opens the item in a window panel when the user clicks it**. Reach for it whenever you reference a specific thing the user can open, jump to, or act on — it is far more useful than a bare name or a raw id.

This is the **content-ir `__kind` form** of the card: one flat JSON object carrying `"__kind": "item_presentation"`. It renders live as a card AND becomes a persisted, editable content-ir block (envelope on `metadata.__ir`) — the canonical shape shared by every kind in the system.

## When to use it

- You mention a specific agent, note, task, project, or file the user can open — give them the card, not just the name.
- You want the user to jump straight into a record (its detail window or dedicated panel) from your reply.
- You are listing a few related items — emit one card per item.

Do NOT use it for a heading, a plain link, or a generic label with no real record behind it.

## The `__kind` shape

Emit a JSON object whose discriminator is `"__kind": "item_presentation"`. You may show it inside a ` ```json ` fence for clarity — fenced or bare, both render:

```json
{
  "__kind": "item_presentation",
  "type": "agent",
  "id": "1f8b1100-5fbf-4074-ac91-64cbb30e7d8b",
  "name": "Project Copilot",
  "about": "Plans work, edits tasks & notes, searches the web and your docs."
}
```

### Fields

| Field   | Required | Notes |
|---------|----------|-------|
| `__kind` | **yes** | Must be the literal string `"item_presentation"`. This is what routes the block. |
| `type`  | **yes**  | One of the enum below. Determines the icon, accent, DB enrichment, and what opens on click. |
| `id`    | strongly | The record's **real UUID**. Without a real id the card cannot enrich or open — it stays an informational card. |
| `name`  | recommended | Shown instantly (before enrichment) and as the fallback if the row can't be read. |
| `about` | recommended | One tight sentence. Same instant-display / fallback role as `name`. |

The card appears the moment you have streamed `type` — supply `name`/`about` so it reads well immediately, even before (or without) a DB hit.

> Note on shape: an older form wraps the payload under an `item_presentation` key (`{ "item_presentation": { ... } }`). The renderer still accepts it, but **emit the flat `__kind` shape above** — it is the canonical content-ir form and the only one you should produce.

## Type enum

`agent`, `app`, `note`, `task`, `project`, `scope_type`, `scope`, `context_item`, `image`, `video`, `audio`, `file`, `session`, `table`, `picklist`, `workbook`, `document`, `message`, `email`.

- **Recognized** types get a custom icon + accent, DB enrichment, and click-to-open. `agent`, `note`, `file`/`image`/`video`/`audio`, and `picklist` open their dedicated window; every other recognized type opens a clean detail window showing the full record. A recognized type with a real `id` is always clickable.
- **Unknown / future / misspelled** types never error — they render a neutral card that still shows your `name`/`about`. Prefer a value from the enum so the card gets the custom treatment.

## Rules that prevent render failures

- `__kind` must be exactly `"item_presentation"` and `type` must be present — those two are the only required fields.
- **One entity per block.** To present several items, emit several `item_presentation` blocks (a sentence between them is fine).
- Use the entity's **real UUID** for `id`. A made-up id renders but never enriches or opens.
- Do **not** wrap the block in `<artifact>` or any other tag — a plain JSON object (optionally in a ` ```json ` fence) is all it needs.
- Valid JSON only: double-quoted keys, no trailing commas, no comments.

## Sizing

- Keep `about` to a single tight sentence — the collapsed card has limited room before it expands.
- Emit as many separate cards as the user needs; do not try to pack multiple entities into one block.

## Editing etiquette

When you revise a card you already emitted, return **one complete updated `item_presentation` block** — keep `"__kind": "item_presentation"`, and preserve the same `id` and `type`. Never return a fragment or a diff.

## Minimal correct example

```json
{
  "__kind": "item_presentation",
  "type": "note",
  "id": "6d0a2f7e-2b4c-4d1a-9f3e-1c5b8a90d112",
  "name": "Kickoff notes",
  "about": "Decisions and action items from the project kickoff."
}
```
$BODY$,
    'MousePointerClick',
    '["web"]'::jsonb,
    '1.0.0',
    '49c845cb-9314-485c-88ed-a7ace4f286ca'::uuid,
    true,
    true,
    'public'::platform.visibility,
    '39c38960-d30c-4840-b0c1-c9960de95582'::uuid,
    NULL,
    NULL
WHERE NOT EXISTS (
    SELECT 1 FROM skill.definition
    WHERE skill_id = 'item-presentation-kind'
      AND created_by IS NULL
);

-- ── 2. Content block (public.content_blocks) ────────────────────────────────
-- Human label "Item Card", primary block. Filed under the shared "Render Blocks"
-- content-block category (6913d9fc-…). UNIQUE (block_id) → ON CONFLICT.
INSERT INTO public.content_blocks (
    block_id,
    label,
    description,
    icon_name,
    template,
    sort_order,
    is_active,
    category_id,
    organization_id
)
SELECT
    'kind-item-presentation',
    'Item Card',
    'A clickable, self-enriching card for a platform entity (agent, note, task, file, and more).',
    'MousePointerClick',
    $CB$When you reference a specific platform entity the user can open (agent, note, task, project, file, picklist, and more), emit it as a clickable, self-enriching card:

```json
{ "__kind": "item_presentation", "type": "agent", "id": "1f8b1100-5fbf-4074-ac91-64cbb30e7d8b", "name": "Project Copilot", "about": "Plans work, edits tasks & notes." }
```

- `__kind` is always `"item_presentation"`; `type` is required (agent, note, task, project, file, image, audio, video, picklist, session, table, document, message, email, scope, scope_type, context_item, workbook, app).
- Use the entity's REAL uuid for `id` — a made-up id won't enrich or open.
- `name` + `about` show instantly and act as fallback; keep `about` to one sentence.
- One entity per block — emit several blocks for several items.$CB$,
    10,
    true,
    '6913d9fc-b8c0-4107-af40-27d55c177694'::uuid,  -- shared "Render Blocks" content-block category
    '39c38960-d30c-4840-b0c1-c9960de95582'::uuid
ON CONFLICT (block_id) DO UPDATE SET
    label          = EXCLUDED.label,
    description    = EXCLUDED.description,
    icon_name      = EXCLUDED.icon_name,
    template       = EXCLUDED.template,
    sort_order     = EXCLUDED.sort_order,
    is_active      = EXCLUDED.is_active,
    category_id    = EXCLUDED.category_id,
    updated_at     = now();

COMMIT;
