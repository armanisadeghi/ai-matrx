-- kind_comparison_set_skill.sql
-- Teaches AI Matrx agents to emit the content-ir `comparison_set` render block.
--
-- A `comparison_set` is a canonical structured-content kind (content_ir.kind_definition)
-- an agent emits as a JSON object carrying "__kind":"comparison_set". It renders live
-- as an interactive comparison table (criteria x compared items) and persists as an
-- editable artifact. Child criterion nodes carry their own "__kind":"comparison_criterion".
--
-- Produces:
--   1. skill.definition row  skill_id='comparison-tables'  (render_block, global/system)
--   2. public.content_blocks  block_id='comparison-set-kind'  (NEW canonical __kind
--      block; coexists with the legacy 'comparison-table' row, which is untouched)
--
-- Idempotent + schema-qualified. Safe to re-apply. Does NOT apply itself.
--
-- Uncertain: content-block categories live on dimension='shortcut' (there is no
-- dedicated render-block dimension); "global" for skill.definition means the Matrx
-- System org (organization_id is NOT NULL) with user_id/project_id/task_id NULL, matching
-- the existing mermaid-diagrams row.

BEGIN;

-- ---------------------------------------------------------------------------
-- Constants used below (kept inline; no new dimension is invented):
--   Matrx System org : 39c38960-d30c-4840-b0c1-c9960de95582
--   shared "Render Blocks" content-block category (dimension='shortcut'):
--                      6913d9fc-b8c0-4107-af40-27d55c177694
-- ---------------------------------------------------------------------------

-- ===========================================================================
-- 1. SKILL — skill.definition (composite-unique on skill_id,user_id,org,project)
-- ===========================================================================
INSERT INTO skill.definition (
  skill_id, label, description, skill_type, body, icon_name,
  platform_targets, semver, category_id,
  is_active, is_system, sort_order,
  organization_id, project_id, task_id, visibility
)
SELECT
  'comparison-tables',
  'Comparison Tables',
  'How and when to emit a comparison_set render block: the flat __kind JSON shape, criterion child nodes, value/type rules that prevent render failures, sizing guidance, and editing etiquette.',
  'render_block',
  $BODY$# Comparison Tables

You can render a live, interactive comparison table by emitting a single JSON
object with `"__kind": "comparison_set"`. It renders progressively while you
stream, then persists as a versioned artifact the user can edit, share, and
that other agents can modify later. A comparison table is dramatically clearer
than prose whenever the user is weighing several options against shared
criteria — reach for it instead of writing "Option A costs more but scores
higher on…".

## How to emit one

Emit one JSON object per table. You may wrap it in a ` ```json ` fence for
clarity — it renders either way (fenced or bare):

```json
{
  "__kind": "comparison_set",
  "title": "Cloud Providers",
  "description": "Weighing the big three for a new production workload.",
  "items": ["AWS", "Azure", "GCP"],
  "criteria": [
    { "__kind": "comparison_criterion", "name": "Price", "type": "cost", "values": ["$$", "$$$", "$$"], "weight": 2, "higherIsBetter": false },
    { "__kind": "comparison_criterion", "name": "Performance", "type": "rating", "values": [9, 8, 9], "weight": 3 },
    { "__kind": "comparison_criterion", "name": "Global regions", "type": "boolean", "values": [true, true, true] },
    { "__kind": "comparison_criterion", "name": "Support", "type": "text", "values": ["Good", "Excellent", "Very good"] }
  ]
}
```

The shape is **flat** — the fields sit at the top level next to `__kind`. Do NOT
nest them under a `comparison` wrapper key.

## When to use it

| User intent | Use a comparison_set? |
|---|---|
| "Compare X, Y, Z on price / speed / support" | Yes — one row per criterion, one column per option |
| "Which should I pick and why" | Yes — add a `rating` criterion + `weight` so the winner is visible |
| Feature matrix (has/doesn't have) | Yes — `boolean` criteria |
| A single option's details | No — that is a list or item card, not a comparison |
| Numbers over time | No — use a chart |

## Field structure

Top-level object (`__kind: "comparison_set"`):
- `title` (string, **required**) — heading for the table.
- `items` (string[], **required**) — the things being compared. These become the
  **columns**. Keep 2–6.
- `criteria` (array, **required**) — the dimensions compared. These become the
  **rows**. Each is a `comparison_criterion` object.
- `description` (string, optional) — one line of framing under the title.

Each `criteria` entry (`__kind: "comparison_criterion"`):
- `__kind` (string, **required**) — must be `"comparison_criterion"`.
- `name` (string, **required**) — the row label ("Price", "Performance").
- `values` (array, **required**) — one entry **per item, in the same order as
  `items`**. Entries may be strings, numbers, or booleans (see types below).
- `type` (string, optional) — one of `"cost" | "rating" | "text" | "boolean"`.
  If omitted it is inferred from the values; set it explicitly when you know it.
- `weight` (number, optional) — relative importance for scoring (default 1).
- `higherIsBetter` (boolean, optional) — direction of "good". Defaults: `rating`
  and `boolean` → true, `cost` → false, `text` → true.

## Value + type rules that prevent render failures

- **`values.length` MUST equal `items.length` for every criterion.** A mismatched
  row is the #1 failure — three items means every criterion has exactly three
  values, in the same order.
- `type: "rating"` → numbers `1`–`5` (values outside are clamped). Use for scores.
- `type: "cost"` → either `$`/`$$`/`$$$` strings or plain numbers (e.g. `29`).
  Lower is treated as better unless you set `higherIsBetter: true`.
- `type: "boolean"` → real `true`/`false` (not the strings "yes"/"no"). Use for
  has/doesn't-have matrices.
- `type: "text"` → any short string ("Excellent", "Limited"). Keep cells terse —
  a phrase, not a paragraph. Avoid `|` and newlines inside cell text.
- Emit valid JSON only: double-quoted keys, no trailing commas, no comments.

## Sizing

- 2–6 items (columns) and 3–10 criteria (rows) read best. Beyond that the table
  gets unwieldy — split into two comparisons or drop low-signal criteria.
- One `__kind` object per table. Multiple comparisons = multiple objects.

## Editing etiquette

- When revising a table, return **one complete updated `comparison_set` object** —
  not a diff and not a partial. Keep `"__kind": "comparison_set"` and every
  child `"__kind": "comparison_criterion"`.
- Preserve the `items` order; every criterion's `values` order must keep matching
  it. Adding an item means adding one value to **every** criterion.

## Minimal correct example

```json
{
  "__kind": "comparison_set",
  "title": "Note-taking apps",
  "items": ["Notion", "Obsidian"],
  "criteria": [
    { "__kind": "comparison_criterion", "name": "Price", "type": "cost", "values": ["$$", "$"] },
    { "__kind": "comparison_criterion", "name": "Offline", "type": "boolean", "values": [false, true] },
    { "__kind": "comparison_criterion", "name": "Ease of use", "type": "rating", "values": [5, 3] }
  ]
}
```
$BODY$,
  'Columns3',
  '["web"]'::jsonb,
  '1.0.0',
  NULL,
  true,  -- is_active
  true,  -- is_system
  10,    -- sort_order
  '39c38960-d30c-4840-b0c1-c9960de95582',  -- Matrx System org
  NULL,  -- project_id
  NULL,  -- task_id
  'public'
WHERE NOT EXISTS (
  SELECT 1 FROM skill.definition
  WHERE skill_id = 'comparison-tables'
    AND created_by IS NULL
    AND organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
    AND project_id IS NULL
);

-- ===========================================================================
-- 2. CONTENT BLOCK — public.content_blocks (block_id UNIQUE → upsert)
--    The legacy 'comparison-table' block already exists (teaching the old nested
--    { "comparison": {...} } shape). To COEXIST rather than clobber it, this new
--    canonical __kind block uses a distinct id 'comparison-set-kind'.
-- ===========================================================================
INSERT INTO public.content_blocks (
  block_id, label, description, icon_name, template,
  category_id, organization_id, sort_order, is_active, version
)
VALUES (
  'comparison-set-kind',
  'Comparison Table',
  'Compare options against shared criteria as a live table.',
  'Columns3',
  $CB$When the user is weighing several options against shared criteria, render a comparison table instead of prose — one JSON object with "__kind":"comparison_set":

```json
{
  "__kind": "comparison_set",
  "title": "Cloud Providers",
  "items": ["AWS", "Azure", "GCP"],
  "criteria": [
    { "__kind": "comparison_criterion", "name": "Price", "type": "cost", "values": ["$$", "$$$", "$$"] },
    { "__kind": "comparison_criterion", "name": "Performance", "type": "rating", "values": [9, 8, 9] },
    { "__kind": "comparison_criterion", "name": "Managed DB", "type": "boolean", "values": [true, true, true] }
  ]
}
```

- `items` are the columns; each `criteria` entry is a row.
- Every criterion's `values` has one entry per item, in the same order.
- `type`: "cost" | "rating" (1-5) | "text" | "boolean". Keep the shape flat — no `comparison` wrapper.$CB$,
  '6913d9fc-b8c0-4107-af40-27d55c177694',  -- shared "Render Blocks" content-block category
  '39c38960-d30c-4840-b0c1-c9960de95582',  -- Matrx System org
  31,
  true,
  2
)
ON CONFLICT (block_id) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  icon_name = EXCLUDED.icon_name,
  template = EXCLUDED.template,
  category_id = EXCLUDED.category_id,
  is_active = EXCLUDED.is_active,
  updated_at = now();

COMMIT;
