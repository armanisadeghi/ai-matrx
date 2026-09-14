-- KI-035: retire the 13 legacy mirror facet columns on seo.keyword.
--
-- Ruled: Arman's 2026-09-10 no-legacy ruling ("replaced code is deleted, code AND
-- database"); the question desk closed the drop as already covered (2026-09-12).
-- Truth lives in stamps (seo.keyword_facet), read through seo.keyword_universal_facet.
--
-- Re-census 2026-09-14 (before this file):
--   * DB: no view / matview / function / trigger / policy / index / publication
--     column list reads these columns. The six functions whose bodies name them
--     (share_token_keyword_metrics, gsc_keyword_class_review, starter_pack_corpus,
--     gsc_keyword_class_map, keyword_place_status, stamp_keyword_places) read the
--     VIEW (uf./ukw.) or use the names as dimension-slug string literals.
--     Dependent objects on the columns: only their own CHECK constraints.
--   * Code: no column read/write in matrx-frontend, aidream (incl. packages/),
--     matrx-sandbox, matrx-local, matrx-extend. KeywordWithMarket omits the
--     columns and merges the view in.
--   * Data: 2,740 keywords carry a legacy value; ZERO cells hold a value with no
--     stamp. 1,474 cells differ from the view; in every one a stamp row carrying
--     the legacy value exists, and the view's winner is a newer classifier stamp
--     (all dims) or, for 9 local_intent cells, a higher-precedence place 'rule'
--     stamp. Nothing true is lost.
--   * PITR: enabled on the project (supabase backups list: pitr_enabled=true).
--
-- No function body is replaced, so no based-on lines are required.

ALTER TABLE seo.keyword
  DROP COLUMN intent_class,
  DROP COLUMN fulfillment_mode,
  DROP COLUMN audience_type,
  DROP COLUMN funnel_stage,
  DROP COLUMN transaction_direction,
  DROP COLUMN local_intent,
  DROP COLUMN urgency,
  DROP COLUMN comparison_intent,
  DROP COLUMN price_sensitivity,
  DROP COLUMN query_form,
  DROP COLUMN specificity,
  DROP COLUMN brand_presence,
  DROP COLUMN compliance_framing;

DO $$
DECLARE
  v_left int;
  v_checks int;
BEGIN
  SELECT count(*) INTO v_left
  FROM pg_attribute
  WHERE attrelid = 'seo.keyword'::regclass
    AND NOT attisdropped
    AND attname IN ('intent_class','fulfillment_mode','audience_type','funnel_stage',
                    'transaction_direction','local_intent','urgency','comparison_intent',
                    'price_sensitivity','query_form','specificity','brand_presence',
                    'compliance_framing');
  SELECT count(*) INTO v_checks
  FROM pg_constraint
  WHERE conrelid = 'seo.keyword'::regclass
    AND conname IN ('keyword_audience_type_check','keyword_brand_presence_check',
                    'keyword_comparison_intent_check','keyword_compliance_framing_check',
                    'keyword_fulfillment_mode_check','keyword_funnel_stage_check',
                    'keyword_intent_class_check','keyword_local_intent_check',
                    'keyword_price_sensitivity_check','keyword_query_form_check',
                    'keyword_specificity_check','keyword_transaction_direction_check',
                    'keyword_urgency_check');
  IF v_left <> 0 OR v_checks <> 0 THEN
    RAISE EXCEPTION 'KI-035 drop incomplete: % legacy columns and % CHECKs remain on seo.keyword', v_left, v_checks;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
