-- lane: DOORS-ONLY-2
-- `platform` AND `iam` ARE NOT CLIENT-WRITABLE THROUGH PostgREST. (Chair ruling; VERIFIER-8
-- HIGH-3, 2026-09-21. DOORS-ONLY closed the first twenty tables; this is the continuation.)
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
-- platform.reference_categories -- VOCABULARY SEMANTICS.
-- The shared reference-category vocabulary.
--
-- WHY IT MATTERS: A member who writes a shared vocabulary changes words every organization on the platform sees.
--
-- THE CENSUS, done the way SECURITY-SWEEP said to do it -- a `.from("reference_categories")` search AND a
-- bare-name search of `"reference_categories"` / 'reference_categories' / `reference_categories` across matrx-frontend
-- (app, features, lib, components, hooks, utils), matrx-extend/src, matrx-local/src, the
-- @ai-matrx package sources under aidream/apps/shared, and aidream/apps/dashboard/src, with
-- EVERY HIT READ rather than counted. ZERO CLIENT WRITERS: every hit is a generated
-- catalogue (`entity-types.generated.ts`, `store.generated.ts`, `catalog-nouns.generated.ts`,
-- `database.types.ts`), a read-only permissions-registry entry, a FEATURE.md sentence, or an
-- unrelated identifier that merely shares the name.
--
-- THE DOOR IS UNAFFECTED. `platform.reference_categories` is owned by `postgres` and does NOT carry
-- FORCE ROW LEVEL SECURITY (read from pg_class, not assumed), and every writer is a
-- SECURITY DEFINER function owned by `postgres`. The owner is not subject to these policies,
-- so no door, trigger, event trigger or server path changes behaviour. `service_role` is
-- untouched. SELECT is untouched -- this constrains INSERT, UPDATE and DELETE only, and
-- `platform_admin_all` is NOT dropped, because it is a FOR ALL policy and therefore the
-- SELECT policy too: dropping it would take platform admins' READ path away.
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
-- migrations/campaign/chairstep_doorsonly2_revoke_client_writes.sql for the chair to apply.
-- Inverse: migrations/inverse/doorsonly2_platform_reference_categories_is_never_client_written.inverse.sql
-- Guard: `pnpm check:doors-only-schemas` -- these three triples move from OPEN to RESIDUAL.

set local lock_timeout = '2s';

create policy "reference_categories_client_insert_refused" on platform.reference_categories
  as restrictive for insert to authenticated, anon
  with check (false);

create policy "reference_categories_client_update_refused" on platform.reference_categories
  as restrictive for update to authenticated, anon
  using (false) with check (false);

create policy "reference_categories_client_delete_refused" on platform.reference_categories
  as restrictive for delete to authenticated, anon
  using (false);

comment on policy "reference_categories_client_insert_refused" on platform.reference_categories is
  'DOORS-ONLY-2 2026-09-21: platform and iam are not client-writable through PostgREST -- every write goes through a SECURITY DEFINER door that decides through the one ladder; reads stay under RLS (VERIFIER-8 HIGH-3). VOCABULARY semantics: A member who writes a shared vocabulary changes words every organization on the platform sees. Census: zero client writers in matrx-frontend, matrx-extend, matrx-local, the @ai-matrx packages or the aidream dashboard -- every hit read rather than counted, and every one was a generated catalogue, a read-only registry entry or a doc. RESTRICTIVE so it ANDs with every permissive policy present or future, and bespoke so iam.apply_rls preserves it (DD-147). The table is owned by postgres with no FORCE RLS, so every SECURITY DEFINER door is unaffected; service_role and SELECT are untouched and platform_admin_all is kept.';

comment on policy "reference_categories_client_update_refused" on platform.reference_categories is
  'DOORS-ONLY-2 2026-09-21: platform and iam are not client-writable through PostgREST -- every write goes through a SECURITY DEFINER door that decides through the one ladder; reads stay under RLS (VERIFIER-8 HIGH-3). VOCABULARY semantics: A member who writes a shared vocabulary changes words every organization on the platform sees. Census: zero client writers in matrx-frontend, matrx-extend, matrx-local, the @ai-matrx packages or the aidream dashboard -- every hit read rather than counted, and every one was a generated catalogue, a read-only registry entry or a doc. RESTRICTIVE so it ANDs with every permissive policy present or future, and bespoke so iam.apply_rls preserves it (DD-147). The table is owned by postgres with no FORCE RLS, so every SECURITY DEFINER door is unaffected; service_role and SELECT are untouched and platform_admin_all is kept.';

comment on policy "reference_categories_client_delete_refused" on platform.reference_categories is
  'DOORS-ONLY-2 2026-09-21: platform and iam are not client-writable through PostgREST -- every write goes through a SECURITY DEFINER door that decides through the one ladder; reads stay under RLS (VERIFIER-8 HIGH-3). VOCABULARY semantics: A member who writes a shared vocabulary changes words every organization on the platform sees. Census: zero client writers in matrx-frontend, matrx-extend, matrx-local, the @ai-matrx packages or the aidream dashboard -- every hit read rather than counted, and every one was a generated catalogue, a read-only registry entry or a doc. RESTRICTIVE so it ANDs with every permissive policy present or future, and bespoke so iam.apply_rls preserves it (DD-147). The table is owned by postgres with no FORCE RLS, so every SECURITY DEFINER door is unaffected; service_role and SELECT are untouched and platform_admin_all is kept.';
