-- ============================================================================
-- "RUN MY RULES" COULD NOT FINISH (2026-08-24)
--
-- The teaching loop's closing step — approve a rule change, then run your rules
-- over the corpus — calls `seo.fn_evaluate_matchers(site, NULL)`. With no
-- keyword ids the engine builds its own scope:
--     SELECT DISTINCT keyword_id FROM seo.search_performance_daily
--      WHERE site_id = $1 AND keyword_id IS NOT NULL
-- On a 14.3M-row / 10 GB fact table that was a heap scan of every row the site
-- owns: **38,271 ms measured on All Green Recycling** (112,604 keywords) against
-- the `authenticated` role's 8 s ceiling. The button shipped in the same hour
-- and would have failed the first time Arman pressed it on his biggest site —
-- and the geo reconnect hit the same wall.
--
-- The scope build only ever needs (site_id, keyword_id), so this makes it an
-- index-only scan. Built CONCURRENTLY: the table is hot and append-only from
-- nightly ingestion (CLAUDE.md — index hot tables only with CONCURRENTLY).
--
-- Measured after, same connection, same queries:
--   scope build   All Green 38,271 ms → 986 ms · Data Destruction 1,366 → 338 ms
--   the whole RPC All Green 2,813 ms · Data Destruction 5,730 ms (was: timeout)
--   index size 95 MB
--
-- ⚠️ HEADROOM IS THIN where a site has many matchers: Data Destruction's full
-- run is 5.7 s of an 8 s budget, and it grows with matcher count, not row count.
-- The next move if it tightens is to bound what the BUTTON asks for (the demand
-- window) rather than widen the ceiling — a corpus-wide re-stamp belongs to the
-- nightly, not to a click.
-- ============================================================================

-- Recorded for the ledger; created live with CONCURRENTLY outside a transaction.
CREATE INDEX CONCURRENTLY IF NOT EXISTS sperf_site_keyword_scope_idx
  ON seo.search_performance_daily (site_id, keyword_id)
  WHERE keyword_id IS NOT NULL;
