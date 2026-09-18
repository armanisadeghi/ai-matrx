-- dd218b_org_plan_walls_match_their_128_siblings — THE THREE WALLS GET THE ROLE THEY MEANT
-- (Found by B-110 while clearing DD-218's gate. SECURITY. db-rules §0/§6d/§9. POLICIES ONLY.)
--
-- ═══ WHAT IS RED ═══════════════════════════════════════════════════════════════════════════════
-- `pnpm check:anon-write-surface`, 2026-09-14, three FAILs and nothing else on the database:
--
--   FAIL billing.org_plan :: platform_admin_delete_only  (polcmd 'd' reaches PUBLIC, undeclared)
--   FAIL billing.org_plan :: platform_admin_insert_only  (polcmd 'a' reaches PUBLIC, undeclared)
--   FAIL billing.org_plan :: platform_admin_update_only  (polcmd 'w' reaches PUBLIC, undeclared)
--
-- They were created hours earlier by `dd214b_the_member_read_clears_the_wall_and_plan_status_keeps_
-- its_key.sql`, whose own comment says what it was copying:
--
--   "the identical predicate, the shape billing.usage_ledger and rag.retrieval_audit already
--    carry (B-57, DD-163/DD-174)"
--
-- It copied the predicate and the command scoping. It did not copy the ROLE. Census of that exact
-- policy trio across this database, 2026-09-14:
--
--   TO authenticated : 128 relations   ← the shape DD-163/DD-174 established
--   TO public        :   3             ← billing.org_plan, and nothing else
--
-- ═══ WHY THIS IS A ROLE FIX AND NOT A LOOSENING ════════════════════════════════════════════════
-- These are RESTRICTIVE policies: they can only narrow, never grant. Dropping `public` from their
-- role list cannot open a write path, and on this relation there is provably none to open:
--
--   * `anon` holds ZERO privileges of any kind on billing.org_plan (measured: no table grant, and
--     0 of its columns answer has_column_privilege), so no signed-out statement can reach it at all;
--   * every PERMISSIVE policy on the relation is already TO authenticated, and RLS denies by
--     default — a role with no permissive policy reads and writes nothing whatever the walls say;
--   * `service_role` and `postgres` carry rolbypassrls, so neither the old wall nor the new one
--     was ever evaluated for them.
--
-- What changes is that the anon write surface stops carrying three undeclared PUBLIC write policies,
-- which is the thing the guard exists to refuse. The wall over `authenticated` — the only role that
-- can reach this table through PostgREST — is byte-for-byte the same predicate it was before.

SELECT iam.supersede_bespoke_policies(
  'billing', 'org_plan',
  array['platform_admin_insert_only','platform_admin_update_only','platform_admin_delete_only'],
  'B-110/DD-218: DD-214b created these three RESTRICTIVE command-scoped walls TO public while the 128 relations carrying the identical trio carry it TO authenticated, and check:anon-write-surface refuses an undeclared write-capable policy that reaches every role. Re-created in this same migration with the identical predicate and the sibling role.');

CREATE POLICY platform_admin_insert_only ON billing.org_plan
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_platform_admin()));

CREATE POLICY platform_admin_update_only ON billing.org_plan
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING ((SELECT public.is_platform_admin()))
  WITH CHECK ((SELECT public.is_platform_admin()));

CREATE POLICY platform_admin_delete_only ON billing.org_plan
  AS RESTRICTIVE FOR DELETE TO authenticated
  USING ((SELECT public.is_platform_admin()));

do $$
declare
  v_public int; v_auth int; v_perm int; v_anon_cols int;
begin
  select count(*) into v_public from pg_policy
   where polrelid = 'billing.org_plan'::regclass and 0 = any(polroles);
  if v_public <> 0 then
    raise exception 'dd218b: % policy(ies) on billing.org_plan still reach PUBLIC.', v_public;
  end if;

  select count(*) into v_auth from pg_policy p
   where p.polrelid = 'billing.org_plan'::regclass and not p.polpermissive
     and p.polname in ('platform_admin_insert_only','platform_admin_update_only','platform_admin_delete_only')
     and (select rolname from pg_roles where oid = p.polroles[1]) = 'authenticated';
  if v_auth <> 3 then
    raise exception 'dd218b: expected the three RESTRICTIVE walls TO authenticated, found %. The wall '
                    'must never be weaker than DD-214b left it.', v_auth;
  end if;

  -- DD-214's member read, the thing dd214b existed to rescue, must still be here.
  select count(*) into v_perm from pg_policy
   where polrelid = 'billing.org_plan'::regclass and polpermissive
     and polname = 'org_plan_member_read';
  if v_perm <> 1 then
    raise exception 'dd218b: DD-214 member read org_plan_member_read is gone. This file may not cost '
                    'an organization the sight of its own plan.';
  end if;

  select count(*) into v_anon_cols from pg_attribute a
   where a.attrelid = 'billing.org_plan'::regclass and a.attnum > 0 and not a.attisdropped
     and has_column_privilege('anon', a.attrelid, a.attnum, 'SELECT');
  if v_anon_cols <> 0 or has_table_privilege('anon','billing.org_plan'::regclass,'SELECT')
     or has_table_privilege('anon','billing.org_plan'::regclass,'INSERT')
     or has_table_privilege('anon','billing.org_plan'::regclass,'UPDATE')
     or has_table_privilege('anon','billing.org_plan'::regclass,'DELETE') then
    raise exception 'dd218b: anon holds a privilege on billing.org_plan (% readable column(s)). The '
                    'argument that narrowing a RESTRICTIVE wall costs nothing depends on it holding '
                    'none.', v_anon_cols;
  end if;
end $$;
