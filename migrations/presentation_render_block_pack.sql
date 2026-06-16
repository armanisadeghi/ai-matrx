-- ============================================================================
-- Presentation render block pack — skill + render registry + content blocks.
--
-- The presentation block already exists (FE: blocks/presentations/Slideshow +
-- SlideView; server: aidream presentation_parser). This migration teaches
-- agents to produce RICH, tiered decks against the enhanced renderer:
--   1. skl_definitions 'slide-decks' — the system skill (tiers, layouts, the
--      JSON shape, deck structure, imagery).
--   2. skl_render_definitions 'presentation' + skl_render_components (web).
--   3. content_blocks in a new "Presentations" content-block category.
--
-- Idempotent. 'render-blocks' skl_categories reused / created if absent.
-- ============================================================================

BEGIN;

INSERT INTO public.skl_categories
  (category_key, label, description, icon_name, sort_order, is_active)
VALUES (
  'render-blocks',
  'Render Blocks',
  'Teaching skills for first-class streamed render blocks: when and how to emit each block type.',
  'Blocks', 50, true
)
ON CONFLICT (category_key) DO NOTHING;

INSERT INTO public.skl_definitions
  (skill_id, label, description, skill_type, body, icon_name,
   is_active, is_system, is_public, category_id, sort_order, version, platform_targets)
SELECT
  'slide-decks',
  'Slide Decks',
  'How to build a beautiful presentation render block: the three visual tiers (generic/fancy/deluxe), the slide layouts (title/section/bullets/two-column/quote/stat/image), the JSON shape, how to structure a deck from research or long-form content, and per-slide imagery.',
  'render_block',
  $SKILL_BODY$# Slide Decks

You can turn content — research findings, an analysis, a plan, a summary — into a
beautiful, navigable slide deck. It renders inline (arrow-key navigation, fullscreen),
exports, and opens in canvas. When the user has something worth PRESENTING, build a deck
instead of a wall of text.

## How to emit a deck

Emit a JSON object with a top-level `presentation` key (a ```json fence is fine):

```json
{
  "presentation": {
    "title": "State of the Market 2026",
    "theme": { "variant": "fancy", "primaryColor": "#4F46E5", "secondaryColor": "#7C3AED", "accentColor": "#06B6D4" },
    "slides": [
      { "layout": "title", "title": "State of the Market 2026", "subtitle": "What changed and what it means" },
      { "layout": "section", "title": "1 · The Landscape", "description": "Where things stand today" },
      { "layout": "bullets", "title": "Three forces reshaping the field",
        "description": "Each is accelerating.",
        "bullets": ["**Adoption** crossed the majority line", "Costs fell 60% YoY", "Regulation is arriving fast"] },
      { "layout": "stat", "title": "By the numbers",
        "extra": { "stats": [ {"value":"71%","label":"now adopting"}, {"value":"$0.4","label":"cost per unit"}, {"value":"3.2x","label":"YoY growth"} ] } },
      { "layout": "quote", "quote": "The shift is no longer coming — it is here.", "author": "Industry Report 2026" },
      { "layout": "closing", "title": "Thank you", "subtitle": "Questions welcome" }
    ]
  }
}
```

## The three tiers — `theme.variant`

- **`generic`** — clean and minimal (plain titles + bullets). Use for internal/quick decks.
- **`fancy`** — the default and best general choice: gradient titles, generous type,
  accent shapes, and varied layouts. Use unless told otherwise.
- **`deluxe`** — `fancy` plus full-bleed imagery. Use `image-full` / `image-split`
  layouts and put an image on slides (see Imagery).

Set a `theme` with `variant` and 2-3 brand colors (`primaryColor`, `secondaryColor`,
`accentColor`). Titles use a primary→secondary gradient; accents use `accentColor`.

## Slide layouts — `slide.layout`

| layout | fields it uses | use for |
|---|---|---|
| `title` | title, subtitle | the cover |
| `section` | title, description | a divider between parts |
| `bullets` | title, description, bullets[] | the workhorse content slide |
| `two-column` | title, `extra.columns:[{title,bullets[]}]` (or bullets, auto-split) | compare / before-after |
| `quote` | quote, author | a pull quote |
| `stat` | title, `extra.stats:[{value,label}]` | headline numbers (2-3) |
| `image-full` | title, description, `image_url` | a full-bleed image with overlay |
| `image-split` | title, bullets, `image_url` | image beside content |
| `closing` | title, subtitle | the final slide |

Optional `extra.eyebrow` adds a small label above the title on any content slide.

## Structuring a great deck (from research / long content)

1. **Title** slide (the thesis as a subtitle).
2. A **section** divider per major theme (number them: "1 · …").
3. Under each: 1-4 **content** slides — `bullets` (3-5 tight, parallel points), a
   `two-column` comparison, a `stat` slide for hard numbers, a `quote` for a striking line.
4. End with a **closing** slide.
- Aim for **8-20 slides**. One idea per slide. Bullets are phrases, not paragraphs.
- Pull the substance from the source content; don't invent numbers — cite them in
  bullets/stats only if they're in the material.

## Imagery (deluxe)

Put a durable image URL on a slide via `image_url` and use `image-full` or `image-split`.
If you don't have a URL, you may add `extra.imagePrompt` (a short art-direction phrase)
so an image can be generated/sourced for that slide later. Don't invent fake image URLs.

## Editing

When asked to change a deck, return the **ONE complete updated `presentation` JSON**
(all slides), preserving the slides you aren't changing.
$SKILL_BODY$,
  'Presentation',
  true, true, true,
  (SELECT id FROM public.skl_categories WHERE category_key = 'render-blocks'),
  40, '1.0.0', '["web"]'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM public.skl_definitions
  WHERE skill_id = 'slide-decks'
    AND user_id IS NULL AND organization_id IS NULL AND project_id IS NULL
);

INSERT INTO public.skl_render_definitions
  (block_id, label, description, icon_name, template, skill_id, is_active, is_public, sort_order)
SELECT
  'presentation',
  'Slide Deck',
  'Presentation render block: a tiered (generic/fancy/deluxe), multi-layout slide deck with arrow-key nav, fullscreen, export, and canvas editing.',
  'Presentation',
  E'```json\n{ "presentation": { "title": "...", "theme": {"variant":"fancy"}, "slides": [ {"layout":"title","title":"...","subtitle":"..."} ] } }\n```',
  (SELECT id FROM public.skl_definitions WHERE skill_id = 'slide-decks'),
  true, true, 40
WHERE NOT EXISTS (
  SELECT 1 FROM public.skl_render_definitions WHERE block_id = 'presentation'
);

WITH rd AS (
  SELECT id FROM public.skl_render_definitions WHERE block_id = 'presentation' LIMIT 1
)
INSERT INTO public.skl_render_components
  (render_definition_id, component_key, platform, import_path, is_active, sort_order)
SELECT rd.id, v.component_key, v.platform, v.import_path, v.is_active, v.sort_order
FROM rd,
  (VALUES
    ('Slideshow', 'web',              '@/components/mardown-display/blocks/presentations/Slideshow', true,  10),
    ('Slideshow', 'chrome-extension', NULL,                                                          false, 20),
    ('Slideshow', 'desktop',          NULL,                                                          false, 30),
    ('Slideshow', 'mobile',           NULL,                                                          false, 40)
  ) AS v(component_key, platform, import_path, is_active, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.skl_render_components c
  WHERE c.render_definition_id = rd.id AND c.platform = v.platform
);

INSERT INTO public.shortcut_categories
  (placement_type, label, description, icon_name, sort_order, is_active)
SELECT
  'content-block', 'Presentations',
  'Inject instructions that teach an agent to turn content into a beautiful slide deck render block (tiers, layouts, imagery).',
  'Presentation', 44, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.shortcut_categories
  WHERE placement_type = 'content-block' AND label = 'Presentations'
    AND user_id IS NULL AND organization_id IS NULL
    AND project_id IS NULL AND task_id IS NULL
);

INSERT INTO public.content_blocks (block_id, label, description, icon_name, template, category_id, sort_order, is_active)
SELECT v.block_id, v.label, v.description, 'Presentation', v.template,
       (SELECT id FROM public.shortcut_categories
         WHERE placement_type = 'content-block' AND label = 'Presentations'
           AND user_id IS NULL AND organization_id IS NULL AND project_id IS NULL AND task_id IS NULL LIMIT 1),
       v.sort_order, true
FROM (VALUES
  ('deck-fancy', 'Slide Deck (beautiful)', 'Turn content into a polished, multi-layout slide deck', 0,
   $CB$When the user has content worth PRESENTING, build a slide deck render block (it renders inline with navigation + fullscreen, and opens in canvas) instead of a wall of text:

```json
{ "presentation": {
    "title": "Title", "theme": {"variant":"fancy","primaryColor":"#4F46E5","accentColor":"#06B6D4"},
    "slides": [
      {"layout":"title","title":"Title","subtitle":"One-line thesis"},
      {"layout":"section","title":"1 · Theme"},
      {"layout":"bullets","title":"Key points","bullets":["Point one","Point two","Point three"]},
      {"layout":"stat","title":"By the numbers","extra":{"stats":[{"value":"71%","label":"adopting"},{"value":"3.2x","label":"growth"}]}},
      {"layout":"closing","title":"Thank you"}
    ] } }
```

Tiers (theme.variant): generic (clean), fancy (default — gradients/layouts), deluxe (+ imagery). Layouts: title, section, bullets, two-column ({extra.columns}), quote ({quote,author}), stat ({extra.stats}), image-full/image-split ({image_url}), closing. 8-20 slides, one idea each, bullets as phrases. Return one complete presentation JSON when editing.$CB$),

  ('deck-from-research', 'Deck from Research/Report', 'Summarize a long report or research result as slides', 10,
   $CB$Turn this long-form content (research, report, analysis) into a slide deck render block — extract the structure, don't copy paragraphs:

```json
{ "presentation": { "title": "...", "theme": {"variant":"fancy"}, "slides": [
  {"layout":"title","title":"...","subtitle":"the core finding"},
  {"layout":"section","title":"1 · Background"},
  {"layout":"bullets","title":"...","bullets":["...","...","..."]},
  {"layout":"two-column","title":"Trade-offs","extra":{"columns":[{"title":"Pros","bullets":["..."]},{"title":"Cons","bullets":["..."]}]}},
  {"layout":"quote","quote":"a striking line from the source","author":"Source"},
  {"layout":"closing","title":"Takeaways","subtitle":"..."}
] } }
```

Map themes → section dividers; each theme → 1-4 content slides (bullets / two-column / stat / quote). Pull real numbers into stat slides — never invent them. 8-20 slides; one idea per slide.$CB$),

  ('deck-deluxe', 'Image-Rich Deck (deluxe)', 'A premium deck with full-bleed imagery per slide', 20,
   $CB$For a premium, image-rich deck, use the deluxe tier with image layouts:

```json
{ "presentation": { "title":"...", "theme": {"variant":"deluxe","primaryColor":"#0F172A","accentColor":"#22D3EE"}, "slides": [
  {"layout":"image-full","title":"Bold cover","description":"subtitle","image_url":"https://…"},
  {"layout":"image-split","title":"Topic","bullets":["point","point"],"image_url":"https://…"},
  {"layout":"stat","title":"Impact","extra":{"stats":[{"value":"$2.4M","label":"saved"}]}},
  {"layout":"closing","title":"Thank you"}
] } }
```

Put a DURABLE image URL on image slides via image_url (don't fabricate URLs). If you don't have one, add extra.imagePrompt with a short art-direction phrase so an image can be sourced later. Keep text legible over images.$CB$)
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
