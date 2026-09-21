-- lane: SECURITY-SWEEP-2
-- A COLUMN THAT NAMES THE CALLER IS PINNED TO auth.uid(). (Chair ruling, 2026-09-21.)
--
-- hr.candidate.actor_user_id records WHO DID IT. The actor of an action is, by definition, the caller,
-- so a client that may choose this value can write a record saying somebody else did the thing --
-- the same forgery shape that made iam.access_audit.actor_user_id a CRITICAL, closed earlier in
-- this campaign. The generated std_insert / std_update policies pin created_by and
-- organization_id and say NOTHING about this column.
--
-- NULL IS ALLOWED: the column is nullable and NULL names nobody, so it cannot impersonate.
--
-- WHY A RESTRICTIVE POLICY: iam.apply_rls regenerates the generated policy names on every run
-- and would erase an edit to std_insert. iam._apply_rls_unchecked drops only the names in
-- iam.generated_policy_names() and KEEPS everything else (DD-147), so a bespoke restrictive
-- policy survives regeneration -- and RESTRICTIVE means no permissive policy, present or
-- future, can re-open the column.
--
-- ADDITIVE. Nothing is dropped, renamed or revoked. SELECT, DELETE and service_role untouched.
-- Inverse: migrations/inverse/secsweep2_hr_candidate_actor_user_id.inverse.sql
-- Guard: `pnpm check:unpinned-security-columns` -- both baseline rows for this pair leave.

set local lock_timeout = '2s';

create policy "candidate_actor_user_id_is_the_caller_insert" on hr.candidate
  as restrictive for insert to authenticated, anon
  with check (actor_user_id is null or actor_user_id = (select auth.uid()) or (select public.is_platform_admin()));

create policy "candidate_actor_user_id_is_the_caller_update" on hr.candidate
  as restrictive for update to authenticated, anon
  with check (actor_user_id is null or actor_user_id = (select auth.uid()) or (select public.is_platform_admin()));
