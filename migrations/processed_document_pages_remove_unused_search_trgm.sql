-- The authenticated RLS plan cannot use the ILIKE index: retaining it adds
-- 148 MB and ingestion cost without improving the dashboard request.
DROP INDEX CONCURRENTLY IF EXISTS docproc.processed_document_pages_global_search_trgm;
-- chair-step: Remove only the ineffective index created by this rollout; authenticated RLS scans cannot use it.
