-- CRITICAL: every user-data-table write RPC guarded on the WRONG entity token.
--
-- `has_permission('udt_datasets', ...)` does not return false for a bare table
-- name — `has_permission_for` RAISES 'Unknown entity token: udt_datasets. Bare
-- table names are not permission keys.' (P0001). The canonical token is
-- `dataset` (platform.entity_types → workbench.udt_datasets).
--
-- Owners never saw this: the `d.user_id = auth.uid()` branch is evaluated first
-- and short-circuits the OR. But a user shared into a table as EDITOR fell
-- through to the has_permission call and got a raised exception instead of
-- access — so shared editing of a data table was broken in every one of these
-- paths (add a row, read the table, change config, rename it, reorder rows).
--
-- Found while adding udt_delete_field, whose freshly-copied guard raised on the
-- first real call. Rewritten mechanically: each function body contains exactly
-- one occurrence of the literal and it is inside the guard.

do $$
declare
  r record;
  v_def text;
begin
  for r in
    select p.oid, p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and p.prosrc like '%has_permission(''udt_datasets''%'
  loop
    v_def := replace(
      pg_get_functiondef(r.oid),
      'has_permission(''udt_datasets''',
      'has_permission(''dataset'''
    );
    execute v_def;
    raise notice 'repointed % to the dataset entity token', r.proname;
  end loop;
end $$;

notify pgrst, 'reload schema';
