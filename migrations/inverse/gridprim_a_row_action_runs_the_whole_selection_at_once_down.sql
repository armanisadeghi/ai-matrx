-- lock: custom,platform
-- lane: GRID-PRIMITIVES
-- chair-step: the inverse of gridprim_a_row_action_runs_the_whole_selection_at_once.sql. It DROPS
-- the five functions that file created, deletes their three platform.client_callable_door rows
-- and the three knob rows it added. Nothing it created replaced a live body, so nothing is put
-- back.
-- WHAT IT DOES NOT UNDO: a Table record's `row_actions` key stays where it was written — it is
-- that organization's own declaration — and every record an action changed keeps its change and
-- its history line (the writes were ordinary custom.record_update writes).

set local lock_timeout = '5s';
set local statement_timeout = '60s';

drop function if exists custom.action_run(uuid, uuid, uuid[]);
drop function if exists custom.row_actions(uuid, uuid);
drop function if exists custom.action_declare(uuid, uuid, jsonb);
drop function if exists custom._action_check(uuid, uuid, jsonb);
drop function if exists custom._action_coerce(jsonb, jsonb);

delete from platform.client_callable_door
 where schema_name = 'custom'
   and declared_by = 'gridprim_a_row_action_runs_the_whole_selection_at_once.sql';

delete from platform.feature_knob
 where feature = 'custom' and key in ('row_actions_max', 'row_action_steps_max', 'action_run_records_max');
