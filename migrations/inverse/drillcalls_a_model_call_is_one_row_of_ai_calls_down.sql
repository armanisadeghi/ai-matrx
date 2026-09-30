-- chair-step: the inverse of migrations/campaign/drillcalls_a_model_call_is_one_row_of_ai_calls.sql (lane DRILL-CALLS) — drops the server-only view runtime._ai_calls and its registry row (token ai_calls). No row of anybody's data is touched.
-- lane: DRILL-CALLS
-- lock: platform

delete from platform.entity_types where token = 'ai_calls';
drop view if exists runtime._ai_calls;
