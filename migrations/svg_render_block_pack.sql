-- ============================================================================
-- SVG render block pack — skill + render registry + content blocks.
--
-- The ```svg render block (FE-only: components/mardown-display/blocks/svg/
-- SvgBlock.tsx) renders agent-authored SVG sandboxed (no scripts) + responsive
-- (from its viewBox). This migration teaches agents to USE it:
--   1. skl_definitions 'svg-illustrations' — the system skill (body injected
--      into an agent's prompt when included in agx_agent.skill_config.included).
--   2. skl_render_definitions 'svg' + skl_render_components (web active; other
--      platforms is_active=false — they await server-side block processing).
--   3. content_blocks — condensed snippets a user injects from the context menu,
--      in a new "Illustrations" content-block category.
--
-- Idempotent: skl_definitions via INSERT…SELECT…WHERE NOT EXISTS (composite
-- key), render rows via WHERE NOT EXISTS, content_blocks via ON CONFLICT
-- (block_id). The 'render-blocks' skl_categories row is reused (created by the
-- mermaid pack); created here too with ON CONFLICT DO NOTHING if absent.
-- ============================================================================

BEGIN;

-- ── 1. Skill category (shared with mermaid; create if absent) ───────────────
INSERT INTO public.skl_categories
  (category_key, label, description, icon_name, sort_order, is_active)
VALUES (
  'render-blocks',
  'Render Blocks',
  'Teaching skills for first-class streamed render blocks: when and how to emit each block type.',
  'Blocks', 50, true
)
ON CONFLICT (category_key) DO NOTHING;

-- ── 2. System skill: svg-illustrations ──────────────────────────────────────
INSERT INTO public.skl_definitions
  (skill_id, label, description, skill_type, body, icon_name,
   is_active, is_system, is_public, category_id, sort_order, version, platform_targets)
SELECT
  'svg-illustrations',
  'SVG Illustrations',
  'How and when to emit ```svg render blocks: hand-authored SVG illustrations, diagrams, and infographics that render sandboxed and responsively. The safety rules (no scripts/external refs) and authoring rules (viewBox, system fonts, accessibility) that make them render correctly.',
  'render_block',
  $SKILL_BODY$# SVG Illustrations

You can draw a custom visual by emitting a ```svg code fence containing raw SVG.
It renders immediately, scales responsively to its own aspect ratio, and becomes a
shareable, downloadable artifact. Reach for this when a BESPOKE picture communicates
better than words — an annotated figure, a conceptual diagram, an infographic, a
labeled schematic, a comparison, a stat card, a custom chart shape — anything that
isn't one of the standard diagram types.

## How to emit one

Write a fenced block with the language `svg` and a single, complete `<svg>` element:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 400"
     font-family="ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
     role="img" aria-label="Short description of the picture">
  <title>Short title</title>
  <desc>One sentence describing what the picture shows.</desc>
  <rect x="0" y="0" width="800" height="400" fill="#ffffff"/>
  <rect x="60" y="150" width="200" height="90" rx="10" fill="#EEF2FF" stroke="#6366F1" stroke-width="2"/>
  <text x="160" y="200" text-anchor="middle" font-size="18" fill="#1E293B">Input</text>
</svg>
```

No wrapper tags, no markdown around it inside the fence — just the `<svg>`.

## Hard safety rules (these BREAK or are stripped — never use them)

The SVG renders inside a locked-down sandbox with **no script execution and no network
access**. So:

- **No `<script>`, no `onclick`/`onload`/`on*` handlers, no `<animate>`-driven JS, no
  CSS `@import`.** They do nothing and signal a broken illustration.
- **No external resources** — no `<image href="https://…">`, no external fonts, no
  `xlink:href` to remote URLs. Everything must be self-contained in the one `<svg>`.
- **No `<foreignObject>` with HTML** — it won't render. Use `<text>` for all text.

## Authoring rules (these make it render WELL)

- **Always set `viewBox="0 0 W H"`** and `xmlns="http://www.w3.org/2000/svg"`. The
  frame sizes itself from the viewBox aspect ratio — do NOT rely on width/height
  attributes. Pick a sensible canvas: landscape `0 0 800 400`–`0 0 960 540`, square
  `0 0 600 600`, or portrait when the content is tall.
- **Fonts:** put a system stack on the root `<svg>`:
  `font-family="ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"`.
  Never load a web font.
- **Accessibility:** include `role="img"`, an `aria-label`, a `<title>`, and a `<desc>`.
- **Background:** if you want a solid background, draw a full-canvas `<rect fill="…"/>`
  first. Otherwise it's transparent (shows the card behind it).
- **Color:** use hex literals with good contrast. A clean palette reads professionally —
  e.g. slate text `#1E293B`/`#475569`, indigo `#6366F1`, emerald `#059669`, amber
  `#D97706`, rose `#E11D48`, surfaces `#F1F5F9`/`#EEF2FF`.
- **Text:** size with `font-size`, position with `x`/`y`, center with
  `text-anchor="middle"`. Keep labels short; SVG `<text>` does not wrap — split long
  text into multiple `<text>` lines.
- **Arrows:** define a `<marker>` in `<defs>` and reference it with `marker-end`.
- **Keep it self-contained and reasonably sized** (a few hundred elements max). For a
  giant diagram, split into multiple illustrations.

## Use SVG vs. a diagram type

- For a **standard** flowchart, sequence diagram, mind map, pie chart, timeline, state
  machine, ER diagram, gantt, journey, or quadrant — emit a **```mermaid** block
  instead. Those are structurally editable and faster to author.
- Use **```svg** for **custom** visuals mermaid can't express: annotated figures,
  infographics, bespoke schematics, comparison layouts, anatomical/architectural
  sketches, stat cards, decorative or conceptual art.

## Editing etiquette

When the user asks to change an illustration, return **ONE complete updated `<svg>`** in
a ```svg fence — never a fragment or a diff. Preserve the elements you aren't changing
(same coordinates, ids, colors) so the change is minimal.

## Quick reference — one correct example each

**Annotated box-and-arrow diagram**

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 220" font-family="ui-sans-serif, system-ui, sans-serif" role="img" aria-label="Pipeline: Source to Transform to Output">
  <title>Three-stage pipeline</title>
  <desc>Source feeds Transform, which feeds Output.</desc>
  <defs><marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="#475569"/></marker></defs>
  <rect width="720" height="220" fill="#ffffff"/>
  <rect x="40" y="80" width="160" height="60" rx="10" fill="#EEF2FF" stroke="#6366F1" stroke-width="2"/>
  <text x="120" y="116" text-anchor="middle" font-size="16" fill="#1E293B">Source</text>
  <rect x="280" y="80" width="160" height="60" rx="10" fill="#ECFDF5" stroke="#059669" stroke-width="2"/>
  <text x="360" y="116" text-anchor="middle" font-size="16" fill="#1E293B">Transform</text>
  <rect x="520" y="80" width="160" height="60" rx="10" fill="#FFFBEB" stroke="#D97706" stroke-width="2"/>
  <text x="600" y="116" text-anchor="middle" font-size="16" fill="#1E293B">Output</text>
  <line x1="200" y1="110" x2="278" y2="110" stroke="#475569" stroke-width="2" marker-end="url(#a)"/>
  <line x1="440" y1="110" x2="518" y2="110" stroke="#475569" stroke-width="2" marker-end="url(#a)"/>
</svg>
```

**Stat / infographic card**

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 200" font-family="ui-sans-serif, system-ui, sans-serif" role="img" aria-label="Key metrics">
  <title>Key metrics</title><desc>Three headline numbers.</desc>
  <rect width="600" height="200" rx="14" fill="#0F172A"/>
  <text x="100" y="95" text-anchor="middle" font-size="44" font-weight="700" fill="#A5B4FC">98%</text>
  <text x="100" y="125" text-anchor="middle" font-size="14" fill="#94A3B8">Uptime</text>
  <text x="300" y="95" text-anchor="middle" font-size="44" font-weight="700" fill="#6EE7B7">1.2s</text>
  <text x="300" y="125" text-anchor="middle" font-size="14" fill="#94A3B8">Avg latency</text>
  <text x="500" y="95" text-anchor="middle" font-size="44" font-weight="700" fill="#FCD34D">4.8</text>
  <text x="500" y="125" text-anchor="middle" font-size="14" fill="#94A3B8">Rating</text>
</svg>
```
$SKILL_BODY$,
  'Image',
  true, true, true,
  (SELECT id FROM public.skl_categories WHERE category_key = 'render-blocks'),
  20, '1.0.0', '["web"]'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM public.skl_definitions
  WHERE skill_id = 'svg-illustrations'
    AND user_id IS NULL AND organization_id IS NULL AND project_id IS NULL
);

-- ── 3. Render definition + per-platform components ──────────────────────────
INSERT INTO public.skl_render_definitions
  (block_id, label, description, icon_name, template, skill_id, is_active, is_public, sort_order)
SELECT
  'svg',
  'SVG Illustration',
  'Raw SVG render block. Renders sandboxed (no scripts) and responsively from its viewBox; materializes into a downloadable/shareable artifact.',
  'Image',
  E'```svg\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200" role="img" aria-label="Example">\n  <rect width="400" height="200" fill="#EEF2FF"/>\n  <text x="200" y="110" text-anchor="middle" font-size="20" fill="#3730A3">Hello SVG</text>\n</svg>\n```',
  (SELECT id FROM public.skl_definitions WHERE skill_id = 'svg-illustrations'),
  true, true, 20
WHERE NOT EXISTS (
  SELECT 1 FROM public.skl_render_definitions WHERE block_id = 'svg'
);

WITH rd AS (
  SELECT id FROM public.skl_render_definitions WHERE block_id = 'svg' LIMIT 1
)
INSERT INTO public.skl_render_components
  (render_definition_id, component_key, platform, import_path, is_active, sort_order)
SELECT rd.id, v.component_key, v.platform, v.import_path, v.is_active, v.sort_order
FROM rd,
  (VALUES
    ('SvgBlock', 'web',              '@/components/mardown-display/blocks/svg/SvgBlock', true,  10),
    ('SvgBlock', 'chrome-extension', NULL,                                               false, 20),
    ('SvgBlock', 'desktop',          NULL,                                               false, 30),
    ('SvgBlock', 'mobile',           NULL,                                               false, 40)
  ) AS v(component_key, platform, import_path, is_active, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.skl_render_components c
  WHERE c.render_definition_id = rd.id AND c.platform = v.platform
);

-- ── 4. Content blocks (condensed prompt snippets) ───────────────────────────
INSERT INTO public.shortcut_categories
  (placement_type, label, description, icon_name, sort_order, is_active)
SELECT
  'content-block', 'Illustrations',
  'Inject instructions that teach an agent to draw a custom visual as a live ```svg render block — illustrations, diagrams, infographics, stat cards.',
  'Image', 45, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.shortcut_categories
  WHERE placement_type = 'content-block' AND label = 'Illustrations'
    AND user_id IS NULL AND organization_id IS NULL
    AND project_id IS NULL AND task_id IS NULL
);

INSERT INTO public.content_blocks (block_id, label, description, icon_name, template, category_id, sort_order, is_active)
SELECT v.block_id, v.label, v.description, 'Image', v.template,
       (SELECT id FROM public.shortcut_categories
         WHERE placement_type = 'content-block' AND label = 'Illustrations'
           AND user_id IS NULL AND organization_id IS NULL AND project_id IS NULL AND task_id IS NULL LIMIT 1),
       v.sort_order, true
FROM (VALUES
  ('svg-illustration', 'Custom Illustration (SVG)', 'Draw a bespoke visual the standard diagram types cannot express', 10,
   $CB$When a CUSTOM visual communicates better than prose (and it isn't a standard flowchart/sequence/pie/timeline — use ```mermaid for those), draw it as an SVG render block. It renders live and becomes a downloadable, shareable artifact:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 400" font-family="ui-sans-serif, system-ui, sans-serif" role="img" aria-label="Describe the picture">
  <title>Title</title><desc>One-sentence description.</desc>
  <rect width="800" height="400" fill="#ffffff"/>
  <!-- shapes, text, lines, paths -->
</svg>
```

Rules: ALWAYS set viewBox (sizing comes from it — not width/height). NO <script>, on* handlers, external images/fonts, or <foreignObject> (sandboxed — they're stripped). Use a system font stack on the <svg>, hex colors with good contrast, <text> for all text (it doesn't wrap — split long lines). Include <title>/<desc>. Return ONE complete <svg> when editing.$CB$),

  ('svg-diagram', 'Diagram / Schematic (SVG)', 'Boxes, arrows, and labels for a custom schematic', 20,
   $CB$For a custom schematic that mermaid can't express, emit a labeled box-and-arrow SVG:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 220" font-family="ui-sans-serif, system-ui, sans-serif" role="img" aria-label="Pipeline">
  <defs><marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="#475569"/></marker></defs>
  <rect width="720" height="220" fill="#ffffff"/>
  <rect x="60" y="80" width="160" height="60" rx="10" fill="#EEF2FF" stroke="#6366F1" stroke-width="2"/>
  <text x="140" y="116" text-anchor="middle" font-size="16" fill="#1E293B">Step A</text>
  <line x1="220" y1="110" x2="320" y2="110" stroke="#475569" stroke-width="2" marker-end="url(#a)"/>
</svg>
```

Rules: viewBox required; no scripts/external refs/foreignObject; define arrowheads as a <marker> and use marker-end; system fonts; hex colors; <title>/<desc> for accessibility.$CB$),

  ('svg-infographic', 'Infographic / Stat Card (SVG)', 'Headline numbers or a small infographic', 30,
   $CB$For headline numbers or a compact infographic, emit an SVG stat card:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 200" font-family="ui-sans-serif, system-ui, sans-serif" role="img" aria-label="Key metrics">
  <title>Key metrics</title><desc>Three headline numbers.</desc>
  <rect width="600" height="200" rx="14" fill="#0F172A"/>
  <text x="150" y="95" text-anchor="middle" font-size="44" font-weight="700" fill="#A5B4FC">98%</text>
  <text x="150" y="125" text-anchor="middle" font-size="14" fill="#94A3B8">Uptime</text>
  <text x="450" y="95" text-anchor="middle" font-size="44" font-weight="700" fill="#6EE7B7">1.2s</text>
  <text x="450" y="125" text-anchor="middle" font-size="14" fill="#94A3B8">Latency</text>
</svg>
```

Rules: viewBox required; sandboxed (no scripts/external refs); system fonts; large bold numbers + small muted labels; hex colors with contrast; <title>/<desc>.$CB$)
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
