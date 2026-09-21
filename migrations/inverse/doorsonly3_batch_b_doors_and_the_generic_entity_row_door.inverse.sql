-- chair-step: DOORS-ONLY-3 inverse -- REMOVES the six batch B doors and their
-- platform.client_callable_door rows. Run this ONLY together with the inverses of the three
-- batch B refusal files, and only after the callers have been moved back to the base tables.
-- On its own it takes away: the organization edit screen's only write path, the auto-RAG
-- preference toggles, every flexible_data write, AND the reference picker's generic
-- "create a new one" for all 650 tokens -- which after this campaign is the only path that
-- still works on every table it closed. Say which path broke.

delete from platform.client_callable_door
 where schema_name = 'public'
   and function_name in ('entity_row_create', 'entity_row_rename', 'org_update',
                         'org_preferences_set', 'flexible_data_write', 'flexible_data_archive');

drop function if exists public.entity_row_create(text, text, uuid);
drop function if exists public.entity_row_rename(text, uuid, text);
drop function if exists public.org_update(uuid, jsonb);
drop function if exists public.org_preferences_set(uuid, jsonb);
drop function if exists public.flexible_data_write(uuid, jsonb, uuid);
drop function if exists public.flexible_data_archive(uuid, uuid);
