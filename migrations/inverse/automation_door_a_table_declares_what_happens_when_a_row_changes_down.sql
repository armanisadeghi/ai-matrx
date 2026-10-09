-- window-class: DROP TRIGGER on custom.io_outbox fires the supautils policy_grants hook (23 auth/storage/realtime relations); apply between 0100 and 0400 Pacific
-- lock: custom,platform
-- lane: AUTOMATION-DOOR
-- chair-step: the inverse of automation_door_a_table_declares_what_happens_when_a_row_changes.sql. It
-- DROPS the trigger zzzz_automations_fire_s_i on custom.io_outbox (so no automation runs any more), the
-- six doors, their helpers, and the six platform.client_callable_door rows that file added. Nothing it
-- created replaced a live body, so nothing is put back.
-- WHAT IT DOES NOT UNDO: a Table record's `automations` list stays where it was written (that
-- organization's own declaration, and reading it back needs only this file again), and every
-- automation_run record and every row an automation wrote keeps existing, with its history line.

set local lock_timeout = '2s';
set local statement_timeout = '60s';

drop trigger if exists zzzz_automations_fire_s_i on custom.io_outbox;

delete from platform.client_callable_door
 where schema_name = 'custom'
   and function_name in ('automation_declare', 'automations', 'automation_archive', 'automation_restore',
                         'automation_set_enabled', 'automation_runs');

drop function if exists custom._automation_fire();
drop function if exists custom.automation_runs(uuid, integer, timestamp with time zone, uuid);
drop function if exists custom.automation_set_enabled(uuid, uuid, boolean);
drop function if exists custom.automation_restore(uuid, uuid);
drop function if exists custom.automation_archive(uuid, uuid);
drop function if exists custom._automation_flip(uuid, uuid, text, jsonb, text);
drop function if exists custom.automations(uuid, uuid, boolean);
drop function if exists custom._automation_home(uuid, uuid);
drop function if exists custom.automation_declare(uuid, uuid, jsonb, uuid);
drop function if exists custom._automation_check(uuid, uuid, jsonb);
drop function if exists custom._automation_values_errors(uuid, uuid, uuid, jsonb, text);
drop function if exists custom._automation_value(jsonb, jsonb, uuid);
drop function if exists custom._automation_bind(jsonb, jsonb);
drop function if exists custom._automation_fields(uuid, uuid);
