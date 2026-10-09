-- chair-step: lane DRILL-FACTS — fills the derived server-only table runtime._ai_usage_execution_facts (created by drillfacts_a_the_execution_facts_table_is_row_secured.sql, applied first) with every execution of the AI usage ledger since it began, one calendar month per statement, through its one writer runtime.ai_usage_execution_facts_store, then ANALYZEs it. ONE PLAIN TRANSACTION: it can be pasted into the SQL editor as it is, or applied with `pnpm db:apply … --source campaign`. It WRITES only that derived table; it READS runtime.global_execution, chat.user_request, chat.request and ai.model_definition under ACCESS SHARE (ledger writers are never blocked; only DDL on those four tables would wait) and holds the rollup's advisory lock to COMMIT (a scheduled refresh waits behind it). Measured on the clone 2026-10-08: about 32 seconds. Re-runnable: each month is stored again (only changed executions are written).
-- lane: DRILL-FACTS
-- lock: platform
--
-- The last month is open-ended, so the fill is complete whatever day it runs. Nothing reads the table
-- until drillfacts_c_usage_is_counted_from_the_execution_facts.sql. Afterwards, outside any
-- transaction, one line sets the table's visibility map for index-only reads (optional, seconds):
--   vacuum (analyze) runtime._ai_usage_execution_facts;
-- INVERSE: migrations/inverse/drillfacts_b_the_execution_facts_are_filled_down.sql

select runtime.ai_usage_execution_facts_store('-infinity', timestamptz '2026-04-01 00:00:00+00', 'infinity');
select runtime.ai_usage_execution_facts_store(timestamptz '2026-04-01 00:00:00+00', timestamptz '2026-05-01 00:00:00+00', 'infinity');
select runtime.ai_usage_execution_facts_store(timestamptz '2026-05-01 00:00:00+00', timestamptz '2026-06-01 00:00:00+00', 'infinity');
select runtime.ai_usage_execution_facts_store(timestamptz '2026-06-01 00:00:00+00', timestamptz '2026-07-01 00:00:00+00', 'infinity');
select runtime.ai_usage_execution_facts_store(timestamptz '2026-07-01 00:00:00+00', timestamptz '2026-08-01 00:00:00+00', 'infinity');
select runtime.ai_usage_execution_facts_store(timestamptz '2026-08-01 00:00:00+00', timestamptz '2026-09-01 00:00:00+00', 'infinity');
select runtime.ai_usage_execution_facts_store(timestamptz '2026-09-01 00:00:00+00', timestamptz '2026-10-01 00:00:00+00', 'infinity');
select runtime.ai_usage_execution_facts_store(timestamptz '2026-10-01 00:00:00+00', 'infinity', 'infinity');
analyze runtime._ai_usage_execution_facts;
