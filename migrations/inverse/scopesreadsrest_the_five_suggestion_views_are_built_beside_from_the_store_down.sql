-- Inverse of scopesreadsrest_the_five_suggestion_views_are_built_beside_from_the_store.sql: the five beside views and their three lookups dropped, their door rows removed.
-- lane: SCOPES-READS-REST

drop view if exists public.v_scope_suggestions_from_store;
drop view if exists public.v_scope_suggestions_new_from_store;
drop view if exists public.v_context_item_suggestions_from_store;
drop view if exists public.v_kg_alerts_from_store;
drop view if exists public.v_kg_value_matches_from_store;
delete from platform.client_callable_door
 where schema_name = 'public' and function_name in ('_ctx_scope_type_facts', '_ctx_scope_facts', '_ctx_item_facts');
drop function if exists public._ctx_item_facts(uuid);
drop function if exists public._ctx_scope_facts(uuid);
drop function if exists public._ctx_scope_type_facts(uuid);
