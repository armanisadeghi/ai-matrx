-- lane: DOORS-ONLY-2
-- `platform` AND `iam` ARE NOT CLIENT-WRITABLE THROUGH PostgREST. (Chair ruling; VERIFIER-8
-- HIGH-3, 2026-09-21. DOORS-ONLY closed the first twenty tables; DOORS-ONLY-2 batch 1 closed
-- twenty-five more; this is batch 2.)
--
-- Every write to these two schemas goes through a SECURITY DEFINER door that decides through
-- the one ladder. Reads stay exactly as they are, under RLS. The reason is not that any one
-- policy is wrong today: it is that a base table reachable directly over REST is safe only
-- while EVERY policy on it is complete, forever, including the ones `iam.apply_rls` will
-- regenerate tomorrow -- and CRITICAL-1 (`iam.api_keys.service_user_id`, full account takeover
-- from a plain member's seat) is the proof that "every policy is complete" is not a property
-- this database has. A safe path beside an unsafe one is no fix; closing a class means
-- removing the door.
--
-- platform.entity_types -- CATALOGUE SEMANTICS.
-- The entity-type catalogue the whole platform resolves tokens against. Read by `features/hr/settings/service.ts`; no file that names it contains a write verb.
--
-- WHY IT MATTERS: VERIFIER-8 named this table in HIGH-3 BY NAME. A member who writes the entity-type catalogue redefines what every token in the platform means.
--
-- THE CENSUS, and the step that a `.from()` grep alone would have got WRONG. Every file naming
-- this table across matrx-frontend (app, features, lib, components, hooks, utils),
-- matrx-extend/src, matrx-local/src, aidream/apps/shared and aidream/apps/dashboard/src was
-- listed, and then each was checked for ANY write verb anywhere in the file -- not only near
-- the `.from(...)` call. That third step is what this batch was built on, because
-- `platform.rulebook` and `platform.guided_checklist_run` DO have client writers that a
-- `.from()`-plus-context grep misses entirely: they write through a
-- `const rulebookTable = () => supabase.schema("platform").from("rulebook")` helper, a hundred
-- lines away from the `.from(`. Those two tables are therefore NOT in this batch; they need a
-- door built and their callers moved first. This table has no write verb in any file that
-- names it.
--
-- THE DOOR IS UNAFFECTED. `platform.entity_types` is owned by `postgres` and does NOT carry
-- FORCE ROW LEVEL SECURITY (read from pg_class, not assumed), and every writer is a
-- SECURITY DEFINER function owned by `postgres`. The owner is not subject to these policies,
-- so no door, trigger, event trigger or server path changes behaviour. `service_role` is
-- untouched -- which also covers the readers that connect with SUPABASE_SECRET_KEY. SELECT is
-- untouched: this constrains INSERT, UPDATE and DELETE only, and `platform_admin_all` is NOT
-- dropped, because it is a FOR ALL policy and therefore the SELECT policy too -- dropping it
-- would take platform admins' READ path away.
--
-- RESTRICTIVE, so it ANDs with every permissive policy present or future: no regeneration of
-- `std_insert` / `std_update` / `std_delete`, and no future hand-written permissive policy,
-- can re-open the write. The names are bespoke on purpose, so they are NOT in
-- `iam.generated_policy_names()` and `iam.apply_rls` preserves them across every regeneration
-- (DD-147).
--
-- ADDITIVE. Nothing is dropped, renamed or revoked. The dead GRANT that remains is a chair
-- step, because `platform` and `iam` are REVOKE-protected schemas
-- (scripts/lib/migration-target.ts REVOKE_PROTECTED_SCHEMAS); it is written as
-- migrations/campaign/chairstep_doorsonly2_revoke_client_writes_batch2.sql for the chair.
-- Inverse: migrations/inverse/doorsonly2_platform_entity_types_is_never_client_written.inverse.sql
-- Guard: `pnpm check:doors-only-schemas` -- these three triples move from OPEN to RESIDUAL.

set local lock_timeout = '2s';

create policy "entity_types_client_insert_refused" on platform.entity_types
  as restrictive for insert to authenticated, anon
  with check (false);

create policy "entity_types_client_update_refused" on platform.entity_types
  as restrictive for update to authenticated, anon
  using (false) with check (false);

create policy "entity_types_client_delete_refused" on platform.entity_types
  as restrictive for delete to authenticated, anon
  using (false);

comment on policy "entity_types_client_insert_refused" on platform.entity_types is
  'DOORS-ONLY-2 2026-09-21 (batch 2): platform and iam are not client-writable through PostgREST -- every write goes through a SECURITY DEFINER door that decides through the one ladder; reads stay under RLS (VERIFIER-8 HIGH-3). CATALOGUE semantics: VERIFIER-8 named this table in HIGH-3 BY NAME. A member who writes the entity-type catalogue redefines what every token in the platform means. Census: every file naming this table was listed and then checked for ANY write verb anywhere in the file, not only beside the .from( -- the step that caught platform.rulebook and platform.guided_checklist_run writing through a helper a hundred lines away, and kept them OUT of this batch. This table has no write verb in any file that names it. RESTRICTIVE so it ANDs with every permissive policy present or future, and bespoke so iam.apply_rls preserves it (DD-147). The table is owned by postgres with no FORCE RLS, so every SECURITY DEFINER door is unaffected; service_role and SELECT are untouched and platform_admin_all is kept.';

comment on policy "entity_types_client_update_refused" on platform.entity_types is
  'DOORS-ONLY-2 2026-09-21 (batch 2): platform and iam are not client-writable through PostgREST -- every write goes through a SECURITY DEFINER door that decides through the one ladder; reads stay under RLS (VERIFIER-8 HIGH-3). CATALOGUE semantics: VERIFIER-8 named this table in HIGH-3 BY NAME. A member who writes the entity-type catalogue redefines what every token in the platform means. Census: every file naming this table was listed and then checked for ANY write verb anywhere in the file, not only beside the .from( -- the step that caught platform.rulebook and platform.guided_checklist_run writing through a helper a hundred lines away, and kept them OUT of this batch. This table has no write verb in any file that names it. RESTRICTIVE so it ANDs with every permissive policy present or future, and bespoke so iam.apply_rls preserves it (DD-147). The table is owned by postgres with no FORCE RLS, so every SECURITY DEFINER door is unaffected; service_role and SELECT are untouched and platform_admin_all is kept.';

comment on policy "entity_types_client_delete_refused" on platform.entity_types is
  'DOORS-ONLY-2 2026-09-21 (batch 2): platform and iam are not client-writable through PostgREST -- every write goes through a SECURITY DEFINER door that decides through the one ladder; reads stay under RLS (VERIFIER-8 HIGH-3). CATALOGUE semantics: VERIFIER-8 named this table in HIGH-3 BY NAME. A member who writes the entity-type catalogue redefines what every token in the platform means. Census: every file naming this table was listed and then checked for ANY write verb anywhere in the file, not only beside the .from( -- the step that caught platform.rulebook and platform.guided_checklist_run writing through a helper a hundred lines away, and kept them OUT of this batch. This table has no write verb in any file that names it. RESTRICTIVE so it ANDs with every permissive policy present or future, and bespoke so iam.apply_rls preserves it (DD-147). The table is owned by postgres with no FORCE RLS, so every SECURITY DEFINER door is unaffected; service_role and SELECT are untouched and platform_admin_all is kept.';
