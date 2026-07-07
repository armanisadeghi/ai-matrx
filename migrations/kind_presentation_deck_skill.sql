-- migration: kind_presentation_deck_skill
-- Teaches AI Matrx agents to emit the content-ir `presentation_deck` __kind block
-- (the FLAT { "__kind":"presentation_deck", slides:[{ "__kind":"presentation_slide", ... }] }
-- shape recognized live by the content-ir pipeline), plus user-injectable content blocks.
--
-- Distinct from the legacy `slide-decks` skill, which teaches the OLD root-key
-- { "presentation": { slides, theme } } shape. This file DOES NOT touch that row.
--
-- Idempotent + schema-qualified. Safe to re-apply. Do NOT hand-apply — the
-- content-ir kind orchestrator applies all kind skills centrally.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Platform skill — skill.definition
--    organization_id is NOT NULL → system org 39c38960-… (same as mermaid /
--    slide-decks system skills). Scope columns user_id/project_id/task_id NULL
--    = global. Unique on (skill_id, user_id, organization_id, project_id) →
--    INSERT … SELECT … WHERE NOT EXISTS (never ON CONFLICT (skill_id)).
--    category_id 49c845cb-… = the render-blocks skill category (shared with
--    mermaid-diagrams / slide-decks).
-- ---------------------------------------------------------------------------
INSERT INTO skill.definition (
  skill_id, label, description, skill_type, body, icon_name,
  platform_targets, semver, category_id,
  is_active, is_system, sort_order,
  organization_id, project_id, task_id, visibility
)
SELECT
  'presentation-deck-kind',
  'Presentation Deck',
  'How and when to emit a content-ir presentation_deck block: the flat { "__kind":"presentation_deck", slides } JSON shape, the presentation_slide fields, the slide layouts (title/section/bullets/two-column/quote/stat/image/closing), theme presets, syntax rules that prevent render failures, sizing, and editing etiquette.',
  'render_block',
  $BODY$# Presentation Deck

You can turn content — research findings, an analysis, a plan, a summary — into a
beautiful, navigable slide deck. It renders inline (arrow-key navigation, fullscreen,
export) while you stream, persists as a versioned artifact the user can edit, and can be
opened in canvas and modified by other agents later. When the user has something worth
PRESENTING, build a deck instead of a wall of text.

## How to emit a deck

Emit a single JSON object carrying `"__kind": "presentation_deck"`. A ```json fence is
fine — the content-ir pipeline recognizes the block fenced or unfenced. The shape is
FLAT: `slides` is a top-level array, and each slide is its own object carrying
`"__kind": "presentation_slide"`.

```json
{
  "__kind": "presentation_deck",
  "title": "State of the Market 2026",
  "theme": { "variant": "fancy", "primaryColor": "#4F46E5", "accentColor": "#06B6D4" },
  "slides": [
    { "__kind": "presentation_slide", "layout": "title", "title": "State of the Market 2026", "subtitle": "What changed and what it means" },
    { "__kind": "presentation_slide", "layout": "section", "title": "1 · The Landscape", "description": "Where things stand today" },
    { "__kind": "presentation_slide", "layout": "bullets", "title": "Three forces reshaping the field",
      "bullets": ["**Adoption** crossed the majority line", "Costs fell 60% YoY", "Regulation is arriving fast"] },
    { "__kind": "presentation_slide", "layout": "quote", "quote": "The shift is no longer coming — it is here.", "author": "Industry Report 2026" },
    { "__kind": "presentation_slide", "layout": "closing", "title": "Thank you", "subtitle": "Questions welcome" }
  ]
}
```

Rules:
- The deck object MUST carry `"__kind": "presentation_deck"` and a non-empty `slides` array. A deck with an empty `slides` array does not render — always emit at least one slide.
- Every slide object MUST carry `"__kind": "presentation_slide"`. Do NOT nest slides under a `presentation` wrapper key — the shape is flat (deck → `slides` → slide objects).
- Emit ONE deck per block. Never place two `presentation_deck` objects in the same JSON object.
- Never wrap the block in `<artifact>` tags — the JSON block IS the artifact.

## The structure (fields)

**Deck (`presentation_deck`)**
| Field | Type | Notes |
|---|---|---|
| `__kind` | string | Required. Must be `"presentation_deck"`. |
| `slides` | array | Required. One or more `presentation_slide` objects. |
| `title` | string | Deck title (used as the export/canvas name). |
| `theme` | object | Optional styling (see Theme below). |

**Slide (`presentation_slide`)** — every field except `__kind` is optional; use only what the layout needs.
| Field | Type | Notes |
|---|---|---|
| `__kind` | string | Required. Must be `"presentation_slide"`. |
| `layout` | string | Which layout to render (see table below). Preferred over `type`. |
| `type` | string | Legacy alias for `layout` (inferred when `layout` is absent). |
| `title` | string | Slide heading. |
| `subtitle` | string | Smaller line under the title (title/closing slides). |
| `description` | string | A short lead paragraph. |
| `bullets` | string[] | Bullet points. Wrap emphasis in `**bold**`. |
| `quote` | string | The quote text for a quote slide. |
| `author` | string | Attribution for a quote slide. |
| `image_url` | string | A DURABLE image URL for image layouts. |
| `notes` | string | Speaker notes (shown in notes view, not on the slide). |

## Choosing the right layout (`slide.layout`)

| Slide purpose | `layout` | Key fields |
|---|---|---|
| Cover / opening | `title` | `title`, `subtitle` |
| Section divider | `section` | `title`, `description` |
| Key points | `bullets` | `title`, `bullets` |
| Side-by-side (pros/cons, before/after) | `two-column` | `title`, `extra.columns` |
| Memorable line | `quote` | `quote`, `author` |
| Big numbers | `stat` | `title`, `extra.stats` |
| Full-bleed hero image | `image-full` | `title`, `description`, `image_url` |
| Image beside text | `image-split` | `title`, `bullets`, `image_url` |
| Closing / takeaways | `closing` | `title`, `subtitle` |

Layout names are normalized loosely: `intro`/`cover`/`hero` → title; `outro`/`thank-you`/`end` → closing; `content` infers from the fields present. Prefer the canonical names above so intent is explicit.

**Stat and two-column slides read from an `extra` object:**
- Stat: `"extra": { "stats": [ {"value":"71%","label":"now adopting"}, {"value":"3.2x","label":"YoY growth"} ] }`
- Two-column: `"extra": { "columns": [ {"title":"Pros","bullets":["..."]}, {"title":"Cons","bullets":["..."]} ] }`

## Theme

`theme` is optional metadata (styling, not content). Fields: `variant`, `primaryColor`, `secondaryColor`, `accentColor`, `backgroundColor`, `textColor`, `font`.

- `variant` sets the visual tier: `"generic"` (clean, minimal), `"fancy"` (default — gradients, display type, varied layouts), `"deluxe"` (fancy + full-bleed imagery).
- For an instant on-brand look, set a preset instead of hand-picking colors: `"theme": { "preset": "editorial" }`. Presets: `classic`, `corporate`, `editorial`, `bold`, `minimal`, `midnight`, `ocean`, `sunset`, `forest`, `mono`. You can still override a single color alongside a preset.
- Colors are hex strings. All theme fields are optional — omitting `theme` yields a sensible default.

## Syntax rules that prevent render failures

These are the errors that actually break decks in production — follow them exactly:

1. VALID JSON only. Double-quote every key and string; no trailing commas; no comments inside the emitted block. A single malformed slide breaks the whole deck.
2. `bullets` is an array of STRINGS, never an array of objects. Put emphasis inline with `**bold**` — do not use nested markdown lists.
3. Keep BOTH `__kind` discriminators. Dropping `presentation_slide` on a slide, or `presentation_deck` on the deck, prevents the pipeline from recognizing the block.
4. `stats` and `columns` live UNDER `extra`, never as top-level slide fields. `{"stats":[...]}` at slide top-level will not render.
5. Image slides need a DURABLE `image_url` (a public/CDN URL). Never fabricate a URL. If you don't have one, OMIT `image_url` and add `"extra": { "imagePrompt": "a short search phrase" }` — a relevant photo is sourced automatically. Keep text legible over images.
6. `slides` MUST be a non-empty array of objects. A string, a single object, or an empty array does not render.

## Sizing

- 8–20 slides for most decks. One idea per slide.
- Bullets: 3–6 per slide, each a short phrase (not a paragraph). Break a dense idea across two slides rather than crowding one.
- Open with a `title` slide, divide major parts with `section` slides, close with a `closing` slide.

## Editing etiquette

When asked to change a deck, return ONE complete, updated `presentation_deck` JSON object — not a diff, not a single slide.
- Keep `"__kind": "presentation_deck"` on the deck and `"__kind": "presentation_slide"` on every slide.
- Preserve slides the user didn't ask you to touch (same order, same content).
- Keep the `theme` unless the user asked to restyle.

## Minimal correct example

```json
{
  "__kind": "presentation_deck",
  "title": "Q3 Review",
  "theme": { "variant": "fancy" },
  "slides": [
    { "__kind": "presentation_slide", "layout": "title", "title": "Q3 Review", "subtitle": "Results and what's next" },
    { "__kind": "presentation_slide", "layout": "bullets", "title": "Highlights",
      "bullets": ["Revenue up **18%** QoQ", "Two new enterprise logos", "Churn down to 1.9%"] },
    { "__kind": "presentation_slide", "layout": "stat", "title": "By the numbers",
      "extra": { "stats": [ {"value":"$4.2M","label":"ARR"}, {"value":"18%","label":"QoQ growth"}, {"value":"1.9%","label":"churn"} ] } },
    { "__kind": "presentation_slide", "layout": "closing", "title": "Thank you", "subtitle": "Questions?" }
  ]
}
```
$BODY$,
  'Presentation',
  '["web"]'::jsonb,
  '1.0.0',
  '49c845cb-9314-485c-88ed-a7ace4f286ca',
  true, true, 41,
  '39c38960-d30c-4840-b0c1-c9960de95582', NULL, NULL, 'public'
WHERE NOT EXISTS (
  SELECT 1 FROM skill.definition
  WHERE skill_id = 'presentation-deck-kind'
    AND created_by IS NULL
    AND organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
    AND project_id IS NULL
);

-- ---------------------------------------------------------------------------
-- 2. Content blocks — public.content_blocks
--    Filed under the shared "Render Blocks" content-block category (6913d9fc-…).
--    organization_id is NOT NULL → always the system org 39c38960-…. block_id is
--    UNIQUE → ON CONFLICT (block_id) DO UPDATE. Human labels, global scope.
-- ---------------------------------------------------------------------------

-- Primary block — build a presentation_deck from scratch.
INSERT INTO public.content_blocks (block_id, label, description, icon_name, template, sort_order, is_active, category_id, organization_id, version)
VALUES (
  'presentation-deck-kind',
  'Presentation Deck',
  'Turn content into a navigable slide deck (content-ir presentation_deck block).',
  'Presentation',
  $CB$When the user has content worth PRESENTING, build a presentation_deck render block (renders inline with navigation + fullscreen, exports, opens in canvas) instead of a wall of text:

```json
{ "__kind": "presentation_deck", "title": "Title",
  "theme": { "variant": "fancy" },
  "slides": [
    { "__kind": "presentation_slide", "layout": "title", "title": "Title", "subtitle": "One-line thesis" },
    { "__kind": "presentation_slide", "layout": "section", "title": "1 · Theme" },
    { "__kind": "presentation_slide", "layout": "bullets", "title": "Key points", "bullets": ["Point one", "Point two", "Point three"] },
    { "__kind": "presentation_slide", "layout": "stat", "title": "By the numbers", "extra": { "stats": [ {"value":"71%","label":"adopting"}, {"value":"3.2x","label":"growth"} ] } },
    { "__kind": "presentation_slide", "layout": "closing", "title": "Thank you" }
  ] }
```

Keep BOTH __kind discriminators. Layouts: title, section, bullets, two-column (extra.columns), quote (quote/author), stat (extra.stats), image-full/image-split (image_url), closing. theme.variant: generic / fancy / deluxe — or theme.preset (editorial / corporate / midnight / ...) for an instant template. 8-20 slides, one idea each, bullets as short phrases. Return one complete deck JSON when editing.$CB$,
  41, true, '6913d9fc-b8c0-4107-af40-27d55c177694', '39c38960-d30c-4840-b0c1-c9960de95582', 1
)
ON CONFLICT (block_id) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  icon_name = EXCLUDED.icon_name,
  template = EXCLUDED.template,
  sort_order = EXCLUDED.sort_order,
  is_active = EXCLUDED.is_active,
  category_id = EXCLUDED.category_id,
  updated_at = now();

-- Variant block — build a deck FROM long-form content.
INSERT INTO public.content_blocks (block_id, label, description, icon_name, template, sort_order, is_active, category_id, organization_id, version)
VALUES (
  'presentation-deck-from-content',
  'Deck from Content',
  'Convert a report/research/analysis into a presentation_deck block.',
  'FileText',
  $CB$Turn this long-form content (research, report, analysis) into a presentation_deck render block — extract the structure, don't copy paragraphs:

```json
{ "__kind": "presentation_deck", "title": "...", "theme": { "variant": "fancy" },
  "slides": [
    { "__kind": "presentation_slide", "layout": "title", "title": "...", "subtitle": "the core finding" },
    { "__kind": "presentation_slide", "layout": "section", "title": "1 · Background" },
    { "__kind": "presentation_slide", "layout": "bullets", "title": "...", "bullets": ["...", "...", "..."] },
    { "__kind": "presentation_slide", "layout": "two-column", "title": "Trade-offs", "extra": { "columns": [ {"title":"Pros","bullets":["..."]}, {"title":"Cons","bullets":["..."]} ] } },
    { "__kind": "presentation_slide", "layout": "quote", "quote": "a striking line from the source", "author": "Source" },
    { "__kind": "presentation_slide", "layout": "closing", "title": "Takeaways", "subtitle": "..." }
  ] }
```

Every slide keeps "__kind":"presentation_slide". Map each theme → a section divider then 1-4 content slides. Pull REAL numbers into stat slides (extra.stats) — never invent them. 8-20 slides; one idea per slide.$CB$,
  42, true, '6913d9fc-b8c0-4107-af40-27d55c177694', '39c38960-d30c-4840-b0c1-c9960de95582', 1
)
ON CONFLICT (block_id) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  icon_name = EXCLUDED.icon_name,
  template = EXCLUDED.template,
  sort_order = EXCLUDED.sort_order,
  is_active = EXCLUDED.is_active,
  category_id = EXCLUDED.category_id,
  updated_at = now();

COMMIT;
