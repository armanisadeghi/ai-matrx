-- chair-step: INVERSE of migrations/campaign/oldreadersremoval_a_a_new_pick_list_is_born_in_the_store.sql (lane OLD-READERS-REMOVAL). Drops custom.pick_list_create: a new pick list cannot be made from a client again (public.create_user_list answers the older-tables sentence since step two's file c).
-- lane: OLD-READERS-REMOVAL

delete from platform.client_callable_door where schema_name = 'custom' and function_name = 'pick_list_create';
drop function if exists custom.pick_list_create(uuid, text, text, jsonb);
