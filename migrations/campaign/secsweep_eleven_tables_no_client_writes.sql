-- lane: SECURITY-SWEEP
-- Chair ruling 4, the `user_id`-beside-`created_by` set: "if the column names the CALLER, pin
-- to auth.uid(); if only a server or a door should write it, withdraw the client write."
--
-- ELEVEN TABLES WHERE THE ANSWER IS "WITHDRAW", because no client writes them at all. Each
-- carries a `user_id` the generated `std_insert` / `std_update` policy pins `created_by` but
-- says nothing about — the exact shape of CRITICAL-1, where `created_by` was pinned two lines
-- from the column that decided who somebody was.
--
-- THE CENSUS, and it is not a `.from()` count — a `.from()` count is not proof and this lane
-- has already been bitten by one. Every name below was grepped as a bare string across
-- matrx-frontend (features, app, lib, components, packages), matrx-extend and matrx-local:
--
--   dictionary.dict_entries, dictionary.dict_settings
--       `features/dictionary/service/dictionaryService.ts` says so in its own header — "Every
--       read/write of dict_entries / dict_settings + the dict_* RPCs goes [through here]" —
--       and the file contains no `.from()` at all: `dict_list_owners`, `dict_list_entries`,
--       `dict_upsert_entries`, `dict_delete_entries`, `dict_get_settings`, `dict_resolve`.
--       The doors already exist and are the only path.
--   canvas.canvas_comments, canvas_likes, canvas_views, canvas_scores, canvas_comment_likes
--       ZERO files in any client repo mention these names. The canvas feature reaches
--       `canvas_items` (20 call sites), `canvas_item_state` and `shared_canvas_items` and
--       nothing else — and `features/canvas/shared/canvasViewTracking.ts` says out loud that
--       viewers "have no actor and must never attempt a direct insert into
--       canvas.canvas_views."
--   public.app_settings, public.app_sync_status, users.user_bookmarks
--       ZERO mentions anywhere.
--   users.user_stats
--       Two mentions, both about the DEPRECATED `get_user_stats` RPC that
--       `get_user_dashboard_metrics()` replaced (`features/dashboard/FEATURE.md`). Nothing
--       reads or writes the table.
--
-- `service_role` (the `svc_all` policy) and every SECURITY DEFINER door run as the table owner
-- and are untouched, so the `dict_*` family keeps working unchanged. Reads stay under RLS —
-- only the write door closes.
--
-- RESTRICTIVE, with bespoke names deliberately absent from `iam.generated_policy_names()`, so
-- `iam.apply_rls` preserves them across every regeneration (DD-147).
--
-- ADDITIVE. Nothing is dropped, renamed or revoked.
-- Inverse: migrations/inverse/secsweep_eleven_tables_no_client_writes.inverse.sql
-- Guard: `pnpm check:unpinned-security-columns` — a table closed by a restrictive refusal
-- yields no findings, so all eleven leave the baseline.

do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('dictionary','dict_entries'),
      ('dictionary','dict_settings'),
      ('canvas','canvas_comments'),
      ('canvas','canvas_likes'),
      ('canvas','canvas_views'),
      ('canvas','canvas_scores'),
      ('canvas','canvas_comment_likes'),
      ('public','app_settings'),
      ('public','app_sync_status'),
      ('users','user_bookmarks'),
      ('users','user_stats')
    ) as t(schema_name, table_name)
  loop
    execute format(
      'create policy %I on %I.%I as restrictive for insert to authenticated, anon with check (false)',
      r.table_name || '_client_insert_refused', r.schema_name, r.table_name);
    execute format(
      'create policy %I on %I.%I as restrictive for update to authenticated, anon using (false) with check (false)',
      r.table_name || '_client_update_refused', r.schema_name, r.table_name);
    execute format(
      'create policy %I on %I.%I as restrictive for delete to authenticated, anon using (false)',
      r.table_name || '_client_delete_refused', r.schema_name, r.table_name);
    execute format(
      'comment on policy %I on %I.%I is %L',
      r.table_name || '_client_insert_refused', r.schema_name, r.table_name,
      'SECURITY-SWEEP 2026-09-21, chair ruling 4. This table carries a user_id the generated policy set pins nothing about — the CRITICAL-1 shape — and no client code in matrx-frontend, matrx-extend or matrx-local writes it at all; its writers are SECURITY DEFINER doors or the server. RESTRICTIVE so no permissive policy can re-open it; bespoke on purpose, so iam.apply_rls preserves it. Reads are untouched.');
    raise notice 'secsweep: %.% no longer takes a client write', r.schema_name, r.table_name;
  end loop;
end $$;
