-- RLS INITPLAN IDENTITY SWEEP — the systemic per-row identity re-evaluation
-- fix (2026-08-22, executed live via Supabase MCP; this file is the record and
-- the idempotent re-run).
--
-- TWO bug classes, one shape:
--   1. 130 policies on 68 tables (Supabase advisor `auth_rls_initplan`) called
--      auth.uid()/auth.role()/auth.jwt() BARE in USING/WITH CHECK — re-parsed
--      per row, blocking InitPlan hoisting.
--   2. 814 policies on 657 tables called OUR admin helpers bare —
--      is_platform_admin() / is_super_admin() / is_admin() — an admin-table
--      lookup PER ROW for every non-admin caller on basically every table.
--      Measured: unfiltered files.pages count for a plain user showed the bare
--      arm first in every row's filter.
--
-- FIX: wrap each call as a scalar subquery (( SELECT fn() )) — an InitPlan,
-- evaluated once per query. All five functions are STABLE and depend only on
-- session identity, so within a statement the value cannot differ between
-- rows: this is a pure plan change with identical semantics.
--
-- Applied with per-policy COMMIT + lock_timeout 2s (a single-transaction
-- version deadlocked against live traffic on chat.coding_session — do not
-- re-run this as one transaction on a live system).
-- Verification after apply: advisor-pattern count 130 -> 2 (both remaining are
-- already-wrapped jwt forms the regex misreads); admin-helper count 814 -> 2
-- (same two); app browser-verified (chat + marketing, 67 DB requests, zero
-- HTTP errors); write path proven under a real identity.

do $sweep$
declare
  r record;
  v_qual text; v_check text; v_sql text;
  fixed int := 0;
begin
  for r in
    select n.nspname as sch, c.relname as tbl, p.polname,
           pg_get_expr(p.polqual, p.polrelid) as qual,
           pg_get_expr(p.polwithcheck, p.polrelid) as withcheck
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where (pg_get_expr(p.polqual, p.polrelid) ~ '(?<!SELECT )(auth\.(uid|role|jwt)|is_platform_admin|is_super_admin|is_admin)\(\)'
        or pg_get_expr(p.polwithcheck, p.polrelid) ~ '(?<!SELECT )(auth\.(uid|role|jwt)|is_platform_admin|is_super_admin|is_admin)\(\)')
  loop
    execute 'set local lock_timeout = ''2s''';
    v_qual := r.qual; v_check := r.withcheck;
    if v_qual is not null then
      v_qual := replace(v_qual, '( SELECT auth.uid() AS uid)', '@@U@@');
      v_qual := replace(v_qual, '( SELECT auth.role() AS role)', '@@R@@');
      v_qual := replace(v_qual, '( SELECT (auth.jwt()', '@@J@@');
      v_qual := replace(v_qual, '( SELECT is_platform_admin() AS is_platform_admin)', '@@PA@@');
      v_qual := replace(v_qual, '( SELECT is_super_admin() AS is_super_admin)', '@@SA@@');
      v_qual := replace(v_qual, '( SELECT is_admin() AS is_admin)', '@@AD@@');
      v_qual := replace(v_qual, 'auth.uid()', '( SELECT auth.uid() AS uid)');
      v_qual := replace(v_qual, 'auth.role()', '( SELECT auth.role() AS role)');
      v_qual := replace(v_qual, 'auth.jwt()', '( SELECT auth.jwt() AS jwt)');
      v_qual := replace(v_qual, 'is_platform_admin()', '( SELECT is_platform_admin() AS is_platform_admin)');
      v_qual := replace(v_qual, 'is_super_admin()', '( SELECT is_super_admin() AS is_super_admin)');
      v_qual := replace(v_qual, 'is_admin()', '( SELECT is_admin() AS is_admin)');
      v_qual := replace(v_qual, '@@U@@', '( SELECT auth.uid() AS uid)');
      v_qual := replace(v_qual, '@@R@@', '( SELECT auth.role() AS role)');
      v_qual := replace(v_qual, '@@J@@', '( SELECT (auth.jwt()');
      v_qual := replace(v_qual, '@@PA@@', '( SELECT is_platform_admin() AS is_platform_admin)');
      v_qual := replace(v_qual, '@@SA@@', '( SELECT is_super_admin() AS is_super_admin)');
      v_qual := replace(v_qual, '@@AD@@', '( SELECT is_admin() AS is_admin)');
    end if;
    if v_check is not null then
      v_check := replace(v_check, '( SELECT auth.uid() AS uid)', '@@U@@');
      v_check := replace(v_check, '( SELECT auth.role() AS role)', '@@R@@');
      v_check := replace(v_check, '( SELECT (auth.jwt()', '@@J@@');
      v_check := replace(v_check, '( SELECT is_platform_admin() AS is_platform_admin)', '@@PA@@');
      v_check := replace(v_check, '( SELECT is_super_admin() AS is_super_admin)', '@@SA@@');
      v_check := replace(v_check, '( SELECT is_admin() AS is_admin)', '@@AD@@');
      v_check := replace(v_check, 'auth.uid()', '( SELECT auth.uid() AS uid)');
      v_check := replace(v_check, 'auth.role()', '( SELECT auth.role() AS role)');
      v_check := replace(v_check, 'auth.jwt()', '( SELECT auth.jwt() AS jwt)');
      v_check := replace(v_check, 'is_platform_admin()', '( SELECT is_platform_admin() AS is_platform_admin)');
      v_check := replace(v_check, 'is_super_admin()', '( SELECT is_super_admin() AS is_super_admin)');
      v_check := replace(v_check, 'is_admin()', '( SELECT is_admin() AS is_admin)');
      v_check := replace(v_check, '@@U@@', '( SELECT auth.uid() AS uid)');
      v_check := replace(v_check, '@@R@@', '( SELECT auth.role() AS role)');
      v_check := replace(v_check, '@@J@@', '( SELECT (auth.jwt()');
      v_check := replace(v_check, '@@PA@@', '( SELECT is_platform_admin() AS is_platform_admin)');
      v_check := replace(v_check, '@@SA@@', '( SELECT is_super_admin() AS is_super_admin)');
      v_check := replace(v_check, '@@AD@@', '( SELECT is_admin() AS is_admin)');
    end if;
    v_sql := format('alter policy %I on %I.%I', r.polname, r.sch, r.tbl);
    if v_qual is not null then v_sql := v_sql || format(' using (%s)', v_qual); end if;
    if v_check is not null then v_sql := v_sql || format(' with check (%s)', v_check); end if;
    begin
      execute v_sql;
      fixed := fixed + 1;
    exception when others then
      raise warning 'skipped %.%/%: %', r.sch, r.tbl, r.polname, SQLERRM;
    end;
    commit;
  end loop;
  raise notice 'policies rewritten: %', fixed;
end
$sweep$;
