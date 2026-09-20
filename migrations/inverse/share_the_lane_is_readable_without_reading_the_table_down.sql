-- chair-step: the inverse. Drops public.store_door_lane and its door row, which puts the share dialog's red "We couldn't check this item's public visibility" box back on every record. Rule 27 only.
delete from platform.client_callable_door d
 where d.schema_name = 'public' and d.function_name = 'store_door_lane';
drop function if exists public.store_door_lane(text, uuid);
