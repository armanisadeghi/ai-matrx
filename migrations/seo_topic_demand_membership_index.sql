-- Topic-demand membership index.
--
-- This is intentionally a separate migration from the function replacements in
-- `seo_topic_demand_accuracy_and_timeout.sql`: the table is hot and the index
-- must be built CONCURRENTLY, which cannot run inside the transaction used by
-- Supabase's migration runner.
--
-- The topic tree has only hundreds of active links, while a large site can have
-- millions of GSC observations.  The stats reader therefore starts from the
-- linked keywords and probes whether each belongs to the site.  This narrow,
-- partial index makes that membership test proportional to the topic links,
-- not the observation history.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_seo_sperf_site_query_keyword
  ON seo.search_performance_daily (site_id, keyword_id)
  WHERE provider = 'gsc'
    AND dimension_profile = 'query'
    AND keyword_id IS NOT NULL;
