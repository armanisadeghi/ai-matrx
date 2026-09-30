-- chair-step: the inverse of migrations/campaign/drillusage_the_ledger_is_indexed_by_when.sql (lane DRILL-USAGE-PAGE) — drops the created_at index it built, concurrently. Nothing of anybody's data is touched; every reader works without it, only slower.
-- lane: DRILL-USAGE-PAGE
-- AUTOCOMMIT FILE: DROP INDEX CONCURRENTLY cannot run inside a transaction.

drop index concurrently if exists runtime.global_execution_created_at_idx;
