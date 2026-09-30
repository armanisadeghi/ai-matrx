-- chair-step: the inverse of migrations/campaign/drillledger_the_ledger_is_indexed_by_its_hour.sql (lane DRILL-LEDGER-RECORDS) — drops the hour index it built, concurrently. Nothing of anybody's data is touched; every reader works without it, only slower.
-- lane: DRILL-LEDGER-RECORDS
-- AUTOCOMMIT FILE: DROP INDEX CONCURRENTLY cannot run inside a transaction.

drop index concurrently if exists runtime.global_execution_hour_idx;
