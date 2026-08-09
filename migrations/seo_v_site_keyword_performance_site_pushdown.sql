-- seo.v_site_keyword_performance — make the per-site filter push down.
--
-- Defect (2026-08-09): every read of this view 500'd with
-- `57014 canceling statement due to statement timeout`. The `authenticated`
-- role has statement_timeout=8s; the view took ~12s for ANY site.
--
-- Cause: `latest_observations` is referenced twice, so Postgres MATERIALIZED
-- it. A materialized CTE is an optimization fence — the caller's
-- `site_id = <one site>` qual could not be pushed inside it, so every read
-- ranked ALL sites' observations for the last 28 days first (1.14M rows,
-- a 472 MB external merge sort) and only then filtered down to one site.
--
-- Fix: `NOT MATERIALIZED`. The CTE is inlined into both references, so the
-- site_id qual reaches the base scan. It is safe to push a qual below the
-- window function because `site_id` is one of the PARTITION BY columns —
-- freshness_rank is computed within a single site, so filtering before or
-- after the window yields identical rows.
--
-- Measured on site 38eff4c9 (4,232 result rows): 11,954 ms -> 1,152 ms, and
-- the base scans go from a full 1.14M-row index scan to site-scoped index
-- conditions on idx_seo_sperf_site_query_window (51k + 89k rows).
--
-- Column list, order, ownership, security_invoker and grants are unchanged;
-- this is purely a plan-shape fix.

CREATE OR REPLACE VIEW seo.v_site_keyword_performance
WITH (security_invoker = true) AS
WITH latest_observations AS NOT MATERIALIZED (
  SELECT
    ranked.id,
    ranked.organization_id,
    ranked.created_by,
    ranked.run_id,
    ranked.raw_payload_id,
    ranked.provider,
    ranked.dedup_key,
    ranked.site_id,
    ranked.page_id,
    ranked.keyword_id,
    ranked.date,
    ranked.query,
    ranked.country,
    ranked.device,
    ranked.dimension_profile,
    ranked.search_appearance,
    ranked.clicks,
    ranked.impressions,
    ranked.ctr,
    ranked.average_position,
    ranked.extras,
    ranked.created_at,
    ranked.freshness_rank
  FROM (
    SELECT
      observation.id,
      observation.organization_id,
      observation.created_by,
      observation.run_id,
      observation.raw_payload_id,
      observation.provider,
      observation.dedup_key,
      observation.site_id,
      observation.page_id,
      observation.keyword_id,
      observation.date,
      observation.query,
      observation.country,
      observation.device,
      observation.dimension_profile,
      observation.search_appearance,
      observation.clicks,
      observation.impressions,
      observation.ctr,
      observation.average_position,
      observation.extras,
      observation.created_at,
      row_number() OVER (
        PARTITION BY observation.organization_id, observation.provider,
                     observation.site_id, observation.date,
                     observation.dimension_profile, observation.keyword_id,
                     observation.query, observation.page_id,
                     observation.country, observation.device,
                     observation.search_appearance
        ORDER BY observation.created_at DESC, observation.id DESC
      ) AS freshness_rank
    FROM seo.search_performance_daily observation
    WHERE observation.date >= (CURRENT_DATE - 27)
  ) ranked
  WHERE ranked.freshness_rank = 1
), query_totals AS (
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
        THEN sum(observation.clicks)::numeric / sum(observation.impressions)::numeric
      ELSE NULL::numeric
    END AS ctr,
    CASE
      WHEN sum(observation.impressions) > 0
        THEN sum(observation.average_position * observation.impressions::numeric)
             / sum(observation.impressions)::numeric
      ELSE avg(observation.average_position)
    END AS average_position
  FROM latest_observations observation
  WHERE observation.dimension_profile = 'query'::text
    AND observation.query IS NOT NULL
  GROUP BY observation.site_id, observation.organization_id, observation.provider,
           observation.keyword_id, observation.query
), page_totals AS (
  SELECT
    observation.site_id,
    observation.provider,
    observation.keyword_id,
    observation.query,
    observation.page_id,
    sum(observation.clicks) AS clicks,
    sum(observation.impressions) AS impressions,
    row_number() OVER (
      PARTITION BY observation.site_id, observation.provider,
                   observation.keyword_id, observation.query
      ORDER BY (sum(observation.clicks)) DESC,
               (sum(observation.impressions)) DESC,
               observation.page_id
    ) AS page_rank
  FROM latest_observations observation
  WHERE observation.dimension_profile = 'query_page'::text
    AND observation.query IS NOT NULL
    AND observation.page_id IS NOT NULL
  GROUP BY observation.site_id, observation.provider, observation.keyword_id,
           observation.query, observation.page_id
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
   AND NOT pages.keyword_id IS DISTINCT FROM totals.keyword_id
   AND pages.query = totals.query
   AND pages.page_rank = 1
  LEFT JOIN web.page page
    ON page.id = pages.page_id AND page.deleted_at IS NULL
  LEFT JOIN seo.keyword_market market
    ON market.keyword_id = totals.keyword_id
   AND market.location_code = 2840
   AND market.deleted_at IS NULL
  LEFT JOIN seo.site_keyword_value site_value
    ON site_value.site_id = totals.site_id
   AND site_value.keyword_id = totals.keyword_id
   AND site_value.deleted_at IS NULL;
