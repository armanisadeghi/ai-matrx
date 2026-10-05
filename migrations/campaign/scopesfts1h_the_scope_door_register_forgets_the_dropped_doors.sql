-- chair-step: the scope door register stops naming 19 functions that FTS-1b..1f dropped (the old scope RPCs and readers), so `pnpm check:scope-access-membrane` stops failing registry_has_no_stale_rows.
-- lane: FINISH-THE-SWITCH (FTS-1h, last code readers, item 2)
-- lock: context
-- window-class: none — a register delete of 19 rows; no DDL.
--
-- Inverse: migrations/inverse/scopesfts1h_the_scope_door_register_forgets_the_dropped_doors_down.sql.
--
-- THE USE CASE. An engineer adds a SECURITY DEFINER function that reads the scope store. The membrane check must tell her about
-- THAT one; today it also names 19 dead functions, so a red check reads as noise. The one remaining red,
-- context._follow_to_the_copy, goes away when the trigger file of the wave-3 window drops it — it is deliberately NOT registered
-- (a dying function gets no register row).

delete from context.scope_door_registry
 where function_name in (
  'context.provision_scope_dataset',
  'public._edu_class',
  'public.accept_context_item_suggestion',
  'public.accept_scope_suggestion',
  'public.apply_template',
  'public.apply_template_definition',
  'public.create_context_item',
  'public.create_scope',
  'public.delete_context_item',
  'public.delete_scope',
  'public.delete_scope_type',
  'public.get_entity_scopes',
  'public.get_org_structure',
  'public.get_user_scopes',
  'public.get_value_history',
  'public.set_context_value',
  'public.set_scope_context_value',
  'public.update_context_item',
  'public.update_scope'
 )
   and not exists (
     select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname || '.' || p.proname = scope_door_registry.function_name and p.prosecdef
   );
