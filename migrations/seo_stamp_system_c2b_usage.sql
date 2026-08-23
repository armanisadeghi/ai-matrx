-- C2 follow-through: the old rules bench asks "what does each rule / geo area
-- fire on?" through gsc_value_meaning_usage, which read pre-C2 reason kinds
-- (rule / geo). Under C2 those are `stamp` rows whose VALUE carries the
-- migrated rule_id / area_id in metadata. Map them back so the bench stays
-- truthful until C4 replaces it.
CREATE OR REPLACE FUNCTION seo.gsc_value_meaning_usage(p_site_id uuid, p_start date, p_end date)
 RETURNS TABLE(kind text, ref text, band text, keywords bigint, clicks bigint, impressions bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'seo', 'platform', 'pg_temp'
AS $function$
BEGIN
  PERFORM seo.gsc_assert_site_access(p_site_id);
  RETURN QUERY
  WITH winner AS (
    SELECT DISTINCT ON (spd.date) spd.date AS d, spd.run_id AS rid
    FROM seo.search_performance_daily spd
    WHERE spd.provider = 'gsc' AND spd.site_id = p_site_id
      AND spd.dimension_profile = 'query' AND spd.date BETWEEN p_start AND p_end
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
  ids AS (SELECT array_agg(kid) AS a FROM vol),
  vm AS (SELECT * FROM seo.keyword_value_map(p_site_id, (SELECT a FROM ids))),
  reasons AS (
    SELECT v.c, v.i, r AS reason
    FROM vol v JOIN vm m ON m.keyword_id = v.kid
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(m.reasons, '[]'::jsonb)) r
    WHERE r->>'kind' = 'stamp'
  ),
  valued AS (
    SELECT rs.c, rs.i, rs.reason, cv.metadata->>'rule_id' AS rule_id, cv.metadata->>'area_id' AS area_id,
           cv.name AS value_label, cv.metadata->>'geo_band' AS geo_band
    FROM reasons rs JOIN platform.categories cv ON cv.id = (rs.reason->>'value_id')::uuid
  )
  SELECT 'rule'::text, v.rule_id, NULL::text, count(*)::bigint, COALESCE(sum(v.c),0)::bigint, COALESCE(sum(v.i),0)::bigint
  FROM valued v WHERE v.rule_id IS NOT NULL GROUP BY v.rule_id
  UNION ALL
  SELECT 'geo_area'::text, v.value_label, v.geo_band, count(*)::bigint, COALESCE(sum(v.c),0)::bigint, COALESCE(sum(v.i),0)::bigint
  FROM valued v WHERE v.area_id IS NOT NULL GROUP BY v.value_label, v.geo_band;
END;
$function$;
