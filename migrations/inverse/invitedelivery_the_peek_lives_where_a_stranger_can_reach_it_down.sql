-- chair-step: INVERSE — removes public.table_share_peek and its door row. The custom-schema
-- original is restored by the first file's own inverse, which runs after this one.
drop function if exists public.table_share_peek(text);
delete from platform.client_callable_door
 where schema_name = 'public' and function_name = 'table_share_peek';
