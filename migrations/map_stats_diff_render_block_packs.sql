-- ============================================================================
-- Map + Stats + Diff render-block packs — skills + render registry + content
-- blocks for three new fence-based render blocks. Idempotent. Reuses the
-- 'render-blocks' skl_categories row.
-- ============================================================================

BEGIN;

INSERT INTO public.skl_categories (category_key, label, description, icon_name, sort_order, is_active)
VALUES ('render-blocks', 'Render Blocks',
        'Teaching skills for first-class streamed render blocks: when and how to emit each block type.',
        'Blocks', 50, true)
ON CONFLICT (category_key) DO NOTHING;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. MAPS — interactive-maps
-- ════════════════════════════════════════════════════════════════════════════
INSERT INTO public.skl_definitions
  (skill_id, label, description, skill_type, body, icon_name, is_active, is_system, is_public, category_id, sort_order, version, platform_targets)
SELECT 'interactive-maps', 'Interactive Maps',
  'How and when to emit a ```map render block: an interactive Leaflet map with markers. The JSON spec the parser expects.',
  'render_block',
  $SKILL_BODY$# Interactive Maps

When locations matter — an itinerary, a set of offices, "where is X", points of interest —
emit a ```map render block. It renders a real interactive map (pan, zoom, marker popups,
auto-fit to the markers). Far clearer than listing coordinates in prose.

## How to emit one

```map
{
  "title": "Our offices",
  "markers": [
    { "lat": 40.7128, "lng": -74.0060, "label": "New York", "description": "HQ — 200 staff" },
    { "lat": 51.5074, "lng": -0.1278, "label": "London", "description": "EMEA" },
    { "lat": 35.6762, "lng": 139.6503, "label": "Tokyo" }
  ]
}
```

## The spec

- `markers` — an array of `{ "lat": number, "lng": number, "label"?: string, "description"?: string }`.
  `label`/`description` show in a popup when the marker is clicked. **Required: at least one marker.**
- `center` — optional `[lat, lng]` to center on. **Omit it and the map auto-fits to show all markers** (preferred).
- `zoom` — optional initial zoom (1 world … 18 street). Only meaningful with `center`.
- `title` — optional heading.

## Rules

- **Valid JSON** — double-quoted keys, no trailing commas. Use real decimal lat/lng
  (lat −90..90, lng −180..180).
- **Don't invent coordinates** — only place markers at locations you actually know the
  coordinates for; if unsure, say so rather than guessing.
- One map per ```map fence. Keep to a sensible number of markers.
$SKILL_BODY$,
  'MapPin', true, true, true,
  (SELECT id FROM public.skl_categories WHERE category_key = 'render-blocks'), 50, '1.0.0', '["web"]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.skl_definitions WHERE skill_id = 'interactive-maps' AND user_id IS NULL AND organization_id IS NULL AND project_id IS NULL);

INSERT INTO public.skl_render_definitions (block_id, label, description, icon_name, template, skill_id, is_active, is_public, sort_order)
SELECT 'map', 'Map', 'Interactive Leaflet map from a ```map JSON spec (markers/places).', 'MapPin',
  E'```map\n{ "markers": [ {"lat":40.71,"lng":-74.0,"label":"New York"} ] }\n```',
  (SELECT id FROM public.skl_definitions WHERE skill_id = 'interactive-maps'), true, true, 50
WHERE NOT EXISTS (SELECT 1 FROM public.skl_render_definitions WHERE block_id = 'map');

WITH rd AS (SELECT id FROM public.skl_render_definitions WHERE block_id = 'map' LIMIT 1)
INSERT INTO public.skl_render_components (render_definition_id, component_key, platform, import_path, is_active, sort_order)
SELECT rd.id, v.component_key, v.platform, v.import_path, v.is_active, v.sort_order FROM rd,
  (VALUES ('MapBlock','web','@/components/mardown-display/blocks/map/MapBlock',true,10),
          ('MapBlock','chrome-extension',NULL,false,20),('MapBlock','desktop',NULL,false,30),('MapBlock','mobile',NULL,false,40)
  ) AS v(component_key,platform,import_path,is_active,sort_order)
WHERE NOT EXISTS (SELECT 1 FROM public.skl_render_components c WHERE c.render_definition_id = rd.id AND c.platform = v.platform);

-- ════════════════════════════════════════════════════════════════════════════
-- 2. STATS — stat-cards
-- ════════════════════════════════════════════════════════════════════════════
INSERT INTO public.skl_definitions
  (skill_id, label, description, skill_type, body, icon_name, is_active, is_system, is_public, category_id, sort_order, version, platform_targets)
SELECT 'stat-cards', 'Stat Cards',
  'How and when to emit a ```stats render block: a row of KPI / headline-metric cards with up/down deltas.',
  'render_block',
  $SKILL_BODY$# Stat Cards

When you have **headline numbers** to surface — KPIs, results, a summary of figures —
emit a ```stats block. It renders a clean row of metric cards (big value, label, a
colored up/down change). Use it for the figures themselves; use a ```chart for trends
over time.

## How to emit one

```stats
{
  "title": "Q3 results",
  "stats": [
    { "label": "Revenue", "value": "$1.2M", "change": "+12%", "trend": "up" },
    { "label": "Active users", "value": "8,400", "change": "+5%", "trend": "up" },
    { "label": "Churn", "value": "2.1%", "change": "-0.4pt", "trend": "down" },
    { "label": "NPS", "value": "52", "hint": "up from 47" }
  ]
}
```

## The spec

- `stats` — an array of `{ "label": string, "value": string, "change"?: string, "trend"?: "up"|"down"|"flat", "hint"?: string }`.
- **`value` is a formatted string** — keep the units/symbols you want shown (`"$1.2M"`, `"8,400"`, `"2.1%"`).
- `change` is the delta string (`"+12%"`, `"-0.4pt"`). `trend` colors it (up=green, down=red, flat=grey);
  if you omit `trend`, it's inferred from a leading `+`/`-`.
- `hint` is a small note under the value. `title` is an optional heading.

## Rules

- Valid JSON, no trailing commas. Aim for 2–4 cards (up to ~6).
- For trends over time / comparisons of series, use a ```chart instead.
$SKILL_BODY$,
  'BarChart3', true, true, true,
  (SELECT id FROM public.skl_categories WHERE category_key = 'render-blocks'), 50, '1.0.0', '["web"]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.skl_definitions WHERE skill_id = 'stat-cards' AND user_id IS NULL AND organization_id IS NULL AND project_id IS NULL);

INSERT INTO public.skl_render_definitions (block_id, label, description, icon_name, template, skill_id, is_active, is_public, sort_order)
SELECT 'stats', 'Stat Cards', 'KPI / headline-metric cards from a ```stats JSON spec.', 'BarChart3',
  E'```stats\n{ "stats": [ {"label":"Revenue","value":"$1.2M","change":"+12%","trend":"up"} ] }\n```',
  (SELECT id FROM public.skl_definitions WHERE skill_id = 'stat-cards'), true, true, 50
WHERE NOT EXISTS (SELECT 1 FROM public.skl_render_definitions WHERE block_id = 'stats');

WITH rd AS (SELECT id FROM public.skl_render_definitions WHERE block_id = 'stats' LIMIT 1)
INSERT INTO public.skl_render_components (render_definition_id, component_key, platform, import_path, is_active, sort_order)
SELECT rd.id, v.component_key, v.platform, v.import_path, v.is_active, v.sort_order FROM rd,
  (VALUES ('StatsBlock','web','@/components/mardown-display/blocks/stats/StatsBlock',true,10),
          ('StatsBlock','chrome-extension',NULL,false,20),('StatsBlock','desktop',NULL,false,30),('StatsBlock','mobile',NULL,false,40)
  ) AS v(component_key,platform,import_path,is_active,sort_order)
WHERE NOT EXISTS (SELECT 1 FROM public.skl_render_components c WHERE c.render_definition_id = rd.id AND c.platform = v.platform);

-- ════════════════════════════════════════════════════════════════════════════
-- 3. DIFF — code-diffs
-- ════════════════════════════════════════════════════════════════════════════
INSERT INTO public.skl_definitions
  (skill_id, label, description, skill_type, body, icon_name, is_active, is_system, is_public, category_id, sort_order, version, platform_targets)
SELECT 'code-diffs', 'Before / After Diffs',
  'How and when to emit a ```diff render block: a highlighted before/after comparison of code or text.',
  'render_block',
  $SKILL_BODY$# Before / After Diffs

When you change something — refactor code, rewrite a paragraph, revise a config — show
the change as a ```diff block. It renders a highlighted before/after comparison
(added lines green, removed red), split or unified. Much clearer than describing edits.

## How to emit one

```diff
{
  "title": "Use a guard clause",
  "old": "function f(x) {\n  if (x) {\n    return x.value;\n  }\n  return null;\n}",
  "new": "function f(x) {\n  if (!x) return null;\n  return x.value;\n}",
  "split": true
}
```

## The spec

- `old` — the original full text/code (a single string; use `\n` for newlines).
- `new` — the updated full text/code.
- `title` — optional heading.
- `split` — `true` (default) shows side-by-side Before/After; `false` shows a unified diff.

## Rules

- **Both `old` and `new` are COMPLETE strings**, not fragments — the viewer computes the
  diff. Don't pre-mark lines with `+`/`-`.
- Valid JSON: escape newlines as `\n` and quotes as `\"` inside the strings.
- Use this for genuine before/after comparisons; for a brand-new snippet, use a ```code block.
$SKILL_BODY$,
  'GitCompareArrows', true, true, true,
  (SELECT id FROM public.skl_categories WHERE category_key = 'render-blocks'), 50, '1.0.0', '["web"]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.skl_definitions WHERE skill_id = 'code-diffs' AND user_id IS NULL AND organization_id IS NULL AND project_id IS NULL);

INSERT INTO public.skl_render_definitions (block_id, label, description, icon_name, template, skill_id, is_active, is_public, sort_order)
SELECT 'diff', 'Diff', 'Before/after diff from a ```diff JSON spec ({old,new}).', 'GitCompareArrows',
  E'```diff\n{ "old": "a\\nb", "new": "a\\nc" }\n```',
  (SELECT id FROM public.skl_definitions WHERE skill_id = 'code-diffs'), true, true, 50
WHERE NOT EXISTS (SELECT 1 FROM public.skl_render_definitions WHERE block_id = 'diff');

WITH rd AS (SELECT id FROM public.skl_render_definitions WHERE block_id = 'diff' LIMIT 1)
INSERT INTO public.skl_render_components (render_definition_id, component_key, platform, import_path, is_active, sort_order)
SELECT rd.id, v.component_key, v.platform, v.import_path, v.is_active, v.sort_order FROM rd,
  (VALUES ('DiffBlock','web','@/components/mardown-display/blocks/diff/DiffBlock',true,10),
          ('DiffBlock','chrome-extension',NULL,false,20),('DiffBlock','desktop',NULL,false,30),('DiffBlock','mobile',NULL,false,40)
  ) AS v(component_key,platform,import_path,is_active,sort_order)
WHERE NOT EXISTS (SELECT 1 FROM public.skl_render_components c WHERE c.render_definition_id = rd.id AND c.platform = v.platform);

-- ════════════════════════════════════════════════════════════════════════════
-- Content blocks — Maps · Metrics · Diffs categories
-- ════════════════════════════════════════════════════════════════════════════
INSERT INTO public.shortcut_categories (placement_type, label, description, icon_name, sort_order, is_active)
SELECT * FROM (VALUES
  ('content-block','Maps','Teach an agent to plot locations on an interactive ```map.','MapPin',46,true),
  ('content-block','Metrics','Teach an agent to surface headline numbers as ```stats KPI cards.','BarChart3',43,true),
  ('content-block','Diffs','Teach an agent to show before/after changes as a ```diff.','GitCompareArrows',47,true)
) AS v(placement_type,label,description,icon_name,sort_order,is_active)
WHERE NOT EXISTS (
  SELECT 1 FROM public.shortcut_categories c
  WHERE c.placement_type='content-block' AND c.label=v.label
    AND c.user_id IS NULL AND c.organization_id IS NULL AND c.project_id IS NULL AND c.task_id IS NULL);

INSERT INTO public.content_blocks (block_id, label, icon_name, template, category_id, sort_order, is_active)
SELECT v.block_id, v.label, v.icon_name, v.template,
  (SELECT id FROM public.shortcut_categories WHERE placement_type='content-block' AND label=v.cat
     AND user_id IS NULL AND organization_id IS NULL AND project_id IS NULL AND task_id IS NULL LIMIT 1),
  v.sort_order, true
FROM (VALUES
  ('map-places','Map of places','MapPin','Maps',10,
   $CB$When locations matter (an itinerary, offices, points of interest), plot them on an interactive map instead of listing coordinates:

```map
{ "title": "Itinerary", "markers": [
  {"lat":48.8584,"lng":2.2945,"label":"Eiffel Tower","description":"Day 1"},
  {"lat":48.8606,"lng":2.3376,"label":"Louvre","description":"Day 2"}
] }
```

Each marker is {lat, lng, label?, description?}; label/description show in a popup. Omit `center` to auto-fit all markers. Valid JSON, real decimal coordinates — never invent coordinates you don't know.$CB$),
  ('stats-kpi','KPI / Stat cards','BarChart3','Metrics',10,
   $CB$When you have headline numbers (KPIs, results, a summary), show them as stat cards instead of a sentence:

```stats
{ "title": "This month", "stats": [
  {"label":"Revenue","value":"$1.2M","change":"+12%","trend":"up"},
  {"label":"Churn","value":"2.1%","change":"-0.4pt","trend":"down"}
] }
```

Each stat is {label, value (a formatted string), change?, trend? up/down/flat, hint?}. trend colors the change (auto-inferred from +/− if omitted). For trends over time, use a ```chart instead. Valid JSON, no trailing commas.$CB$),
  ('diff-before-after','Before / After diff','GitCompareArrows','Diffs',10,
   $CB$When you change code or text, show it as a before/after diff instead of describing the edit:

```diff
{ "title": "Refactor", "old": "if (x) {\n  return x.value;\n}\nreturn null;", "new": "if (!x) return null;\nreturn x.value;", "split": true }
```

`old` and `new` are COMPLETE strings (escape newlines as \n) — the viewer computes the highlight; don't pre-mark lines with +/−. `split:true` = side-by-side, `false` = unified. For a brand-new snippet (no "before"), use a ```code block.$CB$)
) AS v(block_id,label,icon_name,cat,sort_order,template)
ON CONFLICT (block_id) DO UPDATE SET
  label=EXCLUDED.label, template=EXCLUDED.template,
  category_id=EXCLUDED.category_id, sort_order=EXCLUDED.sort_order, is_active=true, updated_at=now();

COMMIT;
