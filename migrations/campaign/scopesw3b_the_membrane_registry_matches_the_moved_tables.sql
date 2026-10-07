-- chair-step: deletes one registry row naming a trigger function that no longer exists (dropped with the old scope tables' triggers); guarded by NOT EXISTS on pg_proc.
-- lane: FINISH-THE-SWITCH (chair, after scopes wave 3)
-- LOCKS: one row in context.scope_door_registry. No function, grant or policy changes; nothing is tightened.
--
-- After wave 3 the membrane check reads two bookkeeping gaps; this file closes one: the registry still
-- lists context.provision_scope_datasets_trigger, a trigger function dropped with the old scope tables' triggers.
-- Inverse: migrations/inverse/scopesw3b_the_membrane_registry_matches_the_moved_tables_down.sql.

delete from context.scope_door_registry
 where function_name = 'context.provision_scope_datasets_trigger'
   and not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                    where n.nspname = 'context' and p.proname = 'provision_scope_datasets_trigger');
-- NOT closed here: public._trash_store_children names 'context.context_items' only as a moved_from string label; the
-- registry's 'helper' class is limited to context._* functions, so its classification is left to the membrane owner.
