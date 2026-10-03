-- chair-step: the inverse of scopesc_the_scope_tree_asks_who_may_see_what_once_for_every_organization.sql: it DROPS the one door that file created, public.get_scope_trees(uuid[], uuid), and its declared client-door row. Nothing else existed before it; the server's batched scope reader must be back on public.get_scope_tree first (matrx_records ScopeReader._per_organization).
-- lane: SCOPES-ON-THE-STORE
-- lock: custom
DROP FUNCTION IF EXISTS public.get_scope_trees(uuid[], uuid);
delete from platform.client_callable_door where schema_name = 'public' and function_name = 'get_scope_trees' and identity_args = 'p_org_ids uuid[], p_type_id uuid';
