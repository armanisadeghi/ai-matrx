-- lock: custom,platform
-- lane: GRID-PRIMITIVES
-- chair-step: the inverse of gridprim_a_signed_in_person_may_ask_which_measures_there_are.sql.
-- It REVOKES EXECUTE on custom.agg_operations() and custom.agg_buckets() from authenticated and
-- deletes their two platform.client_callable_door rows. What it undoes: a signed-in person's
-- summary picker is refused its list again ("permission denied"). Nothing else changes.

set local lock_timeout = '2s';
set local statement_timeout = '60s';

delete from platform.client_callable_door
 where schema_name = 'custom' and function_name in ('agg_operations', 'agg_buckets')
   and declared_by = 'gridprim_a_signed_in_person_may_ask_which_measures_there_are.sql';

revoke execute on function custom.agg_operations() from authenticated;
revoke execute on function custom.agg_buckets() from authenticated;
