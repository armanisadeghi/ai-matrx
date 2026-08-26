-- ============================================================================
-- COVERAGE WAS DEAD FOR SIX HOURS (2026-08-26)
--
-- `seo.keyword_topic.scope_tier` shipped NOT NULL with NO DEFAULT. Every writer
-- that predates the tier system — including aidream's agent placement writer,
-- the one the nightly runs on — omits the column, so every insert since the
-- migration's backfill at 05:16 UTC failed outright. Last successful placement:
-- 04:52 UTC. Placements in the six hours after: ZERO, against a queue of 63k
-- pending. Nothing screamed, because a failed insert inside a bounded pass
-- just looks like a pass that placed nothing.
--
-- The Python fix is pushed but undeployed, and a deploy is not the right place
-- for this anyway: a NOT NULL column whose value is knowable from context
-- should carry that default at the table, so a writer that has never heard of
-- tiers cannot break. THE PLATFORM DEFAULT TIER IS `system` (P30) — an agent or
-- backfill placement IS the platform's own opinion, and every human write path
-- (`seo.gsc_set_keyword_topic`) already stamps `site` explicitly.
--
-- This does not weaken the tier model: it states the rung an unattributed write
-- has always belonged to, instead of rejecting the write.
-- ============================================================================

ALTER TABLE seo.keyword_topic
  ALTER COLUMN scope_tier SET DEFAULT 'system';
