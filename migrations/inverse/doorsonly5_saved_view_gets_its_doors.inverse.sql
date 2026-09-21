-- chair-step: DOORS-ONLY-5 inverse -- drops the three platform.saved_view doors and their
-- register rows. Running this leaves every saved-view caller in both apps with no write path
-- at all if the refusal policy in doorsonly5_saved_view_is_never_client_written.sql is still
-- in place, so run THAT file's inverse first. Only run this to undo a closure that broke a
-- real path, and say which path.

delete from platform.client_callable_door
 where schema_name = 'public'
   and function_name in ('saved_view_save', 'saved_view_set_default', 'saved_view_archive');

drop function if exists public.saved_view_save(text, uuid, uuid, uuid, text, text, boolean, jsonb, integer, text, boolean, numeric, boolean, integer);
drop function if exists public.saved_view_set_default(text, uuid, uuid);
drop function if exists public.saved_view_archive(text, uuid, integer);
drop function if exists public._saved_view_json(platform.saved_view);
