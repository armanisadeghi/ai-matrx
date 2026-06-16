-- ============================================================================
-- Chart render block pack — skill + render registry + content blocks.
--
-- The ```chart render block (components/mardown-display/blocks/chart/) renders a
-- small JSON spec as a recharts bar/line/area/pie/scatter chart. This migration
-- teaches agents to emit it:
--   1. skl_definitions 'data-charts' — the system skill.
--   2. skl_render_definitions 'chart' + skl_render_components (web active).
--   3. content_blocks in a new "Charts" content-block category.
--
-- Idempotent (WHERE NOT EXISTS / ON CONFLICT). The 'render-blocks' skl_categories
-- row is reused (created by earlier packs); created here too if absent.
-- ============================================================================

BEGIN;

-- ── 1. Skill category (shared; create if absent) ────────────────────────────
INSERT INTO public.skl_categories
  (category_key, label, description, icon_name, sort_order, is_active)
VALUES (
  'render-blocks',
  'Render Blocks',
  'Teaching skills for first-class streamed render blocks: when and how to emit each block type.',
  'Blocks', 50, true
)
ON CONFLICT (category_key) DO NOTHING;

-- ── 2. System skill: data-charts ────────────────────────────────────────────
INSERT INTO public.skl_definitions
  (skill_id, label, description, skill_type, body, icon_name,
   is_active, is_system, is_public, category_id, sort_order, version, platform_targets)
SELECT
  'data-charts',
  'Data Charts',
  'How and when to emit ```chart render blocks: a small JSON spec rendered as a bar / line / area / pie / scatter chart. The spec shape, the type-to-intent map, and the rules that make it render.',
  'render_block',
  $SKILL_BODY$# Data Charts

When you have NUMBERS to show — a comparison, a trend, a breakdown, a distribution —
emit a ```chart code fence with a small JSON spec. It renders as a real, interactive
chart (hover tooltips, legend) and becomes a shareable artifact. A chart reads far
faster than a table of numbers.

## How to emit one

Write a fenced block with the language `chart` and a JSON object:

```chart
{
  "type": "bar",
  "title": "Monthly Revenue",
  "x": "month",
  "y": ["revenue", "profit"],
  "data": [
    { "month": "Jan", "revenue": 100, "profit": 20 },
    { "month": "Feb", "revenue": 120, "profit": 30 },
    { "month": "Mar", "revenue": 90,  "profit": 15 }
  ]
}
```

## Pick the type for the intent

| You want to show… | `type` |
|---|---|
| Compare quantities across categories | `bar` |
| A trend over time / an ordered sequence | `line` |
| A trend with magnitude / cumulative volume | `area` |
| Parts of a whole (proportions) | `pie` |
| Correlation between two numbers | `scatter` |

For a flowchart / sequence / mind map / timeline, use a ```mermaid block instead. For a
bespoke custom visual, use a ```svg block.

## The spec

**Cartesian charts (bar / line / area / scatter):**
- `type` — one of `bar`, `line`, `area`, `scatter`.
- `title` — optional heading.
- `x` — the name of the CATEGORY field in each data row (e.g. `"month"`).
- `y` — an ARRAY of the numeric field names to plot as series (e.g. `["revenue","profit"]`).
- `data` — an array of objects; each object has the `x` field plus every `y` field.

**Pie charts:**
```chart
{ "type": "pie", "title": "Market Share",
  "data": [ {"label":"Acme","value":45}, {"label":"Globex","value":30}, {"label":"Other","value":25} ] }
```
- Each `data` item is `{ "label": "...", "value": number }`.

## Rules that make it render

- **Valid JSON** — double-quoted keys/strings, no comments, no trailing commas.
- **`data` must be a non-empty array of objects.** Each cartesian row needs the `x`
  field and the numeric `y` fields; numbers may be numbers or numeric strings.
- **Keep it legible** — at most ~6 series; for a pie, ~8 slices. For many points,
  prefer `line`/`area` over `bar`.
- **Don't restyle** — colors are assigned automatically. To override, add
  `"series": [ {"key":"revenue","label":"Revenue","color":"#6366F1"} ]`.
- **One chart per fence.** When editing, return ONE complete updated ```chart spec.

## Quick reference

**Line (trend)**
```chart
{ "type": "line", "title": "Signups", "x": "week", "y": ["signups"],
  "data": [ {"week":"W1","signups":40}, {"week":"W2","signups":65}, {"week":"W3","signups":58}, {"week":"W4","signups":90} ] }
```

**Pie (proportions)**
```chart
{ "type": "pie", "title": "Traffic by source",
  "data": [ {"label":"Organic","value":52}, {"label":"Paid","value":28}, {"label":"Referral","value":20} ] }
```

**Grouped bar (multi-series)**
```chart
{ "type": "bar", "title": "Quarterly by region", "x": "quarter", "y": ["north","south"],
  "data": [ {"quarter":"Q1","north":30,"south":20}, {"quarter":"Q2","north":45,"south":35} ] }
```
$SKILL_BODY$,
  'BarChart3',
  true, true, true,
  (SELECT id FROM public.skl_categories WHERE category_key = 'render-blocks'),
  30, '1.0.0', '["web"]'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM public.skl_definitions
  WHERE skill_id = 'data-charts'
    AND user_id IS NULL AND organization_id IS NULL AND project_id IS NULL
);

-- ── 3. Render definition + per-platform components ──────────────────────────
INSERT INTO public.skl_render_definitions
  (block_id, label, description, icon_name, template, skill_id, is_active, is_public, sort_order)
SELECT
  'chart',
  'Data Chart',
  'JSON-spec chart render block (bar/line/area/pie/scatter via recharts, loaded on demand). Renders on stream close; invalid specs show a contained error.',
  'BarChart3',
  E'```chart\n{\n  "type": "bar",\n  "title": "Example",\n  "x": "name",\n  "y": ["value"],\n  "data": [ {"name":"A","value":30}, {"name":"B","value":55}, {"name":"C","value":42} ]\n}\n```',
  (SELECT id FROM public.skl_definitions WHERE skill_id = 'data-charts'),
  true, true, 30
WHERE NOT EXISTS (
  SELECT 1 FROM public.skl_render_definitions WHERE block_id = 'chart'
);

WITH rd AS (
  SELECT id FROM public.skl_render_definitions WHERE block_id = 'chart' LIMIT 1
)
INSERT INTO public.skl_render_components
  (render_definition_id, component_key, platform, import_path, is_active, sort_order)
SELECT rd.id, v.component_key, v.platform, v.import_path, v.is_active, v.sort_order
FROM rd,
  (VALUES
    ('ChartBlock', 'web',              '@/components/mardown-display/blocks/chart/ChartBlock', true,  10),
    ('ChartBlock', 'chrome-extension', NULL,                                                   false, 20),
    ('ChartBlock', 'desktop',          NULL,                                                   false, 30),
    ('ChartBlock', 'mobile',           NULL,                                                   false, 40)
  ) AS v(component_key, platform, import_path, is_active, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.skl_render_components c
  WHERE c.render_definition_id = rd.id AND c.platform = v.platform
);

-- ── 4. Content blocks ───────────────────────────────────────────────────────
INSERT INTO public.shortcut_categories
  (placement_type, label, description, icon_name, sort_order, is_active)
SELECT
  'content-block', 'Charts',
  'Inject instructions that teach an agent to visualize numbers as a live ```chart render block (bar, line, pie, area).',
  'BarChart3', 42, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.shortcut_categories
  WHERE placement_type = 'content-block' AND label = 'Charts'
    AND user_id IS NULL AND organization_id IS NULL
    AND project_id IS NULL AND task_id IS NULL
);

INSERT INTO public.content_blocks (block_id, label, description, icon_name, template, category_id, sort_order, is_active)
SELECT v.block_id, v.label, v.description, 'BarChart3', v.template,
       (SELECT id FROM public.shortcut_categories
         WHERE placement_type = 'content-block' AND label = 'Charts'
           AND user_id IS NULL AND organization_id IS NULL AND project_id IS NULL AND task_id IS NULL LIMIT 1),
       v.sort_order, true
FROM (VALUES
  ('chart-any', 'Any Chart (numbers)', 'Visualize numeric data as a live chart — pick the right type', 0,
   $CB$When you have NUMBERS to show (a comparison, trend, breakdown, or distribution), emit a ```chart render block instead of a table. It renders as a real interactive chart and becomes a shareable artifact:

```chart
{ "type": "bar", "title": "Title", "x": "name", "y": ["value"],
  "data": [ {"name":"A","value":30}, {"name":"B","value":55} ] }
```

Pick the type by intent: bar = compare categories; line = trend over time; area = cumulative trend; pie = parts of a whole ({label, value} items); scatter = correlation. Rules: valid JSON (no trailing commas); `data` is a non-empty array of objects; cartesian rows have the `x` field + each `y` field; numbers can be numeric strings. One chart per fence; return one complete updated spec when editing.$CB$),

  ('chart-bar', 'Bar Chart', 'Compare quantities across categories', 10,
   $CB$To compare quantities across categories, emit a bar chart:

```chart
{ "type": "bar", "title": "Revenue by region", "x": "region", "y": ["revenue"],
  "data": [ {"region":"North","revenue":120}, {"region":"South","revenue":90}, {"region":"East","revenue":75} ] }
```

For grouped bars, list multiple series in `y` (e.g. ["revenue","profit"]) and include each in every data row. Valid JSON, no trailing commas; one chart per ```chart fence.$CB$),

  ('chart-line', 'Line Chart', 'Show a trend over time', 20,
   $CB$To show a trend over time or an ordered sequence, emit a line chart:

```chart
{ "type": "line", "title": "Weekly signups", "x": "week", "y": ["signups"],
  "data": [ {"week":"W1","signups":40}, {"week":"W2","signups":65}, {"week":"W3","signups":58}, {"week":"W4","signups":90} ] }
```

`x` is the time/sequence field; `y` lists the numeric series. Use `"type":"area"` for a cumulative/volume feel. Valid JSON; one chart per fence.$CB$),

  ('chart-pie', 'Pie Chart', 'Show parts of a whole', 30,
   $CB$To show proportions (parts of a whole), emit a pie chart:

```chart
{ "type": "pie", "title": "Traffic by source",
  "data": [ {"label":"Organic","value":52}, {"label":"Paid","value":28}, {"label":"Referral","value":20} ] }
```

Each item is {label, value}. Keep to ~8 slices; for more categories use a bar chart. Valid JSON, no trailing commas.$CB$)
) AS v(block_id, label, description, sort_order, template)
ON CONFLICT (block_id) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  template = EXCLUDED.template,
  category_id = EXCLUDED.category_id,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

COMMIT;
