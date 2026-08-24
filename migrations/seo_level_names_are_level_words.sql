-- ============================================================================
-- P18 ENFORCEMENT — A LEVEL NAMES NOTHING (2026-08-24)
--
-- Arman, 2026-08-22: "you're trying to take all this information and somehow
-- convert it into something in the English language where your number score is
-- gonna map to some words. That's never going to happen … What makes it
-- enterprise ITAD has nothing to do with all the little parts. It goes the
-- other way around."
--
-- Ratified as P18: levels are THRESHOLDS on the score and carry LEVEL WORDS
-- only; what a keyword IS comes from its stamps, never from where its score
-- landed. Three starter packs shipped category names as level labels
-- ("Enterprise ITAD and certified destruction", "Ready to book, in radius",
-- "Hiring it done"), and every site that adopted one inherited the inversion —
-- visible today on the value workbench's TIER column.
--
-- This migration keeps the platform template's level words (Platinum … Negative)
-- as the LABEL and preserves each pack's phrasing as the DESCRIPTION, so the
-- editorial meaning is not lost — it simply stops pretending to be an identity.
-- Thresholds are NOT touched here: re-cutting them for the open scale changes
-- what a site reads, so it is the site's ruling, not a migration's.
-- ============================================================================

-- ── 1. Pack templates: label = level word, description = the pack's phrasing ──
UPDATE seo.starter_pack_item spi
   SET label = tpl.name,
       description = CASE
         WHEN spi.label IS NULL OR btrim(spi.label) = '' OR lower(btrim(spi.label)) = lower(tpl.name)
           THEN spi.description
         ELSE btrim(spi.label)
       END,
       updated_at = now()
  FROM platform.categories tpl
 WHERE spi.item_kind = 'value_band'
   AND spi.deleted_at IS NULL
   AND tpl.dimension = 'seo_value_band'
   AND tpl.deleted_at IS NULL
   AND tpl.slug = spi.value
   AND spi.label IS DISTINCT FROM tpl.name
   -- packs that already lead with the level word ("Platinum — enterprise contract") are fine
   AND lower(btrim(spi.label)) NOT LIKE lower(tpl.name) || '%';

-- ── 2. Sites that already adopted a pack's level names ──────────────────────
-- Labels only. Values, thresholds and every stamp are untouched, so no keyword
-- changes level: this renames what the same level is CALLED.
UPDATE seo.site_vocabulary sv
   SET label = tpl.name,
       description = CASE
         WHEN sv.description IS NOT NULL AND btrim(sv.description) <> '' THEN sv.description
         WHEN lower(btrim(sv.label)) = lower(tpl.name) THEN sv.description
         ELSE btrim(sv.label)
       END,
       updated_at = now()
  FROM platform.categories tpl
 WHERE sv.vocab_kind = 'value_band'
   AND sv.deleted_at IS NULL
   AND tpl.dimension = 'seo_value_band'
   AND tpl.deleted_at IS NULL
   AND tpl.slug = sv.value
   AND sv.label IS DISTINCT FROM tpl.name
   AND lower(btrim(sv.label)) NOT LIKE lower(tpl.name) || '%';
