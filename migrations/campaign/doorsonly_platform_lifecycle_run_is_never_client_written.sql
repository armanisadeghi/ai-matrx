-- lane: DOORS-ONLY
-- `platform` AND `iam` ARE NOT CLIENT-WRITABLE THROUGH PostgREST. (Chair ruling; VERIFIER-8
-- HIGH-3, 2026-09-21; the half of SECURITY-SWEEP's ruling 1 nobody had executed.)
--
-- Every write to these two schemas goes through a SECURITY DEFINER door that decides through
-- the one ladder. Reads stay exactly as they are, under RLS. The reason is not that any one
-- policy is wrong today: it is that a base table reachable directly over REST is safe only
-- while EVERY policy on it is complete, forever, including the ones `iam.apply_rls` will
-- regenerate tomorrow -- and CRITICAL-1 (`iam.api_keys.service_user_id`) is the proof that
-- "every policy is complete" is not a property this database has. A safe path beside an
-- unsafe one is no fix; closing a class means removing the door.
--
-- platform.lifecycle_run -- AUDIT SEMANTICS.
-- The record of each lifecycle run. Same writers, zero client mentions.
--
-- WHY IT MATTERS: A forgeable record of what was retained, archived or purged and when.
--
-- THE CENSUS, done the way SECURITY-SWEEP said to do it -- a bare-name grep of the table name
-- across matrx-frontend (app, features, lib, components, hooks, utils), matrx-extend/src,
-- matrx-local/src AND the @ai-matrx package sources under aidream/apps/shared/*/src, generated
-- entity-type catalogues excluded, and then READING every hit rather than counting `.from()`.
--
-- THE DOOR IS UNAFFECTED. `platform.lifecycle_run` is owned by `postgres` and does NOT carry
-- FORCE ROW LEVEL SECURITY (read from pg_class, not assumed), and every writer is a
-- SECURITY DEFINER function owned by `postgres`. The owner is not subject to these policies,
-- so no door, trigger, event trigger or server path changes behaviour. `service_role` is
-- untouched. SELECT is untouched -- this constrains INSERT, UPDATE and DELETE only.
--
-- RESTRICTIVE, so it ANDs with every permissive policy present or future: no regeneration of
-- `std_insert` / `std_update` / `std_delete`, and no future hand-written permissive policy,
-- can re-open the write. The names are bespoke on purpose, so they are NOT in
-- `iam.generated_policy_names()` and `iam.apply_rls` preserves them across every regeneration
-- (DD-147).
--
-- ADDITIVE. Nothing is dropped, renamed or revoked. The dead GRANT that remains is the
-- lane's next step and is a chair step, because `platform` and `iam` are REVOKE-protected
-- schemas (scripts/lib/migration-target.ts REVOKE_PROTECTED_SCHEMAS).
-- Inverse: migrations/inverse/doorsonly_platform_lifecycle_run_is_never_client_written.inverse.sql
-- Guard: `pnpm check:doors-only-schemas` -- these three triples move from OPEN to RESIDUAL.

set local lock_timeout = '2s';

create policy "lifecycle_run_client_insert_refused" on platform.lifecycle_run
  as restrictive for insert to authenticated, anon
  with check (false);

create policy "lifecycle_run_client_update_refused" on platform.lifecycle_run
  as restrictive for update to authenticated, anon
  using (false) with check (false);

create policy "lifecycle_run_client_delete_refused" on platform.lifecycle_run
  as restrictive for delete to authenticated, anon
  using (false);

comment on policy "lifecycle_run_client_insert_refused" on platform.lifecycle_run is
  'DOORS-ONLY 2026-09-21: platform and iam are not client-writable through PostgREST -- every write goes through a SECURITY DEFINER door that decides through the one ladder; reads stay under RLS (VERIFIER-8 HIGH-3). AUDIT semantics: A forgeable record of what was retained, archived or purged and when. Census: zero client writers in matrx-frontend, matrx-extend, matrx-local or the @ai-matrx packages, every hit read rather than counted. RESTRICTIVE so it ANDs with every permissive policy present or future, and bespoke so iam.apply_rls preserves it (DD-147). The table is owned by postgres with no FORCE RLS, so every SECURITY DEFINER door is unaffected; service_role and SELECT are untouched.';

comment on policy "lifecycle_run_client_update_refused" on platform.lifecycle_run is
  'DOORS-ONLY 2026-09-21: platform and iam are not client-writable through PostgREST -- every write goes through a SECURITY DEFINER door that decides through the one ladder; reads stay under RLS (VERIFIER-8 HIGH-3). AUDIT semantics: A forgeable record of what was retained, archived or purged and when. Census: zero client writers in matrx-frontend, matrx-extend, matrx-local or the @ai-matrx packages, every hit read rather than counted. RESTRICTIVE so it ANDs with every permissive policy present or future, and bespoke so iam.apply_rls preserves it (DD-147). The table is owned by postgres with no FORCE RLS, so every SECURITY DEFINER door is unaffected; service_role and SELECT are untouched.';

comment on policy "lifecycle_run_client_delete_refused" on platform.lifecycle_run is
  'DOORS-ONLY 2026-09-21: platform and iam are not client-writable through PostgREST -- every write goes through a SECURITY DEFINER door that decides through the one ladder; reads stay under RLS (VERIFIER-8 HIGH-3). AUDIT semantics: A forgeable record of what was retained, archived or purged and when. Census: zero client writers in matrx-frontend, matrx-extend, matrx-local or the @ai-matrx packages, every hit read rather than counted. RESTRICTIVE so it ANDs with every permissive policy present or future, and bespoke so iam.apply_rls preserves it (DD-147). The table is owned by postgres with no FORCE RLS, so every SECURITY DEFINER door is unaffected; service_role and SELECT are untouched.';
