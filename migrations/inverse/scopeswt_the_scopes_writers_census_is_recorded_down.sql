-- INVERSE of migrations/campaign/scopeswt_the_scopes_writers_census_is_recorded.sql (lane SCOPES-WRITE-THROUGH).
-- chair-step: drops the scopes writers census door and its door row. The census runs it recorded stay (history is never deleted); the fact on the switch keeps its last measurement until the switch's own inverse removes the fact.

delete from platform.client_callable_door where schema_name = 'platform' and function_name = 'cutover_scopes_census_record';
drop function if exists platform.cutover_scopes_census_record(jsonb);
