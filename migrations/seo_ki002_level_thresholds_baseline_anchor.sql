-- ============================================================================
-- KI-002 — LEVEL THRESHOLDS RE-CUT FOR THE 100-BASELINE SCALE (2026-08-24)
--
-- KI-048 ruled scoring starts at a 100 baseline (0 absolute, ± adds, ×factors,
-- floor 0). The level cuts still assumed the old 0–100 scale (Platinum ≥85),
-- so after the baseline landed, a below-neutral keyword could read Platinum:
-- measured on Data Destruction, 2,178 of 5,706 valued keywords sat in
-- Platinum and 3,450 in Bronze — a two-band system wearing six names.
--
-- THE SETTLED RULE (register KI-002): default thresholds are ABSOLUTE cuts
-- anchored on the baseline, shipped down the P30 ladder (platform → industry
-- kit → site; nearest wins; a HUMAN-set site cut is never overwritten).
-- Anchored meaning of each cut: Silver = neutral or better (≥100),
-- Platinum = at least double neutral (≥200).
--
-- Touches exactly two tiers:
--   1. platform.categories dimension 'seo_value_band' — the platform default
--      tier the resolver already falls back to (P30 root).
--   2. The two sites whose value_band vocab rows are PACK-BACKFILLED copies of
--      the old defaults (provenance in metadata: adopted_from_pack; numbers
--      still the stock 85/65/40/15|5/0). Those are defaults wearing a site's
--      name, not a human's cut — a row whose min_score a human changed does
--      not match the stock numbers and is left alone by construction.
--
-- The ITAD pack's own band ITEMS still carry old numbers — that is pack
-- content reshaping (KI-003, conductor's item), deliberately not done here.
-- ============================================================================

UPDATE platform.categories SET metadata = metadata || jsonb_build_object('min_score',
  CASE slug WHEN 'platinum' THEN 200 WHEN 'gold' THEN 140 WHEN 'silver' THEN 100
            WHEN 'bronze' THEN 50 WHEN 'minimal' THEN 0 END)
WHERE dimension = 'seo_value_band' AND deleted_at IS NULL
  AND slug IN ('platinum','gold','silver','bronze','minimal')
  AND (metadata->>'min_score')::numeric IS DISTINCT FROM
      CASE slug WHEN 'platinum' THEN 200 WHEN 'gold' THEN 140 WHEN 'silver' THEN 100
                WHEN 'bronze' THEN 50 WHEN 'minimal' THEN 0 END;

UPDATE seo.site_vocabulary sv SET config = sv.config || jsonb_build_object('min_score',
  CASE sv.value WHEN 'platinum' THEN 200 WHEN 'gold' THEN 140 WHEN 'silver' THEN 100
                WHEN 'bronze' THEN 50 WHEN 'minimal' THEN 0 END)
WHERE sv.vocab_kind = 'value_band' AND sv.deleted_at IS NULL
  AND sv.metadata ? 'adopted_from_pack'
  AND sv.value IN ('platinum','gold','silver','bronze','minimal')
  -- only rows still carrying the stock pre-baseline numbers (85/65/40/15 or 5/0)
  AND (sv.config->>'min_score')::numeric = CASE sv.value
        WHEN 'platinum' THEN 85 WHEN 'gold' THEN 65 WHEN 'silver' THEN 40
        WHEN 'minimal' THEN 0
        ELSE (sv.config->>'min_score')::numeric END
  AND (sv.value <> 'bronze' OR (sv.config->>'min_score')::numeric IN (15,5));
