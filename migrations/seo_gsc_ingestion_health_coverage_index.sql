-- GSC ingestion-health coverage index.
--
-- `seo.gsc_ingestion_health` computes MIN(date), MAX(date), and
-- COUNT(DISTINCT date) across every non-search-appearance GSC profile for one
-- site.  The general GSC read index is ordered (site_id, dimension_profile,
-- date), which cannot stream distinct dates across profiles and made this
-- lightweight health banner exceed the statement timeout on large sites.
--
-- Keep this as a separate concurrent migration: search_performance_daily is a
-- hot ingestion table and must remain writable while the index builds.
-- A canceled concurrent build leaves an invalid index with the same name, so
-- remove that recoverable artifact before retrying. The live table is large
-- enough that the database's ordinary statement timeout is not a safe bound
-- for this online maintenance operation.

SET statement_timeout = 0;

DROP INDEX CONCURRENTLY IF EXISTS seo.idx_seo_sperf_gsc_health_coverage;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_seo_sperf_gsc_health_coverage
  ON seo.search_performance_daily (site_id, date)
  WHERE provider = 'gsc'
    AND dimension_profile <> 'search_appearance';
