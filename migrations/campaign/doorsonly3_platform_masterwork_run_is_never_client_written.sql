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
-- platform.masterwork_run -- A RUN`S LIFECYCLE BELONGS TO THE RUNNER; ONLY THE HUMAN VERDICT IS THE CLIENT`S.
--
-- THE CENSUS, and the step a `.from()` grep alone gets wrong. Every file naming this table
-- across matrx-frontend (app, features, lib, components, hooks, utils, scripts), aidream
-- (apps/shared, apps/dashboard/src), matrx-extend/src and matrx-local was listed, and then each
-- file was checked for ANY write verb ANYWHERE in it -- not only beside the `.from(`. That is
-- the step that finds a writer reaching the table through a helper defined a hundred lines
-- away, which is exactly the shape this table has.
--
-- The ONE client writer across forty-odd files naming this table is
-- `features/masterwork/audition/auditionRuns.ts`, one update of `expert_score` and
-- `expert_verdict`. Every other frontend use is a read. Claim, heartbeat, complete, fail, cancel
-- and the abandoned-run sweep are all written by aidream (`services/masterwork_runs.py`,
-- `masterwork_recovery.py`, `masterwork_sweeper.py`, `masterworks/bench/persistence.py`) over the
-- ORM`s own connection.
--
-- THE DOOR THEY NOW USE: `public.masterwork_run_score`,
-- built in migrations/campaign/doorsonly3_batch_a_three_doors_for_three_tables.sql, which
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
-- Inverse: migrations/inverse/doorsonly3_platform_masterwork_run_is_never_client_written.inverse.sql
-- Guard: `pnpm check:doors-only-schemas` -- these three triples move from OPEN to RESIDUAL.

set local lock_timeout = '2s';

create policy "masterwork_run_client_insert_refused" on platform.masterwork_run
  as restrictive for insert to authenticated, anon
  with check (false);

create policy "masterwork_run_client_update_refused" on platform.masterwork_run
  as restrictive for update to authenticated, anon
  using (false) with check (false);

create policy "masterwork_run_client_delete_refused" on platform.masterwork_run
  as restrictive for delete to authenticated, anon
  using (false);

comment on policy "masterwork_run_client_insert_refused" on platform.masterwork_run is 'DOORS-ONLY-3 2026-09-21: platform and iam are not client-writable through PostgREST -- every write goes through a SECURITY DEFINER door that decides through the one ladder; reads stay under RLS (VERIFIER-8 HIGH-3). The base-table UPDATE grant let a browser write `status`, `result`, `error`, `completed_at` and `heartbeat_at` -- it could mark a failed run completed, or write its own result payload, and the recovery sweeper would believe it. The door writes expert_score and expert_verdict and cannot reach the lifecycle columns at all. Census: every file naming this table was listed and then checked for ANY write verb anywhere in it, not only beside the .from(, and every writer was moved to the door in the same commit. RESTRICTIVE so it ANDs with every permissive policy present or future, and bespoke so iam.apply_rls preserves it (DD-147). The table is owned by postgres with no FORCE RLS, so every SECURITY DEFINER door is unaffected; service_role and SELECT are untouched and platform_admin_all is kept.';
comment on policy "masterwork_run_client_update_refused" on platform.masterwork_run is 'DOORS-ONLY-3 2026-09-21: platform and iam are not client-writable through PostgREST -- every write goes through a SECURITY DEFINER door that decides through the one ladder; reads stay under RLS (VERIFIER-8 HIGH-3). The base-table UPDATE grant let a browser write `status`, `result`, `error`, `completed_at` and `heartbeat_at` -- it could mark a failed run completed, or write its own result payload, and the recovery sweeper would believe it. The door writes expert_score and expert_verdict and cannot reach the lifecycle columns at all. Census: every file naming this table was listed and then checked for ANY write verb anywhere in it, not only beside the .from(, and every writer was moved to the door in the same commit. RESTRICTIVE so it ANDs with every permissive policy present or future, and bespoke so iam.apply_rls preserves it (DD-147). The table is owned by postgres with no FORCE RLS, so every SECURITY DEFINER door is unaffected; service_role and SELECT are untouched and platform_admin_all is kept.';
comment on policy "masterwork_run_client_delete_refused" on platform.masterwork_run is 'DOORS-ONLY-3 2026-09-21: platform and iam are not client-writable through PostgREST -- every write goes through a SECURITY DEFINER door that decides through the one ladder; reads stay under RLS (VERIFIER-8 HIGH-3). The base-table UPDATE grant let a browser write `status`, `result`, `error`, `completed_at` and `heartbeat_at` -- it could mark a failed run completed, or write its own result payload, and the recovery sweeper would believe it. The door writes expert_score and expert_verdict and cannot reach the lifecycle columns at all. Census: every file naming this table was listed and then checked for ANY write verb anywhere in it, not only beside the .from(, and every writer was moved to the door in the same commit. RESTRICTIVE so it ANDs with every permissive policy present or future, and bespoke so iam.apply_rls preserves it (DD-147). The table is owned by postgres with no FORCE RLS, so every SECURITY DEFINER door is unaffected; service_role and SELECT are untouched and platform_admin_all is kept.';
