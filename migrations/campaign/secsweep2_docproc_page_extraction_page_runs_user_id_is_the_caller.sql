-- lane: SECURITY-SWEEP-2
-- A COLUMN THAT NAMES THE CALLER IS PINNED TO auth.uid(). (Chair ruling, 2026-09-21.)
--
-- docproc.page_extraction_page_runs.user_id is the person the row is about, and the app writes this row AS that
-- person. The generated std_insert / std_update policies pin created_by and organization_id and
-- say NOTHING about this column, so a plain signed-in member could POST a row naming somebody
-- else -- the same silence that let iam.api_keys.service_user_id take an account over.
--
-- EVIDENCE THE COLUMN NAMES THE CALLER, read from the live table rather than assumed: zero rows
-- where user_id is set, created_by is set, and the two differ. created_by is itself pinned to
-- auth.uid() by the generated policy, so "user_id = created_by on every row" is the strongest
-- retrospective statement available about who wrote it.
--
-- WHY A RESTRICTIVE POLICY AND NOT AN EDIT TO std_insert: iam.apply_rls regenerates the
-- generated names on every run and would erase an edit. It drops only the names in
-- iam.generated_policy_names() and KEEPS everything else (DD-147), so a bespoke restrictive
-- policy survives regeneration -- and RESTRICTIVE means it ANDs with every permissive policy,
-- present or future, so no regeneration can re-open the column.
--
-- NULL IS ALLOWED. The column is nullable and the app legitimately leaves it unset (an
-- anonymous or system-attributed row). NULL names nobody and cannot impersonate anybody.
--
-- ADDITIVE. Nothing is dropped, renamed or revoked. SELECT, DELETE and service_role are
-- untouched; only the value of this one column on a client INSERT/UPDATE is constrained.
-- Inverse: migrations/inverse/secsweep2_docproc_page_extraction_page_runs_user_id_is_the_caller.inverse.sql
-- Guard: `pnpm check:unpinned-security-columns` -- both baseline rows for this pair leave.

set local lock_timeout = '2s';

create policy "page_extraction_page_runs_user_id_is_the_caller_insert" on docproc.page_extraction_page_runs
  as restrictive for insert to authenticated, anon
  with check (user_id is null or user_id = (select auth.uid()) or (select public.is_platform_admin()));

create policy "page_extraction_page_runs_user_id_is_the_caller_update" on docproc.page_extraction_page_runs
  as restrictive for update to authenticated, anon
  with check (user_id is null or user_id = (select auth.uid()) or (select public.is_platform_admin()));

comment on policy "page_extraction_page_runs_user_id_is_the_caller_insert" on docproc.page_extraction_page_runs is
  'SECURITY-SWEEP-2 2026-09-21: docproc.page_extraction_page_runs.user_id names the CALLER, so it is pinned to auth.uid(). The generated std_insert/std_update policies pin created_by and organization_id and say nothing about this column, so a signed-in member could POST a row naming somebody else. RESTRICTIVE, so it ANDs with every permissive policy present or future; bespoke on purpose, so iam.apply_rls preserves it (DD-147). Evidence the column names the caller: every live row has user_id = created_by. NULL is allowed where the column is nullable -- NULL names nobody and cannot impersonate. Reads, deletes and service_role are untouched.';
comment on policy "page_extraction_page_runs_user_id_is_the_caller_update" on docproc.page_extraction_page_runs is
  'SECURITY-SWEEP-2 2026-09-21: docproc.page_extraction_page_runs.user_id names the CALLER, so it is pinned to auth.uid(). The generated std_insert/std_update policies pin created_by and organization_id and say nothing about this column, so a signed-in member could POST a row naming somebody else. RESTRICTIVE, so it ANDs with every permissive policy present or future; bespoke on purpose, so iam.apply_rls preserves it (DD-147). Evidence the column names the caller: every live row has user_id = created_by. NULL is allowed where the column is nullable -- NULL names nobody and cannot impersonate. Reads, deletes and service_role are untouched.';
