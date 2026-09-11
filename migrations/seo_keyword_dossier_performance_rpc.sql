-- Keyword Intelligence needs one site's performance for one keyword. The
-- generic security-invoker view ranks every recent observation before
-- PostgREST can apply those two filters, so a dossier open can exhaust the
-- authenticated statement budget. This door pushes both equality predicates
-- inside the freshness window; the existing (site_id, keyword_id) indexes make
-- the work proportional to the requested keyword.

CREATE OR REPLACE FUNCTION seo.site_keyword_performance_for_keyword(
  p_site_id uuid,
  p_keyword_id uuid
)
RETURNS TABLE (
  site_id uuid,
  organization_id uuid,
  provider text,
  keyword_id uuid,
  query text,
  first_date date,
  last_date date,
  clicks bigint,
  impressions bigint,
  ctr numeric,
  average_position numeric,
  top_page_id uuid,
  top_page_url text,
  top_page_path text,
  top_page_clicks bigint,
  top_page_impressions bigint,
  search_volume integer,
  cpc numeric,
  competition text,
  competition_index integer,
  demand_trajectory text,
  market_fetched_at timestamptz,
  workflow_status text,
  content_role text,
  competitive_position text,
  priority_score numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = seo, web, iam, pg_temp
AS $function$
BEGIN
  IF p_site_id IS NULL OR p_keyword_id IS NULL THEN
    RAISE EXCEPTION
      'site_keyword_performance_scope_invalid: site and keyword are required'
      USING ERRCODE = '22023';
  END IF;

  PERFORM seo.gsc_assert_site_access(p_site_id);

  RETURN QUERY
  WITH latest_observations AS NOT MATERIALIZED (
    SELECT ranked.*
    FROM (
      SELECT
        observation.*,
        row_number() OVER (
          PARTITION BY
            observation.organization_id,
            observation.provider,
            observation.site_id,
            observation.date,
            observation.dimension_profile,
            observation.keyword_id,
            observation.query,
            observation.page_id,
            observation.country,
            observation.device,
            observation.search_appearance
          ORDER BY observation.created_at DESC, observation.id DESC
        ) AS freshness_rank
      FROM seo.search_performance_daily observation
      WHERE observation.site_id = p_site_id
        AND observation.keyword_id = p_keyword_id
        AND observation.date >= CURRENT_DATE - 27
    ) ranked
    WHERE ranked.freshness_rank = 1
  ),
  query_totals AS (
    SELECT
      observation.site_id,
      observation.organization_id,
      observation.provider,
      observation.keyword_id,
      observation.query,
      min(observation.date) AS first_date,
      max(observation.date) AS last_date,
      sum(observation.clicks) AS clicks,
      sum(observation.impressions) AS impressions,
      CASE
        WHEN sum(observation.impressions) > 0
          THEN sum(observation.clicks)::numeric
               / sum(observation.impressions)::numeric
        ELSE NULL::numeric
      END AS ctr,
      CASE
        WHEN sum(observation.impressions) > 0
          THEN sum(observation.average_position * observation.impressions::numeric)
               / sum(observation.impressions)::numeric
        ELSE avg(observation.average_position)
      END AS average_position
    FROM latest_observations observation
    WHERE observation.dimension_profile = 'query'
      AND observation.query IS NOT NULL
    GROUP BY
      observation.site_id,
      observation.organization_id,
      observation.provider,
      observation.keyword_id,
      observation.query
  ),
  page_totals AS (
    SELECT
      observation.site_id,
      observation.provider,
      observation.keyword_id,
      observation.query,
      observation.page_id,
      sum(observation.clicks) AS clicks,
      sum(observation.impressions) AS impressions,
      row_number() OVER (
        PARTITION BY
          observation.site_id,
          observation.provider,
          observation.keyword_id,
          observation.query
        ORDER BY
          sum(observation.clicks) DESC,
          sum(observation.impressions) DESC,
          observation.page_id
      ) AS page_rank
    FROM latest_observations observation
    WHERE observation.dimension_profile = 'query_page'
      AND observation.query IS NOT NULL
      AND observation.page_id IS NOT NULL
    GROUP BY
      observation.site_id,
      observation.provider,
      observation.keyword_id,
      observation.query,
      observation.page_id
  )
  SELECT
    totals.site_id,
    totals.organization_id,
    totals.provider,
    totals.keyword_id,
    totals.query,
    totals.first_date,
    totals.last_date,
    totals.clicks,
    totals.impressions,
    totals.ctr,
    totals.average_position,
    pages.page_id AS top_page_id,
    page.url AS top_page_url,
    page.path AS top_page_path,
    pages.clicks AS top_page_clicks,
    pages.impressions AS top_page_impressions,
    market.search_volume,
    market.cpc,
    market.competition,
    market.competition_index,
    market.demand_trajectory,
    market.metrics_fetched_at AS market_fetched_at,
    site_value.workflow_status,
    site_value.content_role,
    site_value.competitive_position,
    site_value.priority_score
  FROM query_totals totals
  LEFT JOIN page_totals pages
    ON pages.site_id = totals.site_id
   AND pages.provider = totals.provider
   AND pages.keyword_id IS NOT DISTINCT FROM totals.keyword_id
   AND pages.query = totals.query
   AND pages.page_rank = 1
  LEFT JOIN web.page page
    ON page.id = pages.page_id
   AND page.deleted_at IS NULL
  LEFT JOIN seo.keyword_market market
    ON market.keyword_id = totals.keyword_id
   AND market.location_code = 2840
   AND market.deleted_at IS NULL
  LEFT JOIN seo.site_keyword_value site_value
    ON site_value.site_id = totals.site_id
   AND site_value.keyword_id = totals.keyword_id
   AND site_value.deleted_at IS NULL;
END;
$function$;

ALTER FUNCTION seo.site_keyword_performance_for_keyword(uuid, uuid)
  OWNER TO postgres;

COMMENT ON FUNCTION seo.site_keyword_performance_for_keyword(uuid, uuid) IS
  'Keyword Intelligence point read. Proves site access, then ranks and aggregates only the requested site and keyword so the client never expands the generic performance view.';

-- A new client-callable SECURITY DEFINER function must be declared before its
-- grant or the database-wide guard immediately revokes authenticated access.
INSERT INTO platform.client_callable_door
  (schema_name, function_name, identity_args, reason)
SELECT
  'seo',
  'site_keyword_performance_for_keyword',
  pg_get_function_identity_arguments(proc.oid),
  'READ. Keyword Intelligence retrieves performance for one site and one keyword. The body proves the caller can access the site, accepts no user or organization identity, and confines every fact-table read to the two required UUIDs before ranking.'
FROM pg_proc proc
JOIN pg_namespace namespace ON namespace.oid = proc.pronamespace
WHERE namespace.nspname = 'seo'
  AND proc.proname = 'site_keyword_performance_for_keyword'
  AND proc.pronargs = 2
ON CONFLICT DO NOTHING;

REVOKE ALL ON FUNCTION seo.site_keyword_performance_for_keyword(uuid, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION seo.site_keyword_performance_for_keyword(uuid, uuid)
  TO authenticated, service_role;
