-- lane: SECURITY-SWEEP-2
-- A COLUMN THAT NAMES SOMEBODY ELSE GOES THROUGH A CHECK THAT THE CALLER MAY ADDRESS THAT
-- PERSON IN THAT ORGANIZATION. (Chair ruling, 2026-09-21.)
--
-- platform.assists.user_id genuinely names a person other than the writer, so pinning it to
-- auth.uid() would break the feature. The worked example already live on this database is
-- mandate.binding.subject_user_id, whose guard_binding_containment trigger refuses a subject who
-- is not a member of the organization that owns the row. THIS REUSES THAT PLATFORM PRIMITIVE
-- RATHER THAN WRITING A SECOND ONE: iam.may_address_user_in_org composes the two primitives
-- that already exist -- iam.has_org_access for the CALLER, iam.has_org_access_for for the
-- SUBJECT -- and is the same question guard_binding_containment asks of
-- iam.organization_member. See secsweep2_addressability_is_one_function_the_client_may_call.sql
-- for why the bare two-argument function is not client-executable and this composition is.
--
-- WHAT THE PAIR ACTUALLY GUARANTEES. This RESTRICTIVE policy ANDs with the generated permissive
-- one, which already requires the CALLER to have access to this organization. Together: the
-- caller may act in this organization AND the person named may be addressed in it. That is the
-- ruling stated as one expression, and it is strictly narrower than today, where the column may
-- name anybody at all.
--
-- The auth.uid() arm is kept so the ordinary case -- a person writing the row about herself --
-- never depends on a membership lookup.
--
-- The column is NOT NULL, so there is no null arm.
--
-- WHY A RESTRICTIVE POLICY: iam.apply_rls regenerates the generated policy names on every run
-- and would erase an edit to std_insert. iam._apply_rls_unchecked drops only the names in
-- iam.generated_policy_names() and KEEPS everything else (DD-147), so a bespoke restrictive
-- policy survives regeneration -- and RESTRICTIVE means no permissive policy, present or
-- future, can re-open the column.
--
-- ADDITIVE. Nothing is dropped, renamed or revoked. SELECT, DELETE and service_role untouched.
-- Inverse: migrations/inverse/secsweep2_platform_assists_user_id.inverse.sql
-- Guard: `pnpm check:unpinned-security-columns` -- both baseline rows for this pair leave.

set local lock_timeout = '2s';

-- 🚨 REPLACING THIS PAIR, NOT PATCHING IT. The first version called iam.has_org_access_for
-- directly; the client roles hold no EXECUTE on that function, so the policy refused EVERY
-- client write to this table, including the app's own. Only calling it from the authenticated
-- role found that -- judge-only, a green apply and a clean type-check all passed it.
drop policy if exists "assists_user_id_is_addressable_insert" on platform.assists;
drop policy if exists "assists_user_id_is_addressable_update" on platform.assists;

create policy "assists_user_id_is_addressable_insert" on platform.assists
  as restrictive for insert to authenticated, anon
  with check (user_id = (select auth.uid()) or iam.may_address_user_in_org(user_id, organization_id) or (select public.is_platform_admin()));

create policy "assists_user_id_is_addressable_update" on platform.assists
  as restrictive for update to authenticated, anon
  with check (user_id = (select auth.uid()) or iam.may_address_user_in_org(user_id, organization_id) or (select public.is_platform_admin()));
