-- chair-step: HR-360-REC inverse — drops the two functions and their door rows. Replaces no body; files already under a notes row keep their parent.
delete from platform.client_callable_door where schema_name = 'communication' and function_name in ('meet_link_capture_to_notes', 'meet_attach_capture_file');
drop function if exists communication.meet_link_capture_to_notes(uuid, uuid);
drop function if exists communication.meet_attach_capture_file(uuid, uuid);
