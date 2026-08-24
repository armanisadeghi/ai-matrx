-- ============================================================================
-- THE DIMENSION CATALOG: one pass, and counts that belong to THIS site
-- (2026-08-24)
--
-- Symptom: `/value` on the biggest site logged a Supabase 57014 statement
-- timeout on `seo.facet_dimension_catalog` on every load, so the Class dropdown
-- silently lost its options — the picker rendered, empty, with no error a person
-- could see. Measured: 3,187 ms on Data Destruction, 2,427 ms on All Green,
-- against the `authenticated` role's 8 s ceiling — fine alone, over the edge
-- whenever the page loads it beside everything else.
--
-- THREE causes, one of them a correctness bug:
--   1. A correlated `count(*) FROM seo.keyword_facet` PER VALUE (~106 values)
--      over the whole 33k-row stamp table, plus a second correlated `max(as_of)`
--      per value. Now ONE grouped pass.
--   2. `facet_dimension_readiness(d.id)` called THREE times per dimension
--      (is_ready / can_abstain / readiness_note) — 51 calls where 17 would do.
--      Now ONE LATERAL.
--   3. 🚨 The keyword count was NOT site-scoped. A site's catalog counted every
--      OTHER site's stamps on the same value, so the number a person read was
--      never their own. Now it counts what the resolvers count: universal facts
--      (site_id IS NULL) plus THIS site's stamps. With no site (the platform
--      registry) it still counts everything, which is that screen's question.
-- ============================================================================

CREATE OR REPLACE FUNCTION seo.facet_dimension_catalog(p_site_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(dimension_id uuid, slug text, label text, description text, scope text, cardinality text, nature text, site_id uuid, is_system boolean, value_count bigint, keyword_count bigint, rule_count bigint, condition_matcher_count bigint, situational_as_of timestamp with time zone, facet_values jsonb, is_ready boolean, can_abstain boolean, readiness_note text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'seo', 'platform', 'pg_temp'
AS $function$
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'seo_registry_unauthenticated';
  END IF;
  IF p_site_id IS NOT NULL THEN
    PERFORM seo.gsc_assert_site_access(p_site_id);
  END IF;

  RETURN QUERY
  WITH dims AS (
    SELECT c.id, c.slug, c.name, c.metadata, c.is_system
    FROM platform.categories c
    WHERE c.dimension = 'seo_facet' AND c.parent_id IS NULL AND c.deleted_at IS NULL
      AND (
        COALESCE(c.metadata->>'scope','platform') = 'platform'
        OR (p_site_id IS NOT NULL AND (c.metadata->>'site_id')::uuid = p_site_id)
      )
  ),
  vals_raw AS (
    SELECT cv.parent_id AS dim_id, cv.id AS value_id, cv.slug AS value_slug,
           COALESCE(cv.metadata->>'value', split_part(cv.slug, ':', 2)) AS value_key,
           cv.name AS value_label, cv.metadata->>'description' AS value_description,
           COALESCE((cv.metadata->>'abstain')::boolean, false) AS is_abstain,
           cv.position
    FROM platform.categories cv
    JOIN dims d ON d.id = cv.parent_id
    WHERE cv.deleted_at IS NULL
  ),
  -- ONE pass over the stamps that belong to this site's world, not per value.
  stamp_agg AS (
    SELECT kf.category_id, count(*)::bigint AS kw_count, max(kf.as_of) AS last_as_of
    FROM seo.keyword_facet kf
    JOIN vals_raw v ON v.value_id = kf.category_id
    WHERE kf.deleted_at IS NULL
      AND (p_site_id IS NULL OR kf.site_id IS NULL OR kf.site_id = p_site_id)
    GROUP BY kf.category_id
  ),
  -- ONE pass over condition matchers.
  cond_agg AS (
    SELECT dm.value_id, count(*)::bigint AS cond_count, max(dm.last_evaluated_at) AS last_eval
    FROM seo.dimension_value_matcher dm
    JOIN vals_raw v ON v.value_id = dm.value_id
    WHERE dm.kind = 'condition' AND dm.deleted_at IS NULL AND dm.enabled
      AND (p_site_id IS NULL OR dm.site_id = p_site_id)
    GROUP BY dm.value_id
  ),
  vals AS (
    SELECT v.*,
           COALESCE(sa.kw_count, 0) AS kw_count,
           COALESCE(ca.cond_count, 0) AS cond_count,
           -- a situational value's freshness is its last evaluation, else its newest stamp
           COALESCE(ca.last_eval, sa.last_as_of) AS value_as_of
    FROM vals_raw v
    LEFT JOIN stamp_agg sa ON sa.category_id = v.value_id
    LEFT JOIN cond_agg  ca ON ca.value_id   = v.value_id
  ),
  rule_agg AS (
    SELECT r.match_facet, count(*)::bigint AS rule_count
    FROM seo.keyword_class_rule r
    WHERE r.deleted_at IS NULL AND r.match_facet IS NOT NULL
      AND (p_site_id IS NULL OR r.site_id = p_site_id OR r.site_id IS NULL)
    GROUP BY r.match_facet
  )
  SELECT d.id, d.slug, d.name, d.metadata->>'description',
         COALESCE(d.metadata->>'scope','platform'),
         COALESCE(d.metadata->>'cardinality','single'),
         COALESCE(d.metadata->>'nature','intrinsic'),
         (d.metadata->>'site_id')::uuid,
         d.is_system,
         COALESCE(count(v.value_id), 0)::bigint,
         COALESCE(sum(v.kw_count), 0)::bigint,
         COALESCE(max(ra.rule_count), 0)::bigint,
         COALESCE(sum(v.cond_count), 0)::bigint,
         max(v.value_as_of),
         COALESCE(jsonb_agg(
           jsonb_build_object(
             'value_id', v.value_id, 'slug', v.value_slug, 'key', v.value_key,
             'label', v.value_label, 'description', v.value_description,
             'abstain', COALESCE(v.is_abstain, false),
             'keyword_count', v.kw_count,
             'as_of', v.value_as_of,
             'condition_matcher_count', v.cond_count)
           ORDER BY v.position NULLS LAST, v.value_label
         ) FILTER (WHERE v.value_id IS NOT NULL), '[]'::jsonb),
         rd.is_ready, rd.can_abstain, rd.readiness_note
  FROM dims d
  LEFT JOIN vals v ON v.dim_id = d.id
  LEFT JOIN rule_agg ra ON ra.match_facet = d.slug
  -- ONE readiness call per dimension, not three.
  LEFT JOIN LATERAL seo.facet_dimension_readiness(d.id) rd ON true
  GROUP BY d.id, d.slug, d.name, d.metadata, d.is_system,
           rd.is_ready, rd.can_abstain, rd.readiness_note
  ORDER BY COALESCE(d.metadata->>'scope','platform') DESC, d.name;
END;
$function$;

CREATE INDEX IF NOT EXISTS keyword_facet_category_site_idx
  ON seo.keyword_facet (category_id, site_id) WHERE deleted_at IS NULL;
