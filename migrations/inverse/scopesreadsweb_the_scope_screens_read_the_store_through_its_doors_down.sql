-- chair-step: this removes the seven functions scopesreadsweb_the_scope_screens_read_the_store_through_its_doors.sql added (custom.context_tree, custom.context_scopes, custom.context_items, custom.context_values, custom.context_archived_types, custom.context_system_items, custom.context_class_for_checkout) with their platform.client_callable_door rows. The web readers of the scope system then fail until their commit is reverted too (revert the web first). No other object and no data row is touched.
-- lane: SCOPES-READS-WEB

drop function if exists custom.context_tree(uuid[]);
drop function if exists custom.context_scopes(uuid[]);
drop function if exists custom.context_items(uuid[]);
drop function if exists custom.context_values(uuid[]);
drop function if exists custom.context_archived_types(uuid);
drop function if exists custom.context_system_items();
drop function if exists custom.context_class_for_checkout(uuid);
delete from platform.client_callable_door
 where schema_name = 'custom'
   and function_name in ('context_tree', 'context_scopes', 'context_items', 'context_values',
                         'context_archived_types', 'context_system_items', 'context_class_for_checkout');
