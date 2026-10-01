-- chair-step: undo scopestreepaged_the_tree_paints_its_types_first.sql — drops the three paged scope-tree doors (custom.context_tree_types, custom.context_tree_type_scopes, custom.context_tree_search), their platform.client_callable_door rows, and the helper custom._ctx_tree_part. custom.context_tree is untouched (the file never replaced it); no table, index, policy or data row is touched.
-- lane: SCOPES-TREE-PAGED
delete from platform.client_callable_door
 where schema_name = 'custom'
   and function_name in ('context_tree_types', 'context_tree_type_scopes', 'context_tree_search')
   and declared_by = 'scopestreepaged_the_tree_paints_its_types_first.sql';
drop function if exists custom.context_tree_types(uuid[]);
drop function if exists custom.context_tree_types(uuid[], boolean);
drop function if exists custom.context_tree_type_scopes(uuid, integer, integer);
drop function if exists custom.context_tree_search(uuid[], text, integer);
drop function if exists custom._ctx_tree_part(uuid, uuid[], uuid[], text, uuid[], text, integer, integer);
