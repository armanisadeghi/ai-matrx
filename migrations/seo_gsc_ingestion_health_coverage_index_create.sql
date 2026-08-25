-- Build the GSC ingestion-health coverage index online after the recovery
-- migration has removed any invalid artifact left by a canceled prior build.
-- search_performance_daily is a hot ingestion table and must remain writable.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_seo_sperf_gsc_health_coverage
  ON seo.search_performance_daily (site_id, date)
  WHERE provider = 'gsc'
    AND dimension_profile <> 'search_appearance';
