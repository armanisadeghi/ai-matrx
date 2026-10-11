-- chair-step: inverse of accesssetup_store_b — drops the Store Tables seat resolvers; nothing calls them before the swap.
-- lane: access-setup-store
-- lock: custom,iam

drop function if exists custom.store_seat_fallback(uuid);
drop function if exists custom.store_seat_records(uuid,uuid,jsonb);
drop function if exists custom.store_seat_holders(uuid,jsonb);
drop function if exists custom._store_seat_candidates(uuid);
drop function if exists custom.store_seat_has(uuid,uuid,jsonb);
drop function if exists custom._store_seat_field_key(uuid,uuid);
drop function if exists custom._store_seat_cell_people(jsonb);
drop function if exists custom.store_seat_invalid(jsonb);
delete from platform.client_callable_door where schema_name in ('custom','iam') and function_name in ('store_seat_invalid','_store_seat_cell_people','_store_seat_field_key','store_seat_has','_store_seat_candidates','store_seat_holders','store_seat_records','store_seat_fallback');
