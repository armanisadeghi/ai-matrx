-- ============================================================================
-- Presentation pack — teach that extra.imagePrompt auto-sources from Unsplash.
--
-- The renderer now resolves a slide's extra.imagePrompt to a real Unsplash photo
-- (with attribution) when no image_url is given. Update the slide-decks skill +
-- the deck-deluxe content block so agents know to just provide a prompt.
-- Idempotent: REPLACE is a no-op once the old phrasing is gone.
-- ============================================================================

BEGIN;

UPDATE public.skl_definitions
SET body = replace(
      body,
      'so an image can be generated/sourced for that slide later. Don''t invent fake image URLs.',
      'and a relevant photo is sourced automatically from Unsplash (with attribution) — no URL needed. Don''t invent fake image URLs.'
    ),
    updated_at = now()
WHERE skill_id = 'slide-decks';

UPDATE public.content_blocks
SET template = replace(
      template,
      'add extra.imagePrompt with a short art-direction phrase so an image can be sourced later.',
      'skip image_url and add extra.imagePrompt (a short search phrase) — a relevant Unsplash photo is sourced automatically.'
    ),
    updated_at = now()
WHERE block_id = 'deck-deluxe';

COMMIT;
