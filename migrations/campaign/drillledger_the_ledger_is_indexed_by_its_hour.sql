-- chair-step: lane DRILL-LEDGER-RECORDS — adds one btree index on runtime.global_execution over its UTC hour (date_trunc('hour', created_at, 'UTC'), an IMMUTABLE expression), built CONCURRENTLY, so no write on the ledger ever waits for it. Its only DROP is 'drop index concurrently if exists' of this same name, so a rerun rebuilds an INVALID leftover of a cancelled build instead of skipping it; no data is touched.
-- lane: DRILL-LEDGER-RECORDS
-- AUTOCOMMIT FILE: CREATE INDEX CONCURRENTLY cannot run inside a transaction; apply statement by statement.
--
-- DRILL-LEDGER-RECORDS — THE RECORDS BEHIND A USAGE NUMBER ARE FOUND BY THEIR HOUR.
--
-- The records of the declared drill definition ai_usage are rows of runtime._ai_usage_calls, and a
-- usage question's window is on the rollup's `bucket` (the UTC hour) — the same column name on the
-- view, so ONE filter compiler serves the number and its records and they agree at any window,
-- aligned or not (PROGRESS-DRILL-FINISH decision 14). On the view that predicate is
-- date_trunc('hour', created_at, 'UTC') >= … — which the plain created_at index cannot answer, so
-- every records read was a scan of the whole ledger. This index answers it, and reads a page of the
-- newest records in index order (EXPLAIN on the clone: PROGRESS-DRILL-LEDGER-RECORDS.md).
--
-- INVERSE: migrations/inverse/drillledger_the_ledger_is_indexed_by_its_hour_down.sql

drop index concurrently if exists runtime.global_execution_hour_idx;
create index concurrently global_execution_hour_idx
  on runtime.global_execution (date_trunc('hour', created_at, 'UTC'));

do $check$
begin
  if not exists (
    select 1 from pg_catalog.pg_class c join pg_catalog.pg_index i on i.indexrelid = c.oid
     where c.relname = 'global_execution_hour_idx' and c.relnamespace = 'runtime'::regnamespace
       and i.indisvalid and i.indisready) then
    raise exception 'drillledger: runtime.global_execution_hour_idx is not valid — re-run the file';
  end if;
end
$check$;
