-- ============================================================================
-- Teach the deck preset/template library: agents can set `theme.preset` to a
-- named template for an instant on-brand look. Idempotent (guarded appends —
-- skips rows that already mention the preset).
-- ============================================================================

BEGIN;

UPDATE public.skl_definitions
SET body = body || E'\n\n## Templates (presets)\n\nFor an instant, on-brand look, set `theme.preset` to one of:\n`classic`, `corporate`, `editorial`, `bold`, `minimal`, `midnight`, `ocean`, `sunset`, `forest`, `mono`.\n\nA preset picks the tier (generic/fancy/deluxe), the color palette, and the font — you can still override any individual `theme` field. Choose by tone: corporate/ocean/forest read calm & professional; editorial is magazine-style (serif); bold/midnight/sunset are high-energy and image-forward; minimal/mono are restrained. Example: `"theme": { "preset": "editorial" }`.',
    updated_at = now()
WHERE skill_id = 'slide-decks'
  AND body NOT LIKE '%theme.preset%'
  AND body NOT LIKE '%Templates (presets)%';

UPDATE public.content_blocks
SET template = template || E'\n\nTip: set "theme":{"preset":"editorial"} (or classic / corporate / bold / minimal / midnight / ocean / sunset / forest / mono) for an instant on-brand template.',
    updated_at = now()
WHERE block_id LIKE 'deck-%'
  AND template NOT LIKE '%preset%';

COMMIT;
