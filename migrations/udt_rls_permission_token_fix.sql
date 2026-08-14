-- CRITICAL, user-visible: /data/[id] renders
--   "Error: Unknown entity token: udt_datasets. Bare table names are not
--    permission keys."
-- instead of the table.
--
-- Nine RLS policies across the udt_* tables call
-- `has_permission('udt_datasets', ...)`. That is not a registered entity token,
-- so `has_permission_for` RAISES P0001 rather than returning false. The
-- canonical token is `dataset` (platform.entity_types → workbench.udt_datasets).
--
-- Why owners are hit too: the policies read
-- `user_id = auth.uid() OR is_public OR has_permission(...)`, and a reader
-- might assume the first branch protects them. Postgres does NOT guarantee
-- left-to-right short-circuit evaluation of OR inside a policy — the planner
-- is free to evaluate has_permission first, and it does. So the failure is not
-- limited to shared users; it can take down the owner's own read.
--
-- Companion to udt_permission_token_fix.sql, which repaired the same literal
-- inside the RPC bodies.

do $$
declare
  r record;
  v_using text;
  v_check text;
  v_sql text;
begin
  for r in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where coalesce(qual, '') like '%has_permission(''udt_datasets''%'
       or coalesce(with_check, '') like '%has_permission(''udt_datasets''%'
  loop
    v_using := replace(r.qual, 'has_permission(''udt_datasets''', 'has_permission(''dataset''');
    v_check := replace(r.with_check, 'has_permission(''udt_datasets''', 'has_permission(''dataset''');

    v_sql := format('alter policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
    if v_using is not null then
      v_sql := v_sql || format(' using (%s)', v_using);
    end if;
    if v_check is not null then
      v_sql := v_sql || format(' with check (%s)', v_check);
    end if;

    execute v_sql;
    raise notice 'repointed policy %.% / %', r.schemaname, r.tablename, r.policyname;
  end loop;
end $$;

notify pgrst, 'reload schema';
