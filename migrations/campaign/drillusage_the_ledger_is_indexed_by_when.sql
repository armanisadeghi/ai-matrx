-- chair-step: lane DRILL-USAGE-PAGE — adds one plain btree index on runtime.global_execution (created_at), built CONCURRENTLY, so no write on the ledger ever waits for it. Its only DROP is 'drop index concurrently if exists' of this same name, so a rerun rebuilds an INVALID leftover of a cancelled build instead of skipping it; no data is touched.
-- lane: DRILL-USAGE-PAGE
-- AUTOCOMMIT FILE: CREATE INDEX CONCURRENTLY cannot run inside a transaction; apply statement by statement.
--
-- DRILL-USAGE-PAGE — THE AI USAGE LEDGER IS FOUND BY WHEN, WITHOUT READING ALL OF IT.
--
-- runtime.global_execution (≈289k rows, ≈174k in the last 30 days) had only PARTIAL indexes on
-- created_at, so every window over it — public.admin_spend_breakdown's fact set, and now
-- runtime.ai_usage_hourly_refresh rebuilding the last hours of the usage rollup — was a
-- sequential scan of the whole ledger (197 ms for a 30-day daily sum, measured 2026-09-29,
-- DRILL-DOWN-DESIGN §f.1). A plain btree on created_at turns each into a range scan.
--
-- INVERSE: migrations/inverse/drillusage_the_ledger_is_indexed_by_when_down.sql

drop index concurrently if exists runtime.global_execution_created_at_idx;
create index concurrently global_execution_created_at_idx
  on runtime.global_execution (created_at);

do $check$
begin
  if not exists (
    select 1 from pg_catalog.pg_class c join pg_catalog.pg_index i on i.indexrelid = c.oid
     where c.relname = 'global_execution_created_at_idx' and c.relnamespace = 'runtime'::regnamespace
       and i.indisvalid and i.indisready) then
    raise exception 'drillusage: runtime.global_execution_created_at_idx is not valid — re-run the file';
  end if;
end
$check$;
