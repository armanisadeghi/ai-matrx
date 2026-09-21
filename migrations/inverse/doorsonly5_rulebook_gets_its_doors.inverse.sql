-- chair-step: DOORS-ONLY-5 inverse — drops the five platform.rulebook doors and their register
-- rows. At the time of writing NO caller uses them (the cutover is half done, deliberately: the
-- doors exist, the base table is still open, and platform.doors_only_pending_cutover still holds
-- the rulebook row), so running this today takes nothing away from any feature. Once the callers
-- move and doorsonly5_platform_rulebook_is_never_client_written.sql lands, running this WITHOUT
-- that file's inverse first would leave every Masterwork write path with nowhere to go.

delete from platform.client_callable_door
 where schema_name = 'public'
   and function_name in ('rulebook_create', 'rulebook_save', 'rulebook_meta_set',
                         'rulebook_archive', 'rulebook_tension_settle');

drop function if exists public.rulebook_create(uuid, text, text, text, jsonb, jsonb, text, jsonb);
drop function if exists public.rulebook_save(uuid, integer, jsonb, jsonb, jsonb);
drop function if exists public.rulebook_meta_set(uuid, text, text, boolean, jsonb, text, text);
drop function if exists public.rulebook_archive(uuid);
drop function if exists public.rulebook_tension_settle(uuid, integer, text, text, text, jsonb);
drop function if exists public._rulebook_json(platform.rulebook);
drop function if exists public._rulebook_client_metadata_keys();
