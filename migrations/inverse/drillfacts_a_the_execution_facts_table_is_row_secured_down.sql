-- chair-step: the inverse of migrations/campaign/drillfacts_a_the_execution_facts_table_is_row_secured.sql (lane DRILL-FACTS) — drops the derived server-only table runtime._ai_usage_execution_facts (rebuilt from the ledger by the next fill), its registry row, its one writer runtime.ai_usage_execution_facts_store, and the view runtime._ai_usage_calls_live. Run it AFTER the inverse of drillfacts_c_usage_is_counted_from_the_execution_facts.sql (whose refresh and view read both). No row of anybody's data is touched.
-- lane: DRILL-FACTS
-- lock: platform

delete from platform.entity_types where token = 'ai_usage_execution_facts';
drop table if exists runtime._ai_usage_execution_facts;
drop function if exists runtime.ai_usage_execution_facts_store(timestamptz, timestamptz, timestamptz);
drop view if exists runtime._ai_usage_calls_live;
