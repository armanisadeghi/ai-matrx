-- Inverse of campaign/templates7_a_anyone_can_browse_the_platform_templates.sql: removes the public read door.
drop function if exists public.templates_public(jsonb);
delete from platform.client_callable_door where schema_name = 'public' and function_name = 'templates_public';
