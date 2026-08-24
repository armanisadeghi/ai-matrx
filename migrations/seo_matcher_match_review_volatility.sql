-- CORRECTION to `seo_matcher_match_review_narrow_first.sql`, same session.
--
-- That rewrite narrows through TEMP TABLES, and the function was still marked
-- STABLE. PostgREST runs a STABLE function inside a READ ONLY transaction, and
-- `CREATE TEMP TABLE` cannot run there — so every call from the browser would
-- have failed with "cannot execute CREATE TABLE in a read-only transaction"
-- while the same SQL ran fine for a superuser in the SQL editor.
--
-- Marked VOLATILE so PostgREST opens a read-write transaction. The function
-- still only READS the model: its two temp tables are scratch space that lives
-- and dies inside the call (`ON COMMIT DROP`), and nothing here writes a single
-- row of `keyword_facet`, `dimension_value_matcher`, or `categories`. Volatility
-- is a statement about the planner's freedom to cache, not a permission.

ALTER FUNCTION seo.matcher_match_review(uuid, uuid, integer) VOLATILE;
