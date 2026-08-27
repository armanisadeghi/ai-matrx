-- Keep exact page-id filters indexable in the canonical GSC breakdown RPC.
--
-- `page_eq` accepts either a canonical web.page UUID or a literal page URL.
-- The prior predicate cast `spd.page_id` to text inside an optional OR:
--
--   f_pe IS NULL OR extras->>'page_url' = f_pe OR spd.page_id::text = f_pe
--
-- That cast hid `idx_seo_sperf_gsc_page_ids (site_id, page_id)` from the
-- planner. On the production page dossier's all-history query the function
-- scanned the site's full query_page history and exceeded the 8 s statement
-- timeout. Parse UUID inputs once, compare the indexed uuid column without a
-- cast, and force a custom plan so the mutually-exclusive UUID/URL branches
-- are pruned for each call.

DO $do$
DECLARE
  v_oid oid;
  v_def text;
  v_new text;
  v_decl_old CONSTANT text :=
    E'  f_pe text := NULLIF(btrim(p_filters->>\'page_eq\'), \'\');\n';
  v_decl_new CONSTANT text :=
    v_decl_old ||
    E'  f_pe_uuid uuid := CASE\n'
    '    WHEN f_pe ~* ''^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'' THEN f_pe::uuid\n'
    '    ELSE NULL\n'
    '  END;\n';
  v_pred_old CONSTANT text :=
    E'      AND (f_pe IS NULL OR spd.extras->>\'page_url\' = f_pe OR spd.page_id::text = f_pe)\n';
  v_pred_new CONSTANT text :=
    E'      AND (f_pe IS NULL\n'
    '           OR (f_pe_uuid IS NOT NULL AND spd.page_id = f_pe_uuid)\n'
    '           OR (f_pe_uuid IS NULL AND spd.extras->>''page_url'' = f_pe))\n';
BEGIN
  SELECT p.oid INTO STRICT v_oid
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'seo' AND p.proname = 'gsc_perf_breakdown';

  v_def := pg_get_functiondef(v_oid);

  IF position('f_pe_uuid uuid := CASE' in v_def) = 0 THEN
    IF position(v_decl_old in v_def) = 0 THEN
      RAISE EXCEPTION 'gsc_breakdown_page_index_predicate: declaration anchor missing';
    END IF;
    v_new := replace(v_def, v_decl_old, v_decl_new);
  ELSE
    v_new := v_def;
  END IF;

  IF position('spd.page_id::text = f_pe' in v_new) > 0 THEN
    IF position(v_pred_old in v_new) = 0 THEN
      RAISE EXCEPTION 'gsc_breakdown_page_index_predicate: predicate anchor missing';
    END IF;
    v_new := replace(v_new, v_pred_old, v_pred_new);
  END IF;

  EXECUTE v_new;

  IF position('spd.page_id = f_pe_uuid' in pg_get_functiondef(v_oid)) = 0
     OR position('spd.page_id::text = f_pe' in pg_get_functiondef(v_oid)) > 0 THEN
    RAISE EXCEPTION 'gsc_breakdown_page_index_predicate: indexable predicate not installed';
  END IF;
END
$do$;

ALTER FUNCTION seo.gsc_perf_breakdown(
  uuid, text, date, date, date, date, jsonb, text, text, text, integer, integer
) SET plan_cache_mode = 'force_custom_plan';
