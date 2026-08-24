-- ============================================================================
-- THE DIMENSION CATALOG, part two: stop the stamp count from touching the heap
-- (2026-08-24)
--
-- `seo_facet_catalog_scope_and_speed.sql` (same day) collapsed the correlated
-- per-value subqueries into ONE grouped pass and site-scoped the count. The
-- 57014 statement timeout on `/value` for Data Destruction survived it:
-- pg_stat_statements recorded 200 PostgREST calls at a 2,864 ms mean and a
-- 7,887 ms max, against the `authenticated` role's 8 s ceiling. The Class
-- dropdown and the dimension picker behind "Set the class…" were still losing
-- their options on the flagship worth screen, with the recovery layer screaming
-- on every load.
--
-- THE REMAINING COST IS THE HEAP, NOT THE ALGORITHM.
-- `stamp_agg` aggregates every live `seo.keyword_facet` row in this site's
-- world: ~34,585 of 36,716. That is not a bug to bound away — 28,947 of them are
-- GLOBAL (`site_id IS NULL`) intrinsic stamps that every tenant legitimately
-- shares, so the scan cannot be narrowed to one site without changing what the
-- number means. What was wrong is HOW those rows were read:
-- `keyword_facet_category_site_idx (category_id, site_id) WHERE deleted_at IS
-- NULL` carried the join key and the site filter but NOT `as_of`, so all 34.5k
-- tuples took a heap fetch — 11,242 heap blocks, ~88 MB of random I/O, on every
-- single page load. Warm that measured 53 ms; cold or under load it is the
-- multi-second mean above.
--
-- INCLUDE (as_of) closes the loop: the aggregation becomes an Index Only Scan
-- with Heap Fetches: 0, 518 buffers instead of 11,447 (22x), and the whole RPC
-- drops from a 1,883 ms mean to 58 ms (32x) on the same site, same data,
-- byte-identical output (verified per-dimension against a hand-written count).
--
-- The two dropped indexes are strict prefixes of the new one under the identical
-- partial predicate — they can answer nothing it cannot, and this table is
-- write-hot (the classifier stamps it in bulk). They are dead weight, not a
-- fallback.
--
-- SECOND FIX, same load: `facet_dimension_readiness(d.id)` sat as a LATERAL
-- inside the grouped query, so the planner re-evaluated it once per VALUE row
-- (85 loops, 2,593 buffers) to answer a question that has exactly one answer per
-- DIMENSION (17). Hoisted into its own CTE.
--
-- Idempotent. SoR: common-docs/systems/marketing/seo/seo-keywords/value-system.md
-- ============================================================================

CREATE INDEX IF NOT EXISTS keyword_facet_cat_site_asof_idx
  ON seo.keyword_facet (category_id, site_id) INCLUDE (as_of)
  WHERE deleted_at IS NULL;

DROP INDEX IF EXISTS seo.keyword_facet_category_site_idx;
DROP INDEX IF EXISTS seo.keyword_facet_category_idx;

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
  -- Index-only via keyword_facet_cat_site_asof_idx.
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
  ),
  -- ONE readiness call per DIMENSION. Left in the grouped query below it was
  -- re-evaluated once per value row.
  ready AS (
    SELECT d.id AS dim_id, rd.is_ready, rd.can_abstain, rd.readiness_note
    FROM dims d
    CROSS JOIN LATERAL seo.facet_dimension_readiness(d.id) rd
  ),
  rolled AS (
    SELECT d.id AS dim_id,
           COALESCE(count(v.value_id), 0)::bigint AS value_count,
           COALESCE(sum(v.kw_count), 0)::bigint   AS keyword_count,
           COALESCE(sum(v.cond_count), 0)::bigint AS condition_matcher_count,
           max(v.value_as_of)                     AS situational_as_of,
           COALESCE(jsonb_agg(
             jsonb_build_object(
               'value_id', v.value_id, 'slug', v.value_slug, 'key', v.value_key,
               'label', v.value_label, 'description', v.value_description,
               'abstain', COALESCE(v.is_abstain, false),
               'keyword_count', v.kw_count,
               'as_of', v.value_as_of,
               'condition_matcher_count', v.cond_count)
             ORDER BY v.position NULLS LAST, v.value_label
           ) FILTER (WHERE v.value_id IS NOT NULL), '[]'::jsonb) AS facet_values
    FROM dims d
    LEFT JOIN vals v ON v.dim_id = d.id
    GROUP BY d.id
  )
  SELECT d.id, d.slug, d.name, d.metadata->>'description',
         COALESCE(d.metadata->>'scope','platform'),
         COALESCE(d.metadata->>'cardinality','single'),
         COALESCE(d.metadata->>'nature','intrinsic'),
         (d.metadata->>'site_id')::uuid,
         d.is_system,
         ro.value_count,
         ro.keyword_count,
         COALESCE(ra.rule_count, 0)::bigint,
         ro.condition_matcher_count,
         ro.situational_as_of,
         ro.facet_values,
         ry.is_ready, ry.can_abstain, ry.readiness_note
  FROM dims d
  JOIN rolled ro ON ro.dim_id = d.id
  LEFT JOIN ready ry ON ry.dim_id = d.id
  LEFT JOIN rule_agg ra ON ra.match_facet = d.slug
  ORDER BY COALESCE(d.metadata->>'scope','platform') DESC, d.name;
END;
$function$;
