-- dd193_iam_organizations_write_policies_scoped — THE TWO PUBLIC-ROLE WRITE POLICIES ON ORGANIZATIONS
-- (DD-193. SECURITY P0. db-rules §0/§6d/§9. DD-147's supersede path: both names are dropped through
--  `iam.supersede_bespoke_policies` with a recorded reason and re-created identically, scoped to the
--  role that actually uses them. Neither name is one `iam.apply_rls` authors.)
--
-- ═══ WHAT WAS MEASURED, ON THIS DATABASE, 2026-09-13 ═══════════════════════════════════════════
-- `iam.organizations` carries six policies. Four name a role — `org_insert_policy`,
-- `org_select_policy`, `platform_admin_all`, `platform_admin_insert_only`, all `TO authenticated`.
-- Two do not: `org_update_policy` and `org_delete_policy` were created `TO PUBLIC` (`polroles`
-- containing OID 0), which is every role on this database — `anon` included.
--
-- Their predicates require `is_platform_admin()` or `iam.is_org_manager(id, auth.uid())` /
-- `iam.is_org_owner(id, auth.uid())`, and `auth.uid()` is null for a signed-out caller, so neither
-- has ever let an anonymous caller through. This is not a leak being closed. It is the SHAPE being
-- corrected, for two reasons that are not cosmetic:
--
--  1. A `TO PUBLIC` write policy is the surface DD-193 exists to remove: it is the one thing that,
--     standing beside an anon table grant, turns a future predicate change (a helper that returns
--     true for a null uid, an `or visibility = 'public'` arm added for a share feature) into an
--     anonymous UPDATE or DELETE of an organization row. The grant is gone as of
--     `dd193_anon_write_axis_revoked.sql`; the policy is the other half of the same pair.
--  2. The refusal it produced was DISHONEST. Measured as the `anon` role in a rolled-back
--     transaction with the grant still in place, `update iam.organizations set name = '…'` came back
--         42501  permission denied for function is_org_manager
--     and `delete from iam.organizations` came back
--         42501  permission denied for function is_org_owner
--     — Postgres passed the table privilege check, began evaluating the PUBLIC policy, and refused
--     on an internal helper's EXECUTE grant. A caller is told about a function it never named. The
--     honest sentence is about the table, and that is what it now says.
--
-- WHAT DOES NOT CHANGE. The predicates are re-created byte-identical. `authenticated` is the only
-- role that ever satisfied them: `service_role` and our own `postgres` login role both carry
-- BYPASSRLS (measured: `pg_roles.rolbypassrls` true for both), so neither consults these policies,
-- and aidream — which connects as `postgres` through matrx-orm — is unaffected. An org manager
-- renaming their organization and an org owner deleting a non-personal one behave exactly as before.

select iam.supersede_bespoke_policies(
  'iam', 'organizations',
  array['org_update_policy', 'org_delete_policy'],
  'DD-193: both were written TO PUBLIC, which includes the anon role, on a table that also carried an anon UPDATE and DELETE grant. The predicates are unchanged and re-created in this same migration TO authenticated — the only role that can satisfy them, since service_role and postgres both bypass RLS. A TO PUBLIC write policy beside an anon grant is the pair that turns any future predicate widening into an anonymous write of an organization row, and it made the refusal name an internal helper (permission denied for function is_org_manager) instead of the table.'
);

create policy org_update_policy on iam.organizations
  for update to authenticated
  using ((select is_platform_admin()) or iam.is_org_manager(id, (select auth.uid())))
  with check ((select is_platform_admin()) or iam.is_org_manager(id, (select auth.uid())));

create policy org_delete_policy on iam.organizations
  for delete to authenticated
  using ((select is_platform_admin()) or (iam.is_org_owner(id, (select auth.uid())) and is_personal = false));

-- ── THE ASSERTION. Not one write-capable policy on this table may reach PUBLIC afterwards, and both
--    names must be back — a supersede that forgot its replacement is an outage, not a tightening.
do $$
declare
  v_public integer;
  v_back integer;
begin
  select count(*) into v_public
  from pg_policy p
  where p.polrelid = 'iam.organizations'::regclass
    and p.polcmd::text in ('a','w','d','*')
    and 0 = any (p.polroles);
  if v_public > 0 then
    raise exception 'dd193: % write-capable polic(ies) on iam.organizations still reach PUBLIC. Nothing was committed.', v_public;
  end if;

  select count(*) into v_back
  from pg_policy p
  where p.polrelid = 'iam.organizations'::regclass
    and p.polname in ('org_update_policy','org_delete_policy');
  if v_back <> 2 then
    raise exception 'dd193: expected org_update_policy and org_delete_policy to exist after the supersede and found %. An org manager or owner would have lost their own table. Nothing was committed.', v_back;
  end if;

  raise notice 'dd193: iam.organizations write policies are scoped to authenticated; no write policy reaches PUBLIC.';
end $$;
