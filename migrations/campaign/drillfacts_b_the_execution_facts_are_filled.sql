-- draft: DRILL-FACTS rehearsal on the clone not finished
-- chair-step: lane DRILL-FACTS — fills the derived server-only table runtime._ai_usage_execution_facts (created by drillfacts_a_the_execution_facts_table_is_row_secured.sql, applied first) with every execution of the AI usage ledger since it began, one calendar month per statement, through its one writer runtime.ai_usage_execution_facts_store. It WRITES only that derived table; it READS runtime.global_execution, chat.user_request, chat.request and ai.model_definition under ACCESS SHARE, one month at a time. AUTOCOMMIT FILE (its last statement is a VACUUM): apply it from aidream (`uv run python db/apply_migrations.py --source campaign --only drillfacts_b_the_execution_facts_are_filled.sql --target clone|production --lane DRILL-FACTS --no-generate`), which commits each statement on its own, so no lock and no advisory wait outlives one month. Re-runnable: each month is stored again (only changed executions are written).
-- lane: DRILL-FACTS
-- lock: platform
--
-- Each statement takes the rollup's advisory lock (inside the writer), so it waits behind a scheduled
-- rebuild instead of racing it. The last month is open-ended, so the fill is complete whatever day it
-- runs. Nothing reads the table until drillfacts_c_usage_is_counted_from_the_execution_facts.sql.
-- INVERSE: migrations/inverse/drillfacts_b_the_execution_facts_are_filled_down.sql

select runtime.ai_usage_execution_facts_store('-infinity', timestamptz '2026-04-01 00:00:00+00', 'infinity');
select runtime.ai_usage_execution_facts_store(timestamptz '2026-04-01 00:00:00+00', timestamptz '2026-05-01 00:00:00+00', 'infinity');
select runtime.ai_usage_execution_facts_store(timestamptz '2026-05-01 00:00:00+00', timestamptz '2026-06-01 00:00:00+00', 'infinity');
select runtime.ai_usage_execution_facts_store(timestamptz '2026-06-01 00:00:00+00', timestamptz '2026-07-01 00:00:00+00', 'infinity');
select runtime.ai_usage_execution_facts_store(timestamptz '2026-07-01 00:00:00+00', timestamptz '2026-08-01 00:00:00+00', 'infinity');
select runtime.ai_usage_execution_facts_store(timestamptz '2026-08-01 00:00:00+00', timestamptz '2026-09-01 00:00:00+00', 'infinity');
select runtime.ai_usage_execution_facts_store(timestamptz '2026-09-01 00:00:00+00', timestamptz '2026-10-01 00:00:00+00', 'infinity');
select runtime.ai_usage_execution_facts_store(timestamptz '2026-10-01 00:00:00+00', 'infinity', 'infinity');
vacuum (analyze) runtime._ai_usage_execution_facts;
