-- Bounded site-keyword Performance table read.
--
-- The generic v_site_keyword_performance view remains the canonical point-read
-- model, but it is the wrong execution boundary for a paged table: PostgREST's
-- exact-count shape expands the unparameterized aggregate twice. On a site with
-- ~960k recent provider observations, each expansion ranked/aggregated the same
-- history and the authenticated 8s statement budget cancelled the request.
--
-- These private aggregates put site_id inside the query before any ranking and
-- choose the newest complete run per provider/profile/date (the canonical GSC
-- restatement rule). Their ROWS clauses describe the real production cardinality;
-- without them PostgreSQL estimates six aggregate rows and nested-loops the two
-- ~26k-row result sets. The public RPC then applies the existing table filters,
-- exact count, sort, and pagination once.

CREATE OR REPLACE FUNCTION seo._site_keyword_query_totals(p_site_id uuid)
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
  average_position numeric
)
LANGUAGE sql
STABLE
ROWS 50000
SET search_path = seo, pg_temp
AS $function$
  WITH winners AS MATERIALIZED (
    SELECT DISTINCT ON (observation.provider, observation.date)
      observation.provider,
      observation.date,
      observation.run_id
    FROM seo.search_performance_daily observation
    WHERE observation.site_id = p_site_id
      AND observation.dimension_profile = 'query'
      AND observation.date >= CURRENT_DATE - 27
    ORDER BY observation.provider, observation.date,
             observation.created_at DESC, observation.run_id DESC
  )
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
  FROM seo.search_performance_daily observation
  JOIN winners winner
    ON winner.provider = observation.provider
   AND winner.date = observation.date
   AND winner.run_id = observation.run_id
  WHERE observation.site_id = p_site_id
    AND observation.dimension_profile = 'query'
    AND observation.date >= CURRENT_DATE - 27
    AND observation.query IS NOT NULL
  GROUP BY observation.site_id, observation.organization_id,
           observation.provider, observation.keyword_id, observation.query;
$function$;

CREATE OR REPLACE FUNCTION seo._site_keyword_top_pages(p_site_id uuid)
RETURNS TABLE (
  site_id uuid,
  provider text,
  keyword_id uuid,
  query text,
  page_id uuid,
  clicks bigint,
  impressions bigint
)
LANGUAGE sql
STABLE
ROWS 50000
SET search_path = seo, pg_temp
AS $function$
  WITH winners AS MATERIALIZED (
    SELECT DISTINCT ON (observation.provider, observation.date)
      observation.provider,
      observation.date,
      observation.run_id
    FROM seo.search_performance_daily observation
    WHERE observation.site_id = p_site_id
      AND observation.dimension_profile = 'query_page'
      AND observation.date >= CURRENT_DATE - 27
    ORDER BY observation.provider, observation.date,
             observation.created_at DESC, observation.run_id DESC
  ),
  page_sums AS (
    SELECT
      observation.site_id,
      observation.provider,
      observation.keyword_id,
      observation.query,
      observation.page_id,
      sum(observation.clicks) AS clicks,
      sum(observation.impressions) AS impressions
    FROM seo.search_performance_daily observation
    JOIN winners winner
      ON winner.provider = observation.provider
     AND winner.date = observation.date
     AND winner.run_id = observation.run_id
    WHERE observation.site_id = p_site_id
      AND observation.dimension_profile = 'query_page'
      AND observation.date >= CURRENT_DATE - 27
      AND observation.query IS NOT NULL
      AND observation.page_id IS NOT NULL
    GROUP BY observation.site_id, observation.provider,
             observation.keyword_id, observation.query, observation.page_id
  )
  SELECT DISTINCT ON (
    sums.site_id, sums.provider, sums.keyword_id, sums.query
  )
    sums.site_id,
    sums.provider,
    sums.keyword_id,
    sums.query,
    sums.page_id,
    sums.clicks,
    sums.impressions
  FROM page_sums sums
  ORDER BY sums.site_id, sums.provider, sums.keyword_id, sums.query,
           sums.clicks DESC, sums.impressions DESC, sums.page_id;
$function$;

ALTER FUNCTION seo._site_keyword_query_totals(uuid) OWNER TO postgres;
ALTER FUNCTION seo._site_keyword_top_pages(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION seo._site_keyword_query_totals(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION seo._site_keyword_top_pages(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION seo._site_keyword_query_totals(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION seo._site_keyword_top_pages(uuid) TO service_role;

COMMENT ON FUNCTION seo._site_keyword_query_totals(uuid) IS
  'Internal site-scoped newest-run query aggregate. ROWS reflects production cardinality so callers do not choose a catastrophic nested-loop plan.';
COMMENT ON FUNCTION seo._site_keyword_top_pages(uuid) IS
  'Internal site-scoped newest-run strongest-page aggregate. ROWS reflects production cardinality so callers hash/merge-join it to query totals.';

CREATE OR REPLACE FUNCTION seo.site_keyword_performance_page(
  p_site_id uuid,
  p_filters jsonb DEFAULT '{}'::jsonb,
  p_search text DEFAULT NULL,
  p_sort text DEFAULT 'clicks',
  p_sort_dir text DEFAULT 'desc',
  p_limit integer DEFAULT 25,
  p_offset integer DEFAULT 0
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
  priority_score numeric,
  total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = seo, web, iam, pg_temp
AS $function$
DECLARE
  v_search text := NULLIF(btrim(p_search), '');
  v_query_mode text := NULLIF(p_filters->>'query_mode', '');
  v_query_value text := NULLIF(btrim(p_filters->>'query_value'), '');
  v_page_mode text := NULLIF(p_filters->>'top_page_path_mode', '');
  v_page_value text := NULLIF(btrim(p_filters->>'top_page_path_value'), '');
  v_workflow_status text[];
  v_providers text[];
  v_competitions text[];
  v_clicks_min numeric := NULLIF(p_filters->>'clicks_min', '')::numeric;
  v_clicks_max numeric := NULLIF(p_filters->>'clicks_max', '')::numeric;
  v_impressions_min numeric := NULLIF(p_filters->>'impressions_min', '')::numeric;
  v_impressions_max numeric := NULLIF(p_filters->>'impressions_max', '')::numeric;
  v_ctr_min numeric := NULLIF(p_filters->>'ctr_min', '')::numeric;
  v_ctr_max numeric := NULLIF(p_filters->>'ctr_max', '')::numeric;
  v_position_min numeric := NULLIF(p_filters->>'average_position_min', '')::numeric;
  v_position_max numeric := NULLIF(p_filters->>'average_position_max', '')::numeric;
  v_volume_min numeric := NULLIF(p_filters->>'search_volume_min', '')::numeric;
  v_volume_max numeric := NULLIF(p_filters->>'search_volume_max', '')::numeric;
  v_cpc_min numeric := NULLIF(p_filters->>'cpc_min', '')::numeric;
  v_cpc_max numeric := NULLIF(p_filters->>'cpc_max', '')::numeric;
  v_competition_index_min numeric := NULLIF(p_filters->>'competition_index_min', '')::numeric;
  v_competition_index_max numeric := NULLIF(p_filters->>'competition_index_max', '')::numeric;
  v_priority_min numeric := NULLIF(p_filters->>'priority_score_min', '')::numeric;
  v_priority_max numeric := NULLIF(p_filters->>'priority_score_max', '')::numeric;
BEGIN
  PERFORM seo.gsc_assert_site_access(p_site_id);

  IF p_filters IS NULL OR jsonb_typeof(p_filters) <> 'object' THEN
    RAISE EXCEPTION 'site_keyword_performance_filters_invalid: expected a JSON object'
      USING ERRCODE = '22023';
  END IF;
  IF v_query_mode IS NOT NULL
     AND v_query_mode NOT IN ('contains', 'empty', 'not_empty') THEN
    RAISE EXCEPTION 'site_keyword_performance_query_mode_invalid: %', v_query_mode
      USING ERRCODE = '22023';
  END IF;
  IF v_page_mode IS NOT NULL
     AND v_page_mode NOT IN ('contains', 'empty', 'not_empty') THEN
    RAISE EXCEPTION 'site_keyword_performance_page_mode_invalid: %', v_page_mode
      USING ERRCODE = '22023';
  END IF;
  IF p_sort NOT IN (
    'query', 'clicks', 'impressions', 'ctr', 'average_position',
    'search_volume', 'cpc', 'competition_index', 'competition',
    'priority_score', 'top_page_path', 'last_date', 'workflow_status'
  ) THEN
    RAISE EXCEPTION 'site_keyword_performance_sort_invalid: %', p_sort
      USING ERRCODE = '22023';
  END IF;
  IF p_sort_dir NOT IN ('asc', 'desc') THEN
    RAISE EXCEPTION 'site_keyword_performance_sort_direction_invalid: %', p_sort_dir
      USING ERRCODE = '22023';
  END IF;
  IF p_limit < 1 OR p_limit > 500 OR p_offset < 0 THEN
    RAISE EXCEPTION
      'site_keyword_performance_pagination_invalid: limit=% offset=%',
      p_limit, p_offset
      USING ERRCODE = '22023';
  END IF;

  IF p_filters ? 'workflow_status' THEN
    IF jsonb_typeof(p_filters->'workflow_status') <> 'array' THEN
      RAISE EXCEPTION 'site_keyword_performance_workflow_filter_invalid: expected an array'
        USING ERRCODE = '22023';
    END IF;
    SELECT array_agg(value) INTO v_workflow_status
    FROM jsonb_array_elements_text(p_filters->'workflow_status') AS values_(value);
  END IF;
  IF p_filters ? 'provider' THEN
    IF jsonb_typeof(p_filters->'provider') <> 'array' THEN
      RAISE EXCEPTION 'site_keyword_performance_provider_filter_invalid: expected an array'
        USING ERRCODE = '22023';
    END IF;
    SELECT array_agg(value) INTO v_providers
    FROM jsonb_array_elements_text(p_filters->'provider') AS values_(value);
  END IF;
  IF p_filters ? 'competition' THEN
    IF jsonb_typeof(p_filters->'competition') <> 'array' THEN
      RAISE EXCEPTION 'site_keyword_performance_competition_filter_invalid: expected an array'
        USING ERRCODE = '22023';
    END IF;
    SELECT array_agg(value) INTO v_competitions
    FROM jsonb_array_elements_text(p_filters->'competition') AS values_(value);
  END IF;

  RETURN QUERY
  WITH
  query_totals AS MATERIALIZED (
    SELECT * FROM seo._site_keyword_query_totals(p_site_id)
  ),
  page_totals AS MATERIALIZED (
    SELECT * FROM seo._site_keyword_top_pages(p_site_id)
  ),
  enriched AS (
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
     AND COALESCE(
       pages.keyword_id,
       '00000000-0000-0000-0000-000000000000'::uuid
     ) = COALESCE(
       totals.keyword_id,
       '00000000-0000-0000-0000-000000000000'::uuid
     )
     AND pages.query = totals.query
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
     AND site_value.deleted_at IS NULL
  ),
  filtered AS (
    SELECT enriched.*
    FROM enriched
    WHERE (
      v_search IS NULL
      OR enriched.query ILIKE '%' || seo.gsc_perf_like_escape(v_search) || '%'
      OR enriched.top_page_path ILIKE '%' || seo.gsc_perf_like_escape(v_search) || '%'
      OR enriched.top_page_url ILIKE '%' || seo.gsc_perf_like_escape(v_search) || '%'
    )
    AND (
      v_query_mode IS NULL
      OR (v_query_mode = 'empty' AND enriched.query IS NULL)
      OR (v_query_mode = 'not_empty' AND enriched.query IS NOT NULL)
      OR (
        v_query_mode = 'contains'
        AND v_query_value IS NOT NULL
        AND enriched.query ILIKE '%' || seo.gsc_perf_like_escape(v_query_value) || '%'
      )
    )
    AND (
      v_page_mode IS NULL
      OR (v_page_mode = 'empty' AND enriched.top_page_path IS NULL)
      OR (v_page_mode = 'not_empty' AND enriched.top_page_path IS NOT NULL)
      OR (
        v_page_mode = 'contains'
        AND v_page_value IS NOT NULL
        AND enriched.top_page_path ILIKE '%' || seo.gsc_perf_like_escape(v_page_value) || '%'
      )
    )
    AND (v_workflow_status IS NULL OR enriched.workflow_status = ANY(v_workflow_status))
    AND (v_providers IS NULL OR enriched.provider = ANY(v_providers))
    AND (v_competitions IS NULL OR enriched.competition = ANY(v_competitions))
    AND (v_clicks_min IS NULL OR enriched.clicks >= v_clicks_min)
    AND (v_clicks_max IS NULL OR enriched.clicks <= v_clicks_max)
    AND (v_impressions_min IS NULL OR enriched.impressions >= v_impressions_min)
    AND (v_impressions_max IS NULL OR enriched.impressions <= v_impressions_max)
    AND (v_ctr_min IS NULL OR enriched.ctr >= v_ctr_min)
    AND (v_ctr_max IS NULL OR enriched.ctr <= v_ctr_max)
    AND (v_position_min IS NULL OR enriched.average_position >= v_position_min)
    AND (v_position_max IS NULL OR enriched.average_position <= v_position_max)
    AND (v_volume_min IS NULL OR enriched.search_volume >= v_volume_min)
    AND (v_volume_max IS NULL OR enriched.search_volume <= v_volume_max)
    AND (v_cpc_min IS NULL OR enriched.cpc >= v_cpc_min)
    AND (v_cpc_max IS NULL OR enriched.cpc <= v_cpc_max)
    AND (
      v_competition_index_min IS NULL
      OR enriched.competition_index >= v_competition_index_min
    )
    AND (
      v_competition_index_max IS NULL
      OR enriched.competition_index <= v_competition_index_max
    )
    AND (v_priority_min IS NULL OR enriched.priority_score >= v_priority_min)
    AND (v_priority_max IS NULL OR enriched.priority_score <= v_priority_max)
  ),
  counted AS (
    SELECT filtered.*, count(*) OVER ()::bigint AS total_count
    FROM filtered
  )
  SELECT
    counted.site_id,
    counted.organization_id,
    counted.provider,
    counted.keyword_id,
    counted.query,
    counted.first_date,
    counted.last_date,
    counted.clicks,
    counted.impressions,
    counted.ctr,
    counted.average_position,
    counted.top_page_id,
    counted.top_page_url,
    counted.top_page_path,
    counted.top_page_clicks,
    counted.top_page_impressions,
    counted.search_volume,
    counted.cpc,
    counted.competition,
    counted.competition_index,
    counted.demand_trajectory,
    counted.market_fetched_at,
    counted.workflow_status,
    counted.content_role,
    counted.competitive_position,
    counted.priority_score,
    counted.total_count
  FROM counted
  ORDER BY
    CASE WHEN p_sort = 'query' AND p_sort_dir = 'asc' THEN counted.query END ASC NULLS LAST,
    CASE WHEN p_sort = 'query' AND p_sort_dir = 'desc' THEN counted.query END DESC NULLS LAST,
    CASE WHEN p_sort = 'clicks' AND p_sort_dir = 'asc' THEN counted.clicks END ASC NULLS LAST,
    CASE WHEN p_sort = 'clicks' AND p_sort_dir = 'desc' THEN counted.clicks END DESC NULLS LAST,
    CASE WHEN p_sort = 'impressions' AND p_sort_dir = 'asc' THEN counted.impressions END ASC NULLS LAST,
    CASE WHEN p_sort = 'impressions' AND p_sort_dir = 'desc' THEN counted.impressions END DESC NULLS LAST,
    CASE WHEN p_sort = 'ctr' AND p_sort_dir = 'asc' THEN counted.ctr END ASC NULLS LAST,
    CASE WHEN p_sort = 'ctr' AND p_sort_dir = 'desc' THEN counted.ctr END DESC NULLS LAST,
    CASE WHEN p_sort = 'average_position' AND p_sort_dir = 'asc' THEN counted.average_position END ASC NULLS LAST,
    CASE WHEN p_sort = 'average_position' AND p_sort_dir = 'desc' THEN counted.average_position END DESC NULLS LAST,
    CASE WHEN p_sort = 'search_volume' AND p_sort_dir = 'asc' THEN counted.search_volume END ASC NULLS LAST,
    CASE WHEN p_sort = 'search_volume' AND p_sort_dir = 'desc' THEN counted.search_volume END DESC NULLS LAST,
    CASE WHEN p_sort = 'cpc' AND p_sort_dir = 'asc' THEN counted.cpc END ASC NULLS LAST,
    CASE WHEN p_sort = 'cpc' AND p_sort_dir = 'desc' THEN counted.cpc END DESC NULLS LAST,
    CASE WHEN p_sort = 'competition_index' AND p_sort_dir = 'asc' THEN counted.competition_index END ASC NULLS LAST,
    CASE WHEN p_sort = 'competition_index' AND p_sort_dir = 'desc' THEN counted.competition_index END DESC NULLS LAST,
    CASE WHEN p_sort = 'competition' AND p_sort_dir = 'asc' THEN counted.competition END ASC NULLS LAST,
    CASE WHEN p_sort = 'competition' AND p_sort_dir = 'desc' THEN counted.competition END DESC NULLS LAST,
    CASE WHEN p_sort = 'priority_score' AND p_sort_dir = 'asc' THEN counted.priority_score END ASC NULLS LAST,
    CASE WHEN p_sort = 'priority_score' AND p_sort_dir = 'desc' THEN counted.priority_score END DESC NULLS LAST,
    CASE WHEN p_sort = 'top_page_path' AND p_sort_dir = 'asc' THEN counted.top_page_path END ASC NULLS LAST,
    CASE WHEN p_sort = 'top_page_path' AND p_sort_dir = 'desc' THEN counted.top_page_path END DESC NULLS LAST,
    CASE WHEN p_sort = 'last_date' AND p_sort_dir = 'asc' THEN counted.last_date END ASC NULLS LAST,
    CASE WHEN p_sort = 'last_date' AND p_sort_dir = 'desc' THEN counted.last_date END DESC NULLS LAST,
    CASE WHEN p_sort = 'workflow_status' AND p_sort_dir = 'asc' THEN counted.workflow_status END ASC NULLS LAST,
    CASE WHEN p_sort = 'workflow_status' AND p_sort_dir = 'desc' THEN counted.workflow_status END DESC NULLS LAST,
    counted.impressions DESC NULLS LAST,
    counted.query ASC
  LIMIT p_limit
  OFFSET p_offset;
END;
$function$;

ALTER FUNCTION seo.site_keyword_performance_page(
  uuid, jsonb, text, text, text, integer, integer
) OWNER TO postgres;
REVOKE ALL ON FUNCTION seo.site_keyword_performance_page(
  uuid, jsonb, text, text, text, integer, integer
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION seo.site_keyword_performance_page(
  uuid, jsonb, text, text, text, integer, integer
) TO authenticated, service_role;

COMMENT ON FUNCTION seo.site_keyword_performance_page(
  uuid, jsonb, text, text, text, integer, integer
) IS
  'Bounded site keyword performance table read. Private aggregate helpers expose realistic row estimates so PostgreSQL hash/merge-joins query and strongest-page totals instead of multiplying them in a nested loop. The function chooses the newest complete provider run per profile/date, applies every table filter/sort once, and returns exact total_count in one request.';
