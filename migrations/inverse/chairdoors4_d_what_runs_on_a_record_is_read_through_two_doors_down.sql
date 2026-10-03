-- chair-step: undo chairdoors4_d_what_runs_on_a_record_is_read_through_two_doors.sql - drops custom.record_triggers(uuid, uuid) and custom.record_runs(uuid, uuid, integer) with their platform.client_callable_door rows. Nothing else is touched.
-- lane: CHAIR-DOORS

delete from platform.client_callable_door
 where schema_name = 'custom' and function_name in ('record_triggers', 'record_runs')
   and declared_by = 'chairdoors4_d_what_runs_on_a_record_is_read_through_two_doors.sql';
drop function if exists custom.record_triggers(uuid, uuid);
drop function if exists custom.record_runs(uuid, uuid, integer);
