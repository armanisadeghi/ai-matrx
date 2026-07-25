-- Canonical lifetime counts for the research orchestra.
--
-- The live UI refreshes this lightweight RPC after every durable stream
-- completion. Counts must therefore describe the CURRENT pipeline state,
-- not every historical version ever written.
--
-- Idempotent: CREATE OR REPLACE only.

CREATE OR REPLACE FUNCTION public.get_topic_overview(p_topic_id uuid)
RETURNS json
LANGUAGE sql
STABLE
AS $function$
  WITH latest_page_analyses AS (
    SELECT DISTINCT ON (source_id)
      source_id,
      status
    FROM research.rs_analysis
    WHERE topic_id = p_topic_id
      AND agent_type = 'page_summary'
    ORDER BY
      source_id,
      updated_at DESC,
      created_at DESC NULLS LAST,
      id DESC
  ),
  analysis_counts AS (
    SELECT
      count(*) AS total,
      count(*) FILTER (WHERE status = 'failed') AS failed
    FROM latest_page_analyses
  ),
  source_counts AS (
    SELECT
      count(*) AS total,
      count(*) FILTER (WHERE is_included = true) AS included
    FROM research.rs_source
    WHERE topic_id = p_topic_id
  ),
  sources_by_status AS (
    SELECT coalesce(json_object_agg(scrape_status, count), '{}'::json) AS counts
    FROM (
      SELECT scrape_status, count(*) AS count
      FROM research.rs_source
      WHERE topic_id = p_topic_id
      GROUP BY scrape_status
    ) grouped
  )
  SELECT json_build_object(
    'total_keywords',
      (SELECT count(*) FROM research.rs_keyword WHERE topic_id = p_topic_id),
    'stale_keywords',
      (SELECT count(*) FROM research.rs_keyword WHERE topic_id = p_topic_id AND is_stale = true),
    'total_sources',
      (SELECT total FROM source_counts),
    'included_sources',
      (SELECT included FROM source_counts),
    'sources_by_status',
      (SELECT counts FROM sources_by_status),
    'total_content',
      (SELECT count(*) FROM research.rs_content WHERE topic_id = p_topic_id AND is_current = true),
    'total_analyses',
      (SELECT total FROM analysis_counts),
    'total_eligible_for_analysis',
      (SELECT count(*) FROM research.rs_content
       WHERE topic_id = p_topic_id AND is_good_scrape = true AND is_current = true),
    'failed_analyses',
      (SELECT failed FROM analysis_counts),
    'keyword_syntheses',
      (SELECT count(*) FROM research.rs_synthesis
       WHERE topic_id = p_topic_id AND scope = 'keyword' AND is_current = true),
    'failed_keyword_syntheses',
      (SELECT count(*) FROM research.rs_synthesis
       WHERE topic_id = p_topic_id AND scope = 'keyword'
         AND is_current = true AND status = 'failed'),
    'topic_syntheses',
      (SELECT count(*) FROM research.rs_synthesis
       WHERE topic_id = p_topic_id AND scope IN ('topic', 'project') AND is_current = true),
    'failed_topic_syntheses',
      (SELECT count(*) FROM research.rs_synthesis
       WHERE topic_id = p_topic_id AND scope IN ('topic', 'project')
         AND is_current = true AND status = 'failed'),
    -- Compatibility aliases for older non-frontend consumers.
    'project_syntheses',
      (SELECT count(*) FROM research.rs_synthesis
       WHERE topic_id = p_topic_id AND scope IN ('topic', 'project') AND is_current = true),
    'failed_project_syntheses',
      (SELECT count(*) FROM research.rs_synthesis
       WHERE topic_id = p_topic_id AND scope IN ('topic', 'project')
         AND is_current = true AND status = 'failed'),
    'total_tags',
      (SELECT count(*) FROM research.rs_tag WHERE topic_id = p_topic_id),
    'total_documents',
      (SELECT count(*) FROM research.rs_document WHERE topic_id = p_topic_id)
  );
$function$;
