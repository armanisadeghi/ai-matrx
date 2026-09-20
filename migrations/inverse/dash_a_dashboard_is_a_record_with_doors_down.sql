-- chair-step: the inverse of dash_a_dashboard_is_a_record_with_doors.sql. It DROPS the eight
-- functions that file created and deletes their platform.client_callable_door rows. It does
-- NOT delete any dashboard record an organization made: a dashboard is a custom.record, and
-- destroying customers' rows is never part of taking a door away. Those records become
-- unreachable through any door until the file is applied again, which is the honest state —
-- the data is still there and History still has it.
-- lane: DASHBOARDS

drop function if exists custom.dashboard_run(uuid, uuid, jsonb);
drop function if exists custom.dashboard_delete(uuid, uuid);
drop function if exists custom.dashboard_stuck(uuid, uuid, text, integer, jsonb, integer, text);
drop function if exists custom.dashboards(uuid, uuid);
drop function if exists custom.dashboard_declare(uuid, uuid, text, jsonb, jsonb, uuid);
drop function if exists custom.dashboard_block_normalize(uuid, uuid, jsonb);
drop function if exists custom.dashboard_field_keys(uuid, uuid);
drop function if exists custom.dashboard_class();
drop function if exists custom.dashboard_kinds();

delete from platform.client_callable_door
 where schema_name = 'custom'
   and declared_by = 'dash_a_dashboard_is_a_record_with_doors.sql';
