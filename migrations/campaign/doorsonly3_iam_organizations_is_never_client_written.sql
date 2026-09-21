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
-- iam.organizations -- THE WALL AROUND SOMEBODY'S BUSINESS, AND A HARD DELETE THAT SHOULD NEVER HAVE EXISTED.
--
-- THE CENSUS, and the step a `.from()` grep alone gets wrong. Every file naming this table
-- across matrx-frontend, aidream (apps/shared, apps/dashboard/src), matrx-extend/src and
-- matrx-local was listed, and then each file was checked for ANY write verb ANYWHERE in it --
-- not only beside the `.from(`.
--
-- FOUR client writers. `features/organizations/service.ts` (an update and a HARD `delete()`),
-- `features/agent-context/service/hierarchyService.ts` and `redux/organizationsSlice.ts` --
-- both of which passed their patch object through to the base table UNFILTERED -- and the
-- generic registry writer in `@ai-matrx/associations`, which has been sending this table an
-- `organization_id` column it does not have and getting `42703` for as long as the reference
-- picker has passed an organization. Nothing writes it with `createAdminClient()`.
--
-- THE DOOR THEY NOW USE: `public.org_update`, and `iam.organization_archive` for the delete,
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
-- Inverse: migrations/inverse/doorsonly3_iam_organizations_is_never_client_written.inverse.sql
-- Guard: `pnpm check:doors-only-schemas` -- these three triples move from OPEN to RESIDUAL.

set local lock_timeout = '2s';

create policy "organizations_client_insert_refused" on iam.organizations
  as restrictive for insert to authenticated, anon
  with check (false);

create policy "organizations_client_update_refused" on iam.organizations
  as restrictive for update to authenticated, anon
  using (false) with check (false);

create policy "organizations_client_delete_refused" on iam.organizations
  as restrictive for delete to authenticated, anon
  using (false);

comment on policy "organizations_client_insert_refused" on iam.organizations is 'DOORS-ONLY-3 2026-09-21: platform and iam are not client-writable through PostgREST -- every write goes through a SECURITY DEFINER door that decides through the one ladder; reads stay under RLS (VERIFIER-8 HIGH-3). An organization is the wall around somebody''s business, and the base-table UPDATE grant let any manager write is_personal, created_by and slug -- columns that decide whether the wall exists at all -- because two of the three callers passed an unfiltered patch straight through. The door reads seven keys and ignores the rest. The hard DELETE is now iam.organization_archive: destroying an organization took its memberships, its data and its audit trail with it, with no way back. Census: every file naming this table was listed and then checked for ANY write verb anywhere in it, not only beside the .from(, and every writer was moved to the door in the same commit -- including the GENERIC registry-driven writer in @ai-matrx/associations, which this campaign had silently broken on every table it closed and which now goes through public.entity_row_create / entity_row_rename. RESTRICTIVE so it ANDs with every permissive policy present or future, and bespoke so iam.apply_rls preserves it (DD-147). The table is owned by postgres with no FORCE RLS, so every SECURITY DEFINER door is unaffected; service_role and SELECT are untouched.';
comment on policy "organizations_client_update_refused" on iam.organizations is 'DOORS-ONLY-3 2026-09-21: platform and iam are not client-writable through PostgREST -- every write goes through a SECURITY DEFINER door that decides through the one ladder; reads stay under RLS (VERIFIER-8 HIGH-3). An organization is the wall around somebody''s business, and the base-table UPDATE grant let any manager write is_personal, created_by and slug -- columns that decide whether the wall exists at all -- because two of the three callers passed an unfiltered patch straight through. The door reads seven keys and ignores the rest. The hard DELETE is now iam.organization_archive: destroying an organization took its memberships, its data and its audit trail with it, with no way back. Census: every file naming this table was listed and then checked for ANY write verb anywhere in it, not only beside the .from(, and every writer was moved to the door in the same commit -- including the GENERIC registry-driven writer in @ai-matrx/associations, which this campaign had silently broken on every table it closed and which now goes through public.entity_row_create / entity_row_rename. RESTRICTIVE so it ANDs with every permissive policy present or future, and bespoke so iam.apply_rls preserves it (DD-147). The table is owned by postgres with no FORCE RLS, so every SECURITY DEFINER door is unaffected; service_role and SELECT are untouched.';
comment on policy "organizations_client_delete_refused" on iam.organizations is 'DOORS-ONLY-3 2026-09-21: platform and iam are not client-writable through PostgREST -- every write goes through a SECURITY DEFINER door that decides through the one ladder; reads stay under RLS (VERIFIER-8 HIGH-3). An organization is the wall around somebody''s business, and the base-table UPDATE grant let any manager write is_personal, created_by and slug -- columns that decide whether the wall exists at all -- because two of the three callers passed an unfiltered patch straight through. The door reads seven keys and ignores the rest. The hard DELETE is now iam.organization_archive: destroying an organization took its memberships, its data and its audit trail with it, with no way back. Census: every file naming this table was listed and then checked for ANY write verb anywhere in it, not only beside the .from(, and every writer was moved to the door in the same commit -- including the GENERIC registry-driven writer in @ai-matrx/associations, which this campaign had silently broken on every table it closed and which now goes through public.entity_row_create / entity_row_rename. RESTRICTIVE so it ANDs with every permissive policy present or future, and bespoke so iam.apply_rls preserves it (DD-147). The table is owned by postgres with no FORCE RLS, so every SECURITY DEFINER door is unaffected; service_role and SELECT are untouched.';
