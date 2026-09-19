-- chair-step: the inverse of share_a_reason_that_names_nothing.sql. It drops custom.share_subject_name and its door row; custom.share_access then falls back to platform.entity_title, which answers NULL for a custom record, so the containment reason reads "the thing that carries this" and names nothing. Rule 27 only.
delete from platform.client_callable_door d
 where d.schema_name = 'custom' and d.function_name = 'share_subject_name';
drop function if exists custom.share_access(uuid, uuid);
drop function if exists custom.share_subject_name(uuid, text, uuid);
delete from platform.client_callable_door d
 where d.schema_name = 'custom' and d.function_name = 'share_subject_name';
