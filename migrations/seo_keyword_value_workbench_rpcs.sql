-- Keyword Value System — workbench read + override write.
-- SoR: common-docs/systems/marketing/seo/seo-keywords/value-system.md.
-- Both SECURITY DEFINER per the 2026-08-07 timeout law: reads guard with
-- gsc_assert_site_access, writes with gsc_assert_site_editor (the SAME editor
-- predicate the class write path uses). Never a second write path for value
-- rulings — extend gsc_set_keyword_value here only.

-- The workbench listing: every GSC-active keyword in the window with its
-- resolved value (band/score/source/reasons), its traffic class, and volume.
CREATE OR REPLACE FUNCTION seo.gsc_keyword_value_review(
  p_site_id uuid,
  p_start date,
  p_end date,
  p_band text DEFAULT NULL,          -- filter: band slug, or 'unvalued'
  p_source text DEFAULT NULL,        -- filter: override | computed | unvalued
  p_search text DEFAULT NULL,
  p_sort text DEFAULT 'clicks',      -- clicks | impressions | score | keyword
  p_sort_dir text DEFAULT 'desc',
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0
) RETURNS TABLE (
  keyword_id uuid,
  keyword text,
  value_band text,
  value_score numeric,
  value_source text,
  reasons jsonb,
  traffic_class text,
  clicks bigint,
  impressions bigint,
  total_count bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = seo, platform, pg_temp
AS $fn$
BEGIN
  PERFORM seo.gsc_assert_site_access(p_site_id);
  IF p_sort NOT IN ('clicks','impressions','score','keyword') THEN
    RAISE EXCEPTION 'gsc_bad_sort: %', p_sort;
  END IF;

  RETURN QUERY
  WITH winner AS (
    SELECT DISTINCT ON (spd.date) spd.date AS d, spd.run_id AS rid
    FROM seo.search_performance_daily spd
    WHERE spd.provider = 'gsc' AND spd.site_id = p_site_id
      AND spd.dimension_profile = 'query'
      AND spd.date BETWEEN p_start AND p_end
    ORDER BY spd.date, spd.created_at DESC, spd.run_id DESC
  ),
  vol AS (
    SELECT spd.keyword_id AS kid, SUM(spd.clicks)::bigint AS c, SUM(spd.impressions)::bigint AS i
    FROM seo.search_performance_daily spd
    JOIN winner w ON w.d = spd.date AND w.rid = spd.run_id
    WHERE spd.provider = 'gsc' AND spd.site_id = p_site_id
      AND spd.dimension_profile = 'query' AND spd.keyword_id IS NOT NULL
    GROUP BY spd.keyword_id
  ),
  joined AS (
    SELECT v.kid, k.normalized_phrase AS phrase,
           COALESCE(vm.value_band, 'unvalued') AS band,
           vm.value_score AS score,
           COALESCE(vm.value_source, 'unvalued') AS src,
           COALESCE(vm.reasons, '[]'::jsonb) AS rsn,
           COALESCE(cm.traffic_class, 'unclassified') AS cls,
           v.c, v.i
    FROM vol v
    JOIN seo.keyword k ON k.id = v.kid
    LEFT JOIN seo.keyword_value_map(p_site_id) vm ON vm.keyword_id = v.kid
    LEFT JOIN seo.gsc_keyword_class_map(p_site_id) cm ON cm.keyword_id = v.kid
    WHERE (p_band IS NULL OR COALESCE(vm.value_band, 'unvalued') = p_band)
      AND (p_source IS NULL OR COALESCE(vm.value_source, 'unvalued') = p_source)
      AND (p_search IS NULL OR btrim(p_search) = ''
           OR k.normalized_phrase ILIKE '%' || seo.gsc_perf_like_escape(lower(btrim(p_search))) || '%')
  ),
  counted AS (SELECT COUNT(*)::bigint AS n FROM joined)
  SELECT j.kid, j.phrase, j.band, j.score, j.src, j.rsn, j.cls, j.c, j.i, ct.n
  FROM joined j CROSS JOIN counted ct
  ORDER BY
    CASE WHEN p_sort = 'clicks'      AND p_sort_dir = 'desc' THEN j.c END DESC NULLS LAST,
    CASE WHEN p_sort = 'clicks'      AND p_sort_dir = 'asc'  THEN j.c END ASC  NULLS LAST,
    CASE WHEN p_sort = 'impressions' AND p_sort_dir = 'desc' THEN j.i END DESC NULLS LAST,
    CASE WHEN p_sort = 'impressions' AND p_sort_dir = 'asc'  THEN j.i END ASC  NULLS LAST,
    CASE WHEN p_sort = 'score'       AND p_sort_dir = 'desc' THEN j.score END DESC NULLS LAST,
    CASE WHEN p_sort = 'score'       AND p_sort_dir = 'asc'  THEN j.score END ASC  NULLS LAST,
    CASE WHEN p_sort = 'keyword'     AND p_sort_dir = 'desc' THEN j.phrase END DESC,
    CASE WHEN p_sort = 'keyword'     AND p_sort_dir = 'asc'  THEN j.phrase END ASC,
    j.kid  -- unique tie-break: paginated ORDER BY must end in a unique column
  LIMIT LEAST(GREATEST(p_limit, 1), 500) OFFSET GREATEST(p_offset, 0);
END;
$fn$;

-- THE one human write path for value-tier rulings (single + bulk).
-- p_value_tier NULL = clear the override back to computed/unvalued.
CREATE OR REPLACE FUNCTION seo.gsc_set_keyword_value(
  p_site_id uuid,
  p_keyword_ids uuid[],
  p_value_tier text,
  p_notes text DEFAULT NULL
) RETURNS TABLE (keyword_id uuid, value_band text, value_source text)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = seo, platform, pg_temp
AS $fn$
#variable_conflict use_column
DECLARE
  v_org uuid;
  v_valid boolean;
BEGIN
  PERFORM seo.gsc_assert_site_editor(p_site_id);
  IF p_keyword_ids IS NULL OR array_length(p_keyword_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'gsc_no_keywords';
  END IF;

  IF p_value_tier IS NOT NULL THEN
    -- tier must exist in the site's band vocabulary (or the platform template
    -- when the site has none) or be the reserved 'negative'
    SELECT EXISTS (
      SELECT 1 FROM seo.site_vocabulary sv
      WHERE sv.site_id = p_site_id AND sv.vocab_kind = 'value_band'
        AND sv.active AND sv.deleted_at IS NULL AND sv.value = p_value_tier
      UNION ALL
      SELECT 1 FROM platform.categories c
      WHERE c.dimension = 'seo_value_band' AND c.deleted_at IS NULL AND c.slug = p_value_tier
        AND NOT EXISTS (SELECT 1 FROM seo.site_vocabulary sv2
          WHERE sv2.site_id = p_site_id AND sv2.vocab_kind = 'value_band'
            AND sv2.active AND sv2.deleted_at IS NULL)
    ) INTO v_valid;
    IF NOT v_valid THEN
      RAISE EXCEPTION 'gsc_unknown_value_band: % is not in this site''s value-band vocabulary', p_value_tier;
    END IF;
  END IF;

  SELECT s.organization_id INTO v_org FROM web.site s WHERE s.id = p_site_id;

  INSERT INTO seo.site_keyword_value AS skv
    (organization_id, site_id, keyword_id, value_tier, notes, metadata)
  SELECT v_org, p_site_id, kid, p_value_tier,
         CASE WHEN p_notes IS NOT NULL AND btrim(p_notes) <> '' THEN p_notes END,
         jsonb_build_object('valuation', jsonb_build_object(
           'origin', 'human', 'applied_at', now()))
  FROM unnest(p_keyword_ids) AS kid
  ON CONFLICT (site_id, keyword_id)
  DO UPDATE SET
    value_tier = EXCLUDED.value_tier,
    notes = COALESCE(EXCLUDED.notes, skv.notes),
    metadata = skv.metadata || EXCLUDED.metadata,
    updated_at = now();

  RETURN QUERY
  SELECT vm.keyword_id, vm.value_band, vm.value_source
  FROM seo.keyword_value_map(p_site_id) vm
  WHERE vm.keyword_id = ANY (p_keyword_ids);
END;
$fn$;

REVOKE ALL ON FUNCTION seo.gsc_keyword_value_review(uuid,date,date,text,text,text,text,text,int,int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION seo.gsc_keyword_value_review(uuid,date,date,text,text,text,text,text,int,int) TO authenticated, service_role;
REVOKE ALL ON FUNCTION seo.gsc_set_keyword_value(uuid,uuid[],text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION seo.gsc_set_keyword_value(uuid,uuid[],text,text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

-- Effective vocabulary read: the site's rows when any exist, else the platform
-- template — ONE resolution semantics, shared with the resolver.
CREATE OR REPLACE FUNCTION seo.gsc_value_vocabulary(
  p_site_id uuid,
  p_kind text DEFAULT 'value_band'
) RETURNS TABLE (value text, label text, description text, sort int, config jsonb, is_template boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = seo, platform, pg_temp
AS $fn$
BEGIN
  PERFORM seo.gsc_assert_site_access(p_site_id);
  IF p_kind NOT IN ('value_band','geo_band') THEN
    RAISE EXCEPTION 'gsc_bad_vocab_kind: %', p_kind;
  END IF;
  RETURN QUERY
  SELECT sv.value, sv.label, sv.description, sv.sort, sv.config, false
  FROM seo.site_vocabulary sv
  WHERE sv.site_id = p_site_id AND sv.vocab_kind = p_kind
    AND sv.active AND sv.deleted_at IS NULL
  ORDER BY sv.sort;
  IF NOT FOUND THEN
    RETURN QUERY
    SELECT c.slug, c.name, c.metadata->>'description', COALESCE(c.position, 0), c.metadata, true
    FROM platform.categories c
    WHERE c.dimension = 'seo_' || p_kind AND c.deleted_at IS NULL
    ORDER BY COALESCE(c.position, 0);
  END IF;
END;
$fn$;

REVOKE ALL ON FUNCTION seo.gsc_value_vocabulary(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION seo.gsc_value_vocabulary(uuid,text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
