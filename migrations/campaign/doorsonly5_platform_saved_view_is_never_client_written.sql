-- lane: DOORS-ONLY-5
-- `platform` AND `iam` ARE NOT CLIENT-WRITABLE THROUGH PostgREST. (Chair ruling; VERIFIER-8
-- HIGH-3, 2026-09-21.) This is one of the three tables DOORS-ONLY-4 left deliberately open,
-- recorded as a row in `platform.doors_only_pending_cutover` so the generator ANNOUNCED the
-- debt instead of closing it by accident — which it had done once, for eleven minutes, and
-- which is the whole reason that register exists.
--
-- platform.saved_view — ONE TABLE, EVERY LIST SURFACE IN TWO APPS, MULTIPLEXED BY A KEY NO
-- POLICY EVER LOOKED AT.
--
-- THE CENSUS, taken the way DOORS-ONLY-2 learned to take it: every file naming this table
-- across matrx-frontend and aidream was listed, and then each file was checked for ANY write
-- verb ANYWHERE in it — not only beside the `.from(`, which is the shape that hides a writer
-- reaching the table through a `function db() { return supabase.schema("platform") }` helper
-- thirty lines above. SEVENTEEN write call sites in five files across two repos, and ALL
-- SEVENTEEN moved to the doors in the same commit as this file:
--
--   features/crm/saved-views/service.ts                            4
--   features/data-tables/saved-views/service.ts                    6
--   components/official/table-saved-views-service.ts               2
--   aidream apps/dashboard/src/hooks/use-saved-views.ts            3
--   aidream apps/dashboard/src/components/data-table/table-saved-views-service.ts  2
--
-- THE DOORS THEY NOW USE: `public.saved_view_save`, `public.saved_view_set_default` and
-- `public.saved_view_archive`, built in doorsonly5_saved_view_gets_its_doors.sql and
-- schema-qualified in doorsonly5_the_saved_view_doors_qualify_their_types.sql. Every one was
-- CALLED FROM admin@admin.com's SEAT, 6/6 green, BEFORE this file landed — the order
-- DOORS-ONLY-3 §3 paid for when four doors shipped unexercised and 400'd on their first real
-- caller.
--
-- 🚨 WHAT STOPPED BEING REACHABLE, and none of it is expressible as a policy. A table UPDATE
-- grant is all-or-nothing over the row:
--
--   `surface_key`  — the multiplexing key. `std_update` is `created_by = auth.uid() OR
--                    has_access(..., 'editor')` and says NOTHING about which surface a row
--                    belongs to, so a caller holding an id could move a CRM smart view under
--                    the data-table surface's key, or overwrite a row belonging to a surface
--                    they have never opened. Each door resolves the row by (id, surface_key)
--                    TOGETHER; a row under another key reads as absent.
--   `created_by`   — stamped from `auth.uid()` inside the door. The INSERT grant let a browser
--                    author a row in somebody else's name as long as the WITH CHECK was the
--                    only thing looking.
--   `version`      — owned by the `_touch_row` BEFORE UPDATE trigger. Three of the seventeen
--                    callers were writing it themselves, a second author for a column the
--                    trigger already owns.
--   `metadata`, `custom_fields`, `created_at`, `updated_at`, and `organization_id` on update —
--                    a view can no longer be moved between organizations from a browser.
--   `deleted_at`   — no longer a key of the edit patch. Archiving is its own door at
--                    `std_delete`'s ADMIN rung, so nobody at the editor rung can remove a view
--                    by putting a timestamp in an object. That is the same defect DOORS-ONLY-3
--                    closed on `platform.flexible_data`.
--
-- THE DOORS ARE UNAFFECTED BY THIS FILE. The table is owned by `postgres` and does NOT carry
-- FORCE ROW LEVEL SECURITY (read from pg_class, not assumed), and every door is a SECURITY
-- DEFINER function owned by `postgres`. The owner is not subject to these policies, so no door,
-- trigger, event trigger or server path changes behaviour. `service_role` is untouched, which
-- also covers aidream's own lane. SELECT is untouched: this constrains INSERT, UPDATE and
-- DELETE only. (This table carries no `platform_admin_all` at all — checked on the live
-- database, not assumed — so there is nothing here to keep or retire.)
--
-- RESTRICTIVE, so it ANDs with every permissive policy present or future: no regeneration of
-- `std_insert` / `std_update` / `std_delete`, and no future hand-written permissive policy, can
-- re-open the write. The names are bespoke on purpose, so they are NOT in
-- `iam.generated_policy_names()` and `iam.apply_rls` preserves them across every regeneration
-- (DD-147).
--
-- ADDITIVE. Nothing is dropped, renamed or revoked. The dead GRANT that remains is a chair
-- step, because `platform` and `iam` are REVOKE-protected schemas
-- (scripts/lib/migration-target.ts REVOKE_PROTECTED_SCHEMAS) — and, separately, the
-- `doors_only_pending_cutover` row is deleted and the table regenerated through the canonical
-- route in doorsonly5_saved_view_leaves_the_pending_register.sql, which withdraws the write
-- grants through `iam.apply_table_grants` rather than by hand.
-- Inverse: migrations/inverse/doorsonly5_platform_saved_view_is_never_client_written.inverse.sql
-- Guard: `pnpm check:doors-only-schemas`, and the seated suite
--        scripts/campaign-tests/doorsonly5_saved_view_doors_work_from_a_seat.sql -v closed=1

set local lock_timeout = '2s';

create policy "saved_view_client_insert_refused" on platform.saved_view
  as restrictive for insert to authenticated, anon
  with check (false);

create policy "saved_view_client_update_refused" on platform.saved_view
  as restrictive for update to authenticated, anon
  using (false) with check (false);

create policy "saved_view_client_delete_refused" on platform.saved_view
  as restrictive for delete to authenticated, anon
  using (false);

comment on policy "saved_view_client_insert_refused" on platform.saved_view is 'DOORS-ONLY-5 2026-09-21: platform and iam are not client-writable through PostgREST -- every write goes through a SECURITY DEFINER door that decides through the one ladder; reads stay under RLS (VERIFIER-8 HIGH-3). THE SURFACE KEY IS THE POINT HERE. platform.saved_view is ONE table for every list surface in two apps, multiplexed by surface_key, and std_update (created_by = auth.uid() OR has_access(..., editor)) says nothing at all about which surface a row belongs to -- so a caller holding an id could write a row under a surface key it does not own and every reader of that surface would then parse a definition written for a different one. public.saved_view_save / saved_view_set_default / saved_view_archive resolve the row by (id, surface_key) TOGETHER, stamp created_by from auth.uid(), leave version to the trigger that owns it, and put archiving at std_delete`s admin rung instead of letting deleted_at be a key of the edit patch. Census: all SEVENTEEN write call sites in five files across matrx-frontend and aidream were moved in the same commit, and every door was called from admin@admin.com`s seat before this policy landed. RESTRICTIVE so it ANDs with every permissive policy present or future, and bespoke so iam.apply_rls preserves it (DD-147). The table is owned by postgres with no FORCE RLS, so every SECURITY DEFINER door is unaffected; service_role and SELECT are untouched.';
comment on policy "saved_view_client_update_refused" on platform.saved_view is 'DOORS-ONLY-5 2026-09-21: platform and iam are not client-writable through PostgREST -- every write goes through a SECURITY DEFINER door that decides through the one ladder; reads stay under RLS (VERIFIER-8 HIGH-3). THE SURFACE KEY IS THE POINT HERE. platform.saved_view is ONE table for every list surface in two apps, multiplexed by surface_key, and std_update (created_by = auth.uid() OR has_access(..., editor)) says nothing at all about which surface a row belongs to -- so a caller holding an id could write a row under a surface key it does not own and every reader of that surface would then parse a definition written for a different one. public.saved_view_save / saved_view_set_default / saved_view_archive resolve the row by (id, surface_key) TOGETHER, stamp created_by from auth.uid(), leave version to the trigger that owns it, and put archiving at std_delete`s admin rung instead of letting deleted_at be a key of the edit patch. Census: all SEVENTEEN write call sites in five files across matrx-frontend and aidream were moved in the same commit, and every door was called from admin@admin.com`s seat before this policy landed. RESTRICTIVE so it ANDs with every permissive policy present or future, and bespoke so iam.apply_rls preserves it (DD-147). The table is owned by postgres with no FORCE RLS, so every SECURITY DEFINER door is unaffected; service_role and SELECT are untouched.';
comment on policy "saved_view_client_delete_refused" on platform.saved_view is 'DOORS-ONLY-5 2026-09-21: platform and iam are not client-writable through PostgREST -- every write goes through a SECURITY DEFINER door that decides through the one ladder; reads stay under RLS (VERIFIER-8 HIGH-3). THE SURFACE KEY IS THE POINT HERE. platform.saved_view is ONE table for every list surface in two apps, multiplexed by surface_key, and std_delete says nothing at all about which surface a row belongs to. public.saved_view_archive resolves the row by (id, surface_key) TOGETHER and sits at std_delete`s ADMIN rung deliberately -- archiving is its own arm, not a deleted_at key inside the edit patch that anybody at the editor rung could reach, which is the defect DOORS-ONLY-3 closed on platform.flexible_data. Census: all SEVENTEEN write call sites in five files across matrx-frontend and aidream were moved in the same commit, and every door was called from admin@admin.com`s seat before this policy landed. RESTRICTIVE so it ANDs with every permissive policy present or future, and bespoke so iam.apply_rls preserves it (DD-147). The table is owned by postgres with no FORCE RLS, so every SECURITY DEFINER door is unaffected; service_role and SELECT are untouched.';
