-- chair-step: this DROPs the three functions openbyid_one_address_opens_any_id.sql added — platform.resolve_id(uuid, text), custom.where_id_opens(uuid), custom._where_id_may_open(uuid, uuid, permission_level) — and deletes their two platform.client_callable_door rows. Nothing else existed before it and nothing else is touched; the /o/<id> address then says its door did not answer, in words, and every other screen is unchanged.
-- lane: ROUTE-RESOLVER

delete from platform.client_callable_door
 where (schema_name, function_name) in (('platform', 'resolve_id'), ('custom', 'where_id_opens'));

drop function if exists platform.resolve_id(uuid, text);
drop function if exists custom.where_id_opens(uuid);
drop function if exists custom._where_id_may_open(uuid, uuid, public.permission_level);
