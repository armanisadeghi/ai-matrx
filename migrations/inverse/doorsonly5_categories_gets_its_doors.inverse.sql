-- chair-step: DOORS-ONLY-5 inverse — drops public.cat_write and public.cat_archive and their
-- register rows. Once the sixteen host call sites have moved and
-- doorsonly5_platform_categories_is_never_client_written.sql has landed, running this WITHOUT
-- that file's inverse first leaves every categories write in the app with nowhere to go. The
-- four package doors (cat_create, cat_update, cat_reparent, cat_delete) are NOT touched by
-- either file — they are the demanded RPC surface of @ai-matrx/associations and were never
-- this lane's to change.

delete from platform.client_callable_door
 where schema_name = 'public' and function_name in ('cat_write', 'cat_archive');

drop function if exists public.cat_write(text, uuid, uuid, text, text, boolean, uuid, boolean, text, boolean, text, boolean, integer, boolean, text, boolean, jsonb, boolean);
drop function if exists public.cat_archive(text, uuid);
drop function if exists public._category_json(platform.categories);
