-- lane: DOORS-ONLY-3
-- `platform` AND `iam` ARE NOT CLIENT-WRITABLE THROUGH PostgREST. (Chair ruling; VERIFIER-8
-- HIGH-3, 2026-09-21. DOORS-ONLY closed the first twenty tables, DOORS-ONLY-2 forty-three
-- more; these are the last nine, the ones with real client writers.)
--
-- Every write to these two schemas goes through a SECURITY DEFINER door that decides through
-- the one ladder. Reads stay exactly as they are, under RLS. The reason is not that any one
-- policy is wrong today: a base table reachable directly over REST is safe only while EVERY
-- policy on it is complete, forever, including the ones `iam.apply_rls` regenerates tomorrow --
-- and CRITICAL-1 (`iam.api_keys.service_user_id`, full account takeover from a plain member's
-- seat) is the proof that "every policy is complete" is not a property this database has.
--
-- platform.flexible_data -- AN EDIT AND AN ARCHIVE ARE DIFFERENT ACTS.
--
-- THE CENSUS, and the step a `.from()` grep alone gets wrong. Every file naming this table
-- across matrx-frontend, aidream (apps/shared, apps/dashboard/src), matrx-extend/src and
-- matrx-local was listed, and then each file was checked for ANY write verb ANYWHERE in it --
-- not only beside the `.from(`.
--
-- ONE client writer file, `features/content-ir/registry/schema-source-flexible-data.ts`: an
-- insert, an update, and a third `.update(` that is a SOFT DELETE setting `deleted_at` -- an
-- archive wearing an edit's name. Plus the generic registry writer in
-- `@ai-matrx/associations`, which creates and renames rows in this table by token from the
-- reference picker; that one WORKED here (unlike on iam.organizations) and would have been a
-- real regression, which is why the generic door exists before this file does.
--
-- THE DOOR THEY NOW USE: `public.flexible_data_write` and `public.flexible_data_archive`,
-- built in migrations/campaign/doorsonly3_batch_b_doors_and_the_generic_entity_row_door.sql,
-- decides at least as strictly as the `std_*` policy below and narrows the writable column set
-- to what the caller actually writes -- something a table grant can never do.
--
-- THE DOOR IS UNAFFECTED BY THIS FILE. The table is owned by `postgres` and does NOT carry
-- FORCE ROW LEVEL SECURITY (read from pg_class, not assumed), and every door is a SECURITY
-- DEFINER function owned by `postgres`. The owner is not subject to these policies, so no door,
-- trigger, event trigger or server path changes behaviour. `service_role` is untouched, which
-- also covers aidream's own lane. SELECT is untouched: this constrains INSERT, UPDATE and
-- DELETE only, and `platform_admin_all` is NOT dropped here, because it is a FOR ALL policy and
-- therefore the SELECT policy too -- dropping it would take platform admins' READ path away.
-- Its `FOR SELECT` twin, and the retirement that follows, are separate files in this lane.
--
-- RESTRICTIVE, so it ANDs with every permissive policy present or future: no regeneration of
-- `std_insert` / `std_update` / `std_delete`, and no future hand-written permissive policy, can
-- re-open the write. The names are bespoke on purpose, so they are NOT in
-- `iam.generated_policy_names()` and `iam.apply_rls` preserves them across every regeneration
-- (DD-147).
--
-- ADDITIVE. Nothing is dropped, renamed or revoked. The dead GRANT that remains is a chair
-- step, because `platform` and `iam` are REVOKE-protected schemas
-- (scripts/lib/migration-target.ts REVOKE_PROTECTED_SCHEMAS); it is written as
-- migrations/campaign/chairstep_doorsonly3_revoke_client_writes.sql for the chair.
-- Inverse: migrations/inverse/doorsonly3_platform_flexible_data_is_never_client_written.inverse.sql
-- Guard: `pnpm check:doors-only-schemas` -- these three triples move from OPEN to RESIDUAL.

set local lock_timeout = '2s';

create policy "flexible_data_client_insert_refused" on platform.flexible_data
  as restrictive for insert to authenticated, anon
  with check (false);

create policy "flexible_data_client_update_refused" on platform.flexible_data
  as restrictive for update to authenticated, anon
  using (false) with check (false);

create policy "flexible_data_client_delete_refused" on platform.flexible_data
  as restrictive for delete to authenticated, anon
  using (false);

comment on policy "flexible_data_client_insert_refused" on platform.flexible_data is 'DOORS-ONLY-3 2026-09-21: platform and iam are not client-writable through PostgREST -- every write goes through a SECURITY DEFINER door that decides through the one ladder; reads stay under RLS (VERIFIER-8 HIGH-3). The soft delete was a third arm of the same update path, so any caller holding the edit rung could archive a record by putting deleted_at in a patch. Archiving is now its own door arm at the ADMIN rung the std_delete policy asked for, and deleted_at is not a key of the edit patch at all. Census: every file naming this table was listed and then checked for ANY write verb anywhere in it, not only beside the .from(, and every writer was moved to the door in the same commit -- including the GENERIC registry-driven writer in @ai-matrx/associations, which this campaign had silently broken on every table it closed and which now goes through public.entity_row_create / entity_row_rename. RESTRICTIVE so it ANDs with every permissive policy present or future, and bespoke so iam.apply_rls preserves it (DD-147). The table is owned by postgres with no FORCE RLS, so every SECURITY DEFINER door is unaffected; service_role and SELECT are untouched.';
comment on policy "flexible_data_client_update_refused" on platform.flexible_data is 'DOORS-ONLY-3 2026-09-21: platform and iam are not client-writable through PostgREST -- every write goes through a SECURITY DEFINER door that decides through the one ladder; reads stay under RLS (VERIFIER-8 HIGH-3). The soft delete was a third arm of the same update path, so any caller holding the edit rung could archive a record by putting deleted_at in a patch. Archiving is now its own door arm at the ADMIN rung the std_delete policy asked for, and deleted_at is not a key of the edit patch at all. Census: every file naming this table was listed and then checked for ANY write verb anywhere in it, not only beside the .from(, and every writer was moved to the door in the same commit -- including the GENERIC registry-driven writer in @ai-matrx/associations, which this campaign had silently broken on every table it closed and which now goes through public.entity_row_create / entity_row_rename. RESTRICTIVE so it ANDs with every permissive policy present or future, and bespoke so iam.apply_rls preserves it (DD-147). The table is owned by postgres with no FORCE RLS, so every SECURITY DEFINER door is unaffected; service_role and SELECT are untouched.';
comment on policy "flexible_data_client_delete_refused" on platform.flexible_data is 'DOORS-ONLY-3 2026-09-21: platform and iam are not client-writable through PostgREST -- every write goes through a SECURITY DEFINER door that decides through the one ladder; reads stay under RLS (VERIFIER-8 HIGH-3). The soft delete was a third arm of the same update path, so any caller holding the edit rung could archive a record by putting deleted_at in a patch. Archiving is now its own door arm at the ADMIN rung the std_delete policy asked for, and deleted_at is not a key of the edit patch at all. Census: every file naming this table was listed and then checked for ANY write verb anywhere in it, not only beside the .from(, and every writer was moved to the door in the same commit -- including the GENERIC registry-driven writer in @ai-matrx/associations, which this campaign had silently broken on every table it closed and which now goes through public.entity_row_create / entity_row_rename. RESTRICTIVE so it ANDs with every permissive policy present or future, and bespoke so iam.apply_rls preserves it (DD-147). The table is owned by postgres with no FORCE RLS, so every SECURITY DEFINER door is unaffected; service_role and SELECT are untouched.';
