-- chair-step: rule-27 inverse of association_link_sources_door.sql — removes the link-picker read door and its door row (pickers fall back to offering every kind).

set local lock_timeout = '2s';

delete from platform.client_callable_door where schema_name = 'public' and function_name = 'association_link_sources';
drop function if exists public.association_link_sources(text, text);
