-- lane: GRID-PORT
-- chair-step: the inverse of gridport_a_table_says_which_changes_can_start_an_agent.sql. It drops
-- custom.record_change_actions and its platform.client_callable_door row. The grid then no longer
-- offers "When a row changes, run an agent…" on a record-store table; schedules already made stay
-- and keep firing while G8 is in place. No row of anybody's data is touched.

set local lock_timeout = '2s';
set local statement_timeout = '60s';

drop function if exists custom.record_change_actions(uuid, uuid);
delete from platform.client_callable_door
 where schema_name = 'custom' and function_name = 'record_change_actions';
