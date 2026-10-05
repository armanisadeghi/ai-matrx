-- draft: FTS-1b, removed after rule 27 on the clone
-- chair-step: it DROPS seven SECURITY DEFINER functions that read the old context.* scope tables and that nothing calls: public.get_entity_scopes, get_org_structure, get_user_scopes, get_value_history, public._edu_class, public.accept_context_item_suggestion and public.accept_scope_suggestion. Census 2026-10-05 on production: no function body, trigger, view, policy or cron job names any of them; pg_stat_statements shows 0 calls since 2026-10-03 22:34Z; no product code in aidream, matrx-frontend, matrx-local or matrx-extend calls them (accept_scope_suggestion is only named in an eslint comment). The inverse recreates each body, owner and EXECUTE grant exactly as production held them. Their four platform.client_callable_door rows go with them (a door follows its function); the inverse puts them back exactly.
-- lane: FINISH-THE-SWITCH (FTS-1b, wave 2 bodies of SCOPES-ON-THE-STORE)
-- lock: custom,platform
--
-- Inverse: migrations/inverse/scopesw2b_seven_old_scope_readers_nobody_calls_are_gone_down.sql.
--
-- THE USE CASE. When Cedar Ridge Physical Therapy's scopes stop living in the old tables, these seven leftovers go
-- rather than wait to fail.

drop function public.get_entity_scopes(text, uuid);
drop function public.get_org_structure(uuid);
drop function public.get_user_scopes(uuid);
drop function public.get_value_history(uuid, uuid, integer);
drop function public._edu_class(uuid);
drop function public.accept_context_item_suggestion(uuid);
drop function public.accept_scope_suggestion(uuid, uuid);

-- A door follows its function.
delete from platform.client_callable_door where schema_name='public' and function_name in ('get_entity_scopes','get_org_structure','get_user_scopes','get_value_history','_edu_class','accept_context_item_suggestion','accept_scope_suggestion');
