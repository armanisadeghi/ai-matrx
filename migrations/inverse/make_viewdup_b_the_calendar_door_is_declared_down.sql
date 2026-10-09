-- chair-step: the inverse of make_viewdup_b_the_calendar_door_is_declared.sql. It REVOKES EXECUTE on
--   custom.agg_calendar(uuid) from authenticated and deletes its platform.client_callable_door row. What it
--   undoes: Calendar is refused again with "permission denied for function agg_calendar". Nothing else changes.
-- lock: custom,platform
-- lane: MAKE-VIEWS-DEDUPE

set local lock_timeout = '2s';
set local statement_timeout = '60s';

delete from platform.client_callable_door
 where schema_name = 'custom' and function_name = 'agg_calendar'
   and declared_by = 'make_viewdup_b_the_calendar_door_is_declared.sql';

revoke execute on function custom.agg_calendar(uuid) from authenticated;
