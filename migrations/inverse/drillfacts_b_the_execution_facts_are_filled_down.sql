-- chair-step: the inverse of migrations/campaign/drillfacts_b_the_execution_facts_are_filled.sql (lane DRILL-FACTS) — empties the derived server-only table runtime._ai_usage_execution_facts (the fill stores it again from the ledger). Run it only while runtime._ai_usage_calls does not read the table (before drillfacts_c_…, or after its inverse). No row of anybody's data is touched.
-- lane: DRILL-FACTS
-- lock: platform

delete from runtime._ai_usage_execution_facts;
