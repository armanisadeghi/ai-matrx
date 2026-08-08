-- Keyword-classification UI backend (2026-08-08) — the manual truth-editing
-- surface for the GSC traffic-class system ("If it's that important of a
-- thing, I think we need a dedicated UI for it" — Arman, 2026-08-08).
--
-- Two additive columns on seo.site_keyword_value:
--   traffic_class — the human's EXPLICIT class ruling
--     ('money'|'educational'|'brand'|'mismatch'). Read by the ONE resolver
--     (seo.gsc_keyword_class_map, source migration seo_gsc_class_rpcs.sql)
--     at the TOP of the site-value rung. It exists because the semantic
--     columns cannot express a human "brand" ruling at all (content_role
--     has no brand value), and because a ruling should be legible as a
--     ruling, not reverse-engineered from side effects. The semantic
--     columns (content_role / service_match / …) are STILL written on every
--     override so the valuation row stays coherent for every other
--     consumer — the explicit column and the semantic columns never
--     disagree because ONE write path (gsc_set_keyword_class) maintains
--     both.
--   notes — the human's reasoning. REQUIRED for mismatch (a ruling must
--     carry its case); optional otherwise. Mirrors site_topic_value.notes.
--
-- Two RPCs, following the mandatory GSC pattern (SECURITY DEFINER + a
-- one-shot access assert as the FIRST statement — see
-- seo_gsc_rpc_security_definer.sql):
--   gsc_keyword_class_review — the review read: the site's GSC-active
--     keywords for a window with class + class_source + clicks/impressions
--     (volume is what makes review meaningful), filterable by class and
--     source, searchable, server-paged.
--   gsc_set_keyword_class — the ONE write path for human class overrides
--     (single or bulk). Gated by the EDITOR-level primitive the table's own
--     RLS uses (iam.has_access('web_site', site_id, 'editor')) — direct
--     table writes are not granted to authenticated, and the class→column
--     mapping must live server-side ONCE, beside the resolver. Returns the
--     RESOLVED (class, class_source) per keyword so the UI shows the flip
--     to 'site_value' from server truth, never client assumption.

ALTER TABLE seo.site_keyword_value
  ADD COLUMN IF NOT EXISTS traffic_class text,
  ADD COLUMN IF NOT EXISTS notes text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'seo.site_keyword_value'::regclass
      AND conname = 'site_keyword_value_traffic_class_check'
  ) THEN
    ALTER TABLE seo.site_keyword_value
      ADD CONSTRAINT site_keyword_value_traffic_class_check
      CHECK (traffic_class = ANY (ARRAY['money'::text, 'educational'::text, 'brand'::text, 'mismatch'::text]));
  END IF;
END $$;

-- Write gate: the SAME editor predicate the table's RLS update policy uses,
-- evaluated once against the site. Not a new security layer.
CREATE OR REPLACE FUNCTION seo.gsc_assert_site_editor(p_site_id uuid)
RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = seo, web, iam, pg_temp
AS $fn$
DECLARE
  v_created_by uuid;
BEGIN
  SELECT s.created_by INTO v_created_by
  FROM web.site s WHERE s.id = p_site_id AND s.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'gsc_site_not_found: %', p_site_id USING ERRCODE = 'P0002';
  END IF;
  IF v_created_by = (SELECT auth.uid())
     OR iam.has_access('web_site', p_site_id, 'editor'::public.permission_level) THEN
    RETURN;
  END IF;
  RAISE EXCEPTION 'gsc_site_edit_denied: no editor access to site %', p_site_id
    USING ERRCODE = '42501';
END;
$fn$;

REVOKE ALL ON FUNCTION seo.gsc_assert_site_editor(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION seo.gsc_assert_site_editor(uuid) TO authenticated, service_role;


-- The classification review table. Winning-run dedup per THE ACCURACY
-- CONTRACT (query profile), aggregated over the window, one row per
-- (keyword, query), joined to the ONE class resolver and the site's
-- valuation row. Facts carry keyword_id at 100% (verified live); rows
-- without one cannot be classified and are excluded.
-- Earlier single-class signature (pre-release iteration) — remove so the
-- array signature below is the only one PostgREST can resolve.
DROP FUNCTION IF EXISTS seo.gsc_keyword_class_review(uuid, date, date, text, text, text, text, text, int, int);

CREATE OR REPLACE FUNCTION seo.gsc_keyword_class_review(
  p_site_id uuid,
  p_start date,
  p_end date,
  p_classes text[] DEFAULT NULL,
  p_sources text[] DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_sort text DEFAULT 'impressions',
  p_sort_dir text DEFAULT 'desc',
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0
) RETURNS TABLE (
  keyword_id uuid,
  query text,
  traffic_class text,
  class_source text,
  clicks bigint,
  impressions bigint,
  ctr numeric,
  intent_class text,
  override_class text,
  content_role text,
  service_match text,
  suppression_reason text,
  lead_quality text,
  notes text,
  total_count bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = seo, pg_temp
AS $function$
DECLARE
  v_search text := NULLIF(btrim(p_search), '');
BEGIN
  PERFORM seo.gsc_assert_site_access(p_site_id);
  IF p_classes IS NOT NULL AND EXISTS (
    SELECT 1 FROM unnest(p_classes) c
    WHERE c NOT IN ('money', 'educational', 'brand', 'mismatch', 'unclassified')
  ) THEN
    RAISE EXCEPTION 'gsc_class_unknown: %', array_to_string(p_classes, ',');
  END IF;
  IF p_sources IS NOT NULL AND EXISTS (
    SELECT 1 FROM unnest(p_sources) s
    WHERE s NOT IN ('site_value', 'brand_match', 'intent_class', 'none')
  ) THEN
    RAISE EXCEPTION 'gsc_class_source_unknown: %', array_to_string(p_sources, ',');
  END IF;
  IF p_sort NOT IN ('impressions', 'clicks', 'ctr', 'query') THEN
    RAISE EXCEPTION 'gsc_sort_unknown: %', p_sort;
  END IF;
  IF p_sort_dir NOT IN ('asc', 'desc') THEN
    RAISE EXCEPTION 'gsc_sort_dir_unknown: %', p_sort_dir;
  END IF;
  IF p_limit < 1 OR p_limit > 1000 OR p_offset < 0 THEN
    RAISE EXCEPTION 'gsc_pagination_out_of_range: limit=% offset=%', p_limit, p_offset;
  END IF;

  RETURN QUERY
  WITH winner AS (
    SELECT DISTINCT ON (spd.date) spd.date AS d, spd.run_id AS rid
    FROM seo.search_performance_daily spd
    WHERE spd.provider = 'gsc'
      AND spd.site_id = p_site_id
      AND spd.dimension_profile = 'query'
      AND spd.date BETWEEN p_start AND p_end
    ORDER BY spd.date, spd.created_at DESC, spd.run_id DESC
  ),
  agg AS (
    SELECT spd.keyword_id AS kid,
           MIN(spd.query) AS q,
           SUM(spd.clicks)::bigint AS s_clicks,
           SUM(spd.impressions)::bigint AS s_imps
    FROM seo.search_performance_daily spd
    JOIN winner w ON w.d = spd.date AND w.rid = spd.run_id
    WHERE spd.provider = 'gsc'
      AND spd.site_id = p_site_id
      AND spd.dimension_profile = 'query'
      AND spd.keyword_id IS NOT NULL
      AND spd.query IS NOT NULL
    GROUP BY spd.keyword_id
  ),
  classed AS (
    SELECT a.kid, a.q, a.s_clicks, a.s_imps,
           COALESCE(cm.traffic_class, 'unclassified') AS cls,
           COALESCE(cm.class_source, 'none') AS src,
           kw.intent_class AS kw_intent,
           skv.traffic_class AS skv_class,
           skv.content_role AS skv_role,
           skv.service_match AS skv_service,
           skv.suppression_reason AS skv_suppression,
           skv.lead_quality AS skv_lead,
           skv.notes AS skv_notes
    FROM agg a
    LEFT JOIN seo.gsc_keyword_class_map(p_site_id) cm ON cm.keyword_id = a.kid
    LEFT JOIN seo.keyword kw ON kw.id = a.kid
    LEFT JOIN seo.site_keyword_value skv
      ON skv.keyword_id = a.kid AND skv.site_id = p_site_id AND skv.deleted_at IS NULL
    WHERE (p_classes IS NULL OR COALESCE(cm.traffic_class, 'unclassified') = ANY (p_classes))
      AND (p_sources IS NULL OR COALESCE(cm.class_source, 'none') = ANY (p_sources))
      AND (v_search IS NULL OR a.q ILIKE '%' || seo.gsc_perf_like_escape(v_search) || '%')
  )
  SELECT c.kid,
         c.q,
         c.cls,
         c.src,
         c.s_clicks,
         c.s_imps,
         CASE WHEN c.s_imps > 0 THEN round(c.s_clicks::numeric / c.s_imps, 6) END,
         c.kw_intent,
         c.skv_class,
         c.skv_role,
         c.skv_service,
         c.skv_suppression,
         c.skv_lead,
         c.skv_notes,
         COUNT(*) OVER ()::bigint
  FROM classed c
  ORDER BY
    (CASE WHEN p_sort = 'impressions' AND p_sort_dir = 'desc' THEN c.s_imps END) DESC NULLS LAST,
    (CASE WHEN p_sort = 'impressions' AND p_sort_dir = 'asc' THEN c.s_imps END) ASC NULLS LAST,
    (CASE WHEN p_sort = 'clicks' AND p_sort_dir = 'desc' THEN c.s_clicks END) DESC NULLS LAST,
    (CASE WHEN p_sort = 'clicks' AND p_sort_dir = 'asc' THEN c.s_clicks END) ASC NULLS LAST,
    (CASE WHEN p_sort = 'ctr' AND p_sort_dir = 'desc' AND c.s_imps > 0 THEN c.s_clicks::numeric / c.s_imps END) DESC NULLS LAST,
    (CASE WHEN p_sort = 'ctr' AND p_sort_dir = 'asc' AND c.s_imps > 0 THEN c.s_clicks::numeric / c.s_imps END) ASC NULLS LAST,
    (CASE WHEN p_sort = 'query' AND p_sort_dir = 'desc' THEN c.q END) DESC,
    (CASE WHEN p_sort = 'query' AND p_sort_dir = 'asc' THEN c.q END) ASC,
    c.s_imps DESC,
    c.kid ASC
  LIMIT p_limit OFFSET p_offset;
END;
$function$;

REVOKE ALL ON FUNCTION seo.gsc_keyword_class_review(uuid, date, date, text[], text[], text, text, text, int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION seo.gsc_keyword_class_review(uuid, date, date, text[], text[], text, text, text, int, int) TO authenticated, service_role;


-- The ONE human write path for class overrides (single AND bulk — p_notes is
-- the shared reasoning for every keyword in the batch). Class→column mapping
-- mirrors EXACTLY what the resolver reads:
--   money       -> traffic_class='money',       content_role='money_page'
--   educational -> traffic_class='educational', content_role='supporting_content'
--   brand       -> traffic_class='brand' (no semantic column can express it)
--   mismatch    -> traffic_class='mismatch',    service_match='not_offered'
--                  (notes REQUIRED — a mismatch ruling must carry its case)
--   clear       -> removes the override: nulls traffic_class AND every
--                  class-driving value this surface (or an agent) set, so the
--                  machine rungs (brand match / intent_class) decide again.
-- Setting a positive class also clears any mismatch triggers (suppression /
-- not-offered / negative-value) that would otherwise contradict the ruling,
-- and clearing a suppression resets workflow_status 'suppressed'->'candidate'
-- (the table CHECK forbids suppressed-without-reason). Unrelated valuation
-- fields are never touched.
CREATE OR REPLACE FUNCTION seo.gsc_set_keyword_class(
  p_site_id uuid,
  p_keyword_ids uuid[],
  p_class text,
  p_notes text DEFAULT NULL
) RETURNS TABLE (keyword_id uuid, traffic_class text, class_source text)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = seo, web, pg_temp
AS $function$
#variable_conflict use_column
DECLARE
  v_notes text := NULLIF(btrim(p_notes), '');
  v_org uuid;
  v_uid uuid := (SELECT auth.uid());
BEGIN
  PERFORM seo.gsc_assert_site_editor(p_site_id);
  IF p_class NOT IN ('money', 'educational', 'brand', 'mismatch', 'clear') THEN
    RAISE EXCEPTION 'gsc_class_unknown: %', p_class;
  END IF;
  IF p_class = 'mismatch' AND v_notes IS NULL THEN
    RAISE EXCEPTION 'gsc_mismatch_needs_notes: a mismatch ruling must carry its reasoning';
  END IF;
  IF p_keyword_ids IS NULL OR array_length(p_keyword_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'gsc_no_keywords: pass at least one keyword id';
  END IF;
  IF array_length(p_keyword_ids, 1) > 1000 THEN
    RAISE EXCEPTION 'gsc_too_many_keywords: max 1000 per call';
  END IF;

  SELECT s.organization_id INTO v_org FROM web.site s WHERE s.id = p_site_id;

  IF p_class = 'clear' THEN
    UPDATE seo.site_keyword_value skv SET
      traffic_class = NULL,
      content_role = CASE WHEN skv.content_role IN ('money_page', 'supporting_content') THEN NULL ELSE skv.content_role END,
      service_match = CASE WHEN skv.service_match IN ('not_offered', 'actively_avoided') THEN NULL ELSE skv.service_match END,
      lead_quality = CASE WHEN skv.lead_quality = 'negative_value' THEN NULL ELSE skv.lead_quality END,
      suppression_reason = NULL,
      workflow_status = CASE WHEN skv.workflow_status = 'suppressed' THEN 'candidate' ELSE skv.workflow_status END,
      notes = COALESCE(v_notes, skv.notes),
      updated_at = now(),
      updated_by = v_uid,
      version = skv.version + 1
    WHERE skv.site_id = p_site_id
      AND skv.keyword_id = ANY (p_keyword_ids)
      AND skv.deleted_at IS NULL;
  ELSE
    INSERT INTO seo.site_keyword_value AS skv
      (organization_id, site_id, keyword_id, traffic_class, content_role,
       service_match, notes, created_by, updated_by)
    SELECT v_org, p_site_id, kw.id, p_class,
           CASE p_class WHEN 'money' THEN 'money_page'
                        WHEN 'educational' THEN 'supporting_content' END,
           CASE p_class WHEN 'mismatch' THEN 'not_offered' END,
           v_notes, v_uid, v_uid
    FROM seo.keyword kw
    WHERE kw.id = ANY (p_keyword_ids) AND kw.deleted_at IS NULL
    ON CONFLICT (site_id, keyword_id) DO UPDATE SET
      traffic_class = EXCLUDED.traffic_class,
      content_role = CASE
        WHEN EXCLUDED.traffic_class IN ('money', 'educational') THEN EXCLUDED.content_role
        WHEN skv.content_role IN ('money_page', 'supporting_content') THEN NULL
        ELSE skv.content_role END,
      service_match = CASE
        WHEN EXCLUDED.traffic_class = 'mismatch' THEN 'not_offered'
        WHEN skv.service_match IN ('not_offered', 'actively_avoided') THEN NULL
        ELSE skv.service_match END,
      lead_quality = CASE
        WHEN EXCLUDED.traffic_class = 'mismatch' THEN skv.lead_quality
        WHEN skv.lead_quality = 'negative_value' THEN NULL
        ELSE skv.lead_quality END,
      suppression_reason = CASE
        WHEN EXCLUDED.traffic_class = 'mismatch' THEN skv.suppression_reason
        ELSE NULL END,
      workflow_status = CASE
        WHEN EXCLUDED.traffic_class <> 'mismatch' AND skv.workflow_status = 'suppressed'
        THEN 'candidate' ELSE skv.workflow_status END,
      notes = COALESCE(EXCLUDED.notes, skv.notes),
      deleted_at = NULL,
      updated_at = now(),
      updated_by = EXCLUDED.updated_by,
      version = skv.version + 1;
  END IF;

  RETURN QUERY
  SELECT cm.keyword_id, cm.traffic_class, cm.class_source
  FROM seo.gsc_keyword_class_map(p_site_id) cm
  WHERE cm.keyword_id = ANY (p_keyword_ids);
END;
$function$;

REVOKE ALL ON FUNCTION seo.gsc_set_keyword_class(uuid, uuid[], text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION seo.gsc_set_keyword_class(uuid, uuid[], text, text) TO authenticated, service_role;
