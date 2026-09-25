-- target: branch
--
-- W4-DOOR — the inverse. Every object this lane created, removed; custom.record is left
-- exactly as it was found.

set lock_timeout = '2s';

drop trigger if exists custom_record_field_write_door on custom.record;
drop function if exists custom._field_write_door();
drop function if exists custom.read_paths_outside_the_door();
drop function if exists custom.client_write_grants();
drop function if exists custom.agent_context(uuid, uuid, integer);
drop function if exists custom.index_payload(uuid, uuid, integer);
drop function if exists custom.export_records(uuid, uuid, integer);
drop function if exists custom.read_record(uuid, uuid, boolean);
drop function if exists custom.read_records(uuid, uuid, boolean, integer, integer);
drop function if exists custom.mask_document(jsonb, text[], jsonb, boolean, jsonb);
drop function if exists custom.hidden_field_notice(custom.record, text);
delete from platform.client_callable_door where declared_by = 'W4-DOOR';
