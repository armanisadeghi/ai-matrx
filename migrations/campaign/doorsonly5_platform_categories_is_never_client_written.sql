-- lane: DOORS-ONLY-5
-- `platform` AND `iam` ARE NOT CLIENT-WRITABLE THROUGH PostgREST. (Chair ruling; VERIFIER-8
-- HIGH-3, 2026-09-21.) The LAST of the three tables DOORS-ONLY-4 left open in
-- `platform.doors_only_pending_cutover`, and the only one whose grants the canonical route
-- cannot withdraw.
--
-- platform.categories -- ONE TABLE, EVERY VOCABULARY IN THE PRODUCT, KEYED BY A TEXT COLUMN.
--
-- THE CENSUS. Every file naming this table was listed and then checked for ANY write verb
-- anywhere in it. Sixteen write call sites in eight files -- and the census's own finding is
-- that THREE OF THEM ARE NOT CLIENT WRITERS: `app/api/admin/feedback/categories/**` uses
-- `createAdminClient()` for its update and delete, which is `service_role`, and goes through
-- `svc_all`. Saying "sixteen" and closing thirteen would have been a census that counted rather
-- than read. THIRTEEN client write call sites moved to the doors in the same commit as this
-- file:
--
--   app/api/agent-shortcut-categories/route.ts                 1  insert
--   app/api/agent-shortcut-categories/[id]/route.ts            2  update, HARD delete
--   app/api/agent-shortcut-categories/[id]/duplicate/route.ts  1  insert
--   features/skills/redux/skillsThunks.ts                      3  insert, update, deactivate
--   components/admin/ContentBlocksManager.tsx                  3  insert, update, HARD delete
--   lib/services/agent-apps-admin-service.ts                   3  insert, update, HARD delete
--
-- (The five Next.js API routes that DO write as the person use `@/utils/supabase/server` -- the
-- caller's own cookie session, role `authenticated`. An API route is not an admin path.)
--
-- THE DOORS THEY NOW USE: `public.cat_write` and `public.cat_archive`, built in
-- doorsonly5_categories_gets_its_doors.sql, which resolve a row by (id, DIMENSION) together,
-- take a PATCH rather than replacing what they are not told, MERGE `metadata`, and soft-delete.
-- Both were called from admin@admin.com's SEAT, 8/8 green, BEFORE this file landed. The four
-- package doors (`cat_create`, `cat_update`, `cat_reparent`, `cat_delete`) are untouched: they
-- are the demanded RPC surface of the published `@ai-matrx/associations` and changing their
-- signatures is a package wave, not a migration.
--
-- 🚨 FOUR REAL DEFECTS CLOSED, and the middle two were live:
--   the DIMENSION was a wall nobody built -- five of the thirteen wrote `.eq("dimension", …)`
--     beside their `.eq("id", …)` BY HAND, which is the tell that they knew it was needed and
--     the database was not enforcing it; eight did not;
--   `components/admin/ContentBlocksManager.tsx:899-905` wrote `{ is_active }` over the whole
--     `metadata` jsonb and WIPED `legacy_table` with it, under a comment that called it a merge;
--   `features/skills/redux/skillsThunks.ts` built its metadata from the REDUX CACHE and said so
--     in a comment -- "the worst case is a race" -- which is a silent overwrite of anything
--     written to that row since the cache was filled;
--   THREE HARD `.delete()`s, on a table more than thirty tables carry a foreign key to, several
--     of them ON DELETE SET NULL and `agent.shortcut.category_id` ON DELETE CASCADE.
--
-- 🚨 THE GRANTS DO NOT COME OFF HERE, AND THIS TABLE IS THE ONE WHERE THAT IS TRUE.
-- In a DECLARED doors-only schema the canonical route withdraws the client write grants itself
-- (`iam.apply_table_grants`), which is how `saved_view` and `rulebook` cost zero RESIDUAL. This
-- table CANNOT take that route: `iam.apply_rls` REFUSES it by name -- DD-249 / R12, because it
-- holds 355 rows marked `visibility = 'public'` AND grants `anon` SELECT, while its class
-- `organization` emits no anonymous lane, and the generator refuses rather than silently
-- dropping the `pub_read` lane those readers are using. That anonymous read is an
-- access-semantics decision about who may read 355 rows, and it is not a lane's to take in
-- passing. So the withdrawal is a CHAIR STEP and it is written, unrun, as
-- migrations/campaign/chairstep_doorsonly5_revoke_categories_client_writes.sql.
--
-- THE DOORS ARE UNAFFECTED BY THIS FILE. The table is owned by `postgres` and does NOT carry
-- FORCE ROW LEVEL SECURITY, and every door is a SECURITY DEFINER function owned by `postgres`.
-- `service_role` is untouched, which covers the three feedback-route writes above and every
-- server lane. SELECT IS UNTOUCHED, and on this table that is load-bearing: `pub_read` is what
-- 355 public rows answer a signed-out visitor through, and the seated suite asserts that read
-- still answers after the closure.
--
-- RESTRICTIVE, so it ANDs with every permissive policy present or future, and bespoke so
-- `iam.apply_rls` preserves it across every regeneration (DD-147).
--
-- ADDITIVE. Nothing is dropped, renamed or revoked.
-- Inverse: migrations/inverse/doorsonly5_platform_categories_is_never_client_written.inverse.sql
-- Guard: `pnpm check:doors-only-schemas`, and the seated suite
--        scripts/campaign-tests/doorsonly5_categories_doors_work_from_a_seat.sql -v closed=1

set local lock_timeout = '2s';

create policy "categories_client_insert_refused" on platform.categories
  as restrictive for insert to authenticated, anon
  with check (false);

create policy "categories_client_update_refused" on platform.categories
  as restrictive for update to authenticated, anon
  using (false) with check (false);

create policy "categories_client_delete_refused" on platform.categories
  as restrictive for delete to authenticated, anon
  using (false);

comment on policy "categories_client_insert_refused" on platform.categories is 'DOORS-ONLY-5 2026-09-21: platform and iam are not client-writable through PostgREST -- every write goes through a SECURITY DEFINER door that decides through the one ladder; reads stay under RLS (VERIFIER-8 HIGH-3). THE DIMENSION IS A WALL NOBODY BUILT. This one table holds every vocabulary in the product -- feedback categories, agent-shortcut categories, skill categories, app categories, CRM pipelines and stages, HR reasons -- keyed only by the text column `dimension`, and std_insert/std_update say NOTHING about it. Five of the thirteen client writers wrote .eq("dimension", …) beside their .eq("id", …) BY HAND; eight did not. public.cat_write and public.cat_archive resolve a row by (id, dimension) TOGETHER, stamp created_by from auth.uid(), and refuse a SYSTEM category below super-admin. Census: thirteen client write call sites in six files moved in the same commit (three further sites in the feedback routes are service_role and were correctly left alone), and both doors were called from admin@admin.com`s seat before this policy landed. SELECT is untouched and on this table that is load-bearing: 355 rows marked visibility = public answer a signed-out visitor through pub_read, and the seated suite asserts that read still answers. RESTRICTIVE so it ANDs with every permissive policy present or future, and bespoke so iam.apply_rls preserves it (DD-147).';
comment on policy "categories_client_update_refused" on platform.categories is 'DOORS-ONLY-5 2026-09-21: platform and iam are not client-writable through PostgREST -- every write goes through a SECURITY DEFINER door that decides through the one ladder; reads stay under RLS (VERIFIER-8 HIGH-3). TWO LIVE DEFECTS CLOSED BY CONSTRUCTION. components/admin/ContentBlocksManager.tsx:899-905 wrote { is_active } over the WHOLE metadata jsonb and wiped legacy_table with it, under a comment calling it a merge; features/skills/redux/skillsThunks.ts built its metadata from the Redux cache and admitted in a comment that "the worst case is a race", which is a silent overwrite of anything written to that row since the cache was filled. public.cat_write takes a PATCH -- every optional column has its own p_set_* flag, so changing a name cannot erase a colour the caller never mentioned -- and MERGES metadata inside the database, so only the keys that changed are ever sent. It also resolves the row by (id, dimension) together, which is what five of the thirteen callers were doing by hand. organization_id, dimension, is_system and created_by are unreachable on update. RESTRICTIVE and bespoke (DD-147); SELECT and service_role untouched.';
comment on policy "categories_client_delete_refused" on platform.categories is 'DOORS-ONLY-5 2026-09-21: platform and iam are not client-writable through PostgREST -- every write goes through a SECURITY DEFINER door that decides through the one ladder; reads stay under RLS (VERIFIER-8 HIGH-3). THREE OF THE THIRTEEN CALLERS RAN A HARD .delete() while every sibling soft-deleted -- on a table more than THIRTY tables carry a foreign key to, several of them ON DELETE SET NULL and agent.shortcut.category_id ON DELETE CASCADE, so destroying a category silently NULLed a live column on every row that named it, or took the rows themselves. public.cat_archive soft-deletes, at std_delete`s ADMIN rung plus the is_system super-admin arm, and resolves the row by (id, dimension) together. RESTRICTIVE and bespoke (DD-147); SELECT and service_role untouched.';
