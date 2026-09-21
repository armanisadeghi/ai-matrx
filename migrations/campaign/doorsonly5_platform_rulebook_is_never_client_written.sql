-- lane: DOORS-ONLY-5
-- `platform` AND `iam` ARE NOT CLIENT-WRITABLE THROUGH PostgREST. (Chair ruling; VERIFIER-8
-- HIGH-3, 2026-09-21.) The second of the three tables DOORS-ONLY-4 left open in
-- `platform.doors_only_pending_cutover`.
--
-- platform.rulebook -- AN EXPERT'S BOOK.
--
-- THE CENSUS: NINE write call sites, every one reaching the table through
-- `const rulebookTable = () => supabase.schema("platform").from("rulebook")` declared thirty
-- lines above the write -- the shape a `.from()`-plus-context grep misses. ALL NINE moved to
-- the doors in the same commit as this file:
--
--   features/masterwork/service.ts             5  create draft, saveRules CAS, updateRulebookMeta,
--                                                 writeDumpUrlSources CAS, softDeleteRulebook
--   features/masterwork/drip/service.ts        1  metadata.daily_drip
--   features/masterwork/prediction/service.ts  1  metadata.prediction_ledger
--   features/masterwork/capture-plan/service.ts 1 metadata.capture_plan
--   features/masterwork/coherence/service.ts   1  metadata.coherence -> rulebook_tension_settle
--
-- `platform.materialize_library_rulebook`, reached by `library_subscribe`, is a SECURITY
-- DEFINER path that is already a door and was not touched.
--
-- THE DOORS THEY NOW USE: `public.rulebook_create`, `rulebook_save`, `rulebook_meta_set`,
-- `rulebook_archive` and `rulebook_tension_settle`, built in
-- doorsonly5_rulebook_gets_its_doors.sql and schema-qualified in
-- doorsonly5_the_rulebook_doors_qualify_their_functions.sql. Every one was CALLED from
-- admin@admin.com's SEAT, 7/7 green, BEFORE this file landed.
--
-- 🚨 WHAT STOPPED BEING REACHABLE, and none of it is expressible as a policy:
--
--   the metadata COLUMN -- six features shared one jsonb and every client writer replaced the
--     WHOLE column from a row it had read. `rulebook_save` takes a PATCH and merges it at the
--     top level, refusing BY NAME any key outside `public._rulebook_client_metadata_keys()`.
--     A sibling feature's key can no longer be lost by a caller that did not know it existed.
--   `metadata.coherence` -- the server lane's reading of the Expert's work, and the ONE key
--     `platform._touch_rulebook` treats as background, so a coherence-only write does not bump
--     `version`: a client's whole-column write could therefore land on top of one THE CAS
--     NEVER SAW. It is not in the client set at all. The Expert settling a question is still a
--     real client write, so it has its own surgical door, `rulebook_tension_settle`, which
--     rewrites ONE tension in place against the block as it stands at write time and cannot
--     produce `moot`, the machine's own state for a question whose rules were removed.
--   `version` -- owned by `platform._touch_rulebook`, which deliberately carries it FORWARD
--     when nothing an Expert or a reader can see moved. Three of the nine callers were passing
--     `version: nextVersion` as well: a second author for one column.
--   `status`, `slug`, `organization_id`, `created_by`, and every `source_*` column belonging to
--     the library-subscription path -- unreachable from any of the five doors.
--   `deleted_at` -- no longer a key of an edit patch. Archiving an Expert's book is its own
--     door at `std_delete`'s ADMIN rung.
--   and `updateRulebookMeta` used to pass the CALLER'S WHOLE PATCH OBJECT straight into an
--     UPDATE, so any key it happened to carry was written.
--
-- THE DOORS ARE UNAFFECTED BY THIS FILE. The table is owned by `postgres` and does NOT carry
-- FORCE ROW LEVEL SECURITY (read from pg_class, not assumed), and every door is a SECURITY
-- DEFINER function owned by `postgres`. `service_role` is untouched, which also covers
-- aidream's own lane -- including the Coherence Partner, whose writes to this row continue
-- exactly as they are. SELECT is untouched: this constrains INSERT, UPDATE and DELETE only,
-- and `platform_admin_all` is NOT dropped here, because it is a FOR ALL policy and therefore
-- the platform-staff READ policy too; the canonical route replaces it with its FOR SELECT twin
-- in the file that follows.
--
-- RESTRICTIVE, so it ANDs with every permissive policy present or future: no regeneration of
-- `std_insert` / `std_update` / `std_delete`, and no future hand-written permissive policy, can
-- re-open the write. The names are bespoke on purpose, so they are NOT in
-- `iam.generated_policy_names()` and `iam.apply_rls` preserves them across every regeneration
-- (DD-147).
--
-- ADDITIVE. Nothing is dropped, renamed or revoked. The write GRANTS are withdrawn by the
-- canonical route in doorsonly5_rulebook_leaves_the_pending_register.sql -- in a DECLARED
-- doors-only schema `iam.apply_table_grants` does that itself, which is why this lane's chair
-- step is a no-op (see chairstep_doorsonly5_revoke_client_writes.sql).
-- Inverse: migrations/inverse/doorsonly5_platform_rulebook_is_never_client_written.inverse.sql
-- Guard: `pnpm check:doors-only-schemas`, and the seated suite
--        scripts/campaign-tests/doorsonly5_rulebook_doors_work_from_a_seat.sql -v closed=1

set local lock_timeout = '2s';

create policy "rulebook_client_insert_refused" on platform.rulebook
  as restrictive for insert to authenticated, anon
  with check (false);

create policy "rulebook_client_update_refused" on platform.rulebook
  as restrictive for update to authenticated, anon
  using (false) with check (false);

create policy "rulebook_client_delete_refused" on platform.rulebook
  as restrictive for delete to authenticated, anon
  using (false);

comment on policy "rulebook_client_insert_refused" on platform.rulebook is 'DOORS-ONLY-5 2026-09-21: platform and iam are not client-writable through PostgREST -- every write goes through a SECURITY DEFINER door that decides through the one ladder; reads stay under RLS (VERIFIER-8 HIGH-3). THE METADATA COLUMN IS THE POINT HERE. Six features shared one jsonb on this table and every client writer replaced the WHOLE column from a row it had read; public.rulebook_save takes a PATCH and merges it, refusing by name any key outside public._rulebook_client_metadata_keys(). metadata.coherence -- the server lane`s reading of the Expert`s work, and the one key platform._touch_rulebook treats as background so it does not bump version -- is not in that set at all, because a client`s whole-column write could land on top of a coherence write the CAS never saw. The Expert settling a question is still a real client write and has its own surgical door, public.rulebook_tension_settle. public.rulebook_create stamps created_by from auth.uid() and a Rulebook is born draft with no rules by construction. Census: all NINE write call sites in five files were moved in the same commit, and every door was called from admin@admin.com`s seat (7/7) before this policy landed. RESTRICTIVE so it ANDs with every permissive policy present or future, and bespoke so iam.apply_rls preserves it (DD-147). The table is owned by postgres with no FORCE RLS, so every SECURITY DEFINER door is unaffected; service_role and SELECT are untouched, which also covers aidream`s Coherence Partner.';
comment on policy "rulebook_client_update_refused" on platform.rulebook is 'DOORS-ONLY-5 2026-09-21: platform and iam are not client-writable through PostgREST -- every write goes through a SECURITY DEFINER door that decides through the one ladder; reads stay under RLS (VERIFIER-8 HIGH-3). THE METADATA COLUMN IS THE POINT HERE. Six features shared one jsonb on this table and every client writer replaced the WHOLE column from a row it had read; public.rulebook_save takes a PATCH and merges it, refusing by name any key outside public._rulebook_client_metadata_keys(). metadata.coherence -- the server lane`s reading of the Expert`s work, and the one key platform._touch_rulebook treats as background so it does not bump version -- is not in that set at all, because a client`s whole-column write could land on top of a coherence write the CAS never saw. The Expert settling a question is still a real client write and has its own surgical door, public.rulebook_tension_settle, which rewrites ONE tension in place. version is owned by the touch trigger and three callers were a second author for it; status, slug, organization_id, created_by and every source_* column are unreachable from any door. Census: all NINE write call sites in five files were moved in the same commit, and every door was called from admin@admin.com`s seat (7/7) before this policy landed. RESTRICTIVE so it ANDs with every permissive policy present or future, and bespoke so iam.apply_rls preserves it (DD-147). The table is owned by postgres with no FORCE RLS; service_role and SELECT are untouched.';
comment on policy "rulebook_client_delete_refused" on platform.rulebook is 'DOORS-ONLY-5 2026-09-21: platform and iam are not client-writable through PostgREST -- every write goes through a SECURITY DEFINER door that decides through the one ladder; reads stay under RLS (VERIFIER-8 HIGH-3). Archiving an Expert`s book is its own door, public.rulebook_archive, at std_delete`s ADMIN rung -- never a `deleted_at` key inside the edit patch, which anybody at the editor rung could reach, and which is the defect DOORS-ONLY-3 closed on platform.flexible_data. Nothing under the Rulebook is destroyed: its rules, runs, sources and corpus items are untouched. Census: all NINE write call sites in five files were moved in the same commit, and every door was called from admin@admin.com`s seat (7/7) before this policy landed. RESTRICTIVE so it ANDs with every permissive policy present or future, and bespoke so iam.apply_rls preserves it (DD-147). The table is owned by postgres with no FORCE RLS; service_role and SELECT are untouched.';
