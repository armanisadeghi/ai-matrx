-- graveyard_ctx_junction_tables.sql
-- Applied during the canonical-model cutover (via Supabase MCP apply_migration).
--
-- Part 6 (decommission) — the REVERSIBLE form. Six of the seven legacy ctx_
-- junction tables are now fully off: FE has zero references, and every DB reader
-- (RLS policies, auth/context functions, the creator trigger) was repointed to
-- the canonical homes (iam.memberships / iam.invitations / platform.comments /
-- platform.associations). Verified zero live readers (functions, policies on
-- other tables, views, inbound FKs). All row data was backfilled to the
-- canonical tables earlier in the cutover.
--
-- Moving them to the `graveyard` schema removes them from the live `public` API
-- surface while preserving the data fully (recoverable: `alter table
-- graveyard.<t> set schema public`). This starts the soak period before any
-- eventual DROP. Their own RLS policies + triggers (incl. _mirror_assoc on
-- ctx_task_associations) move with them.
--
-- NOT included: ctx_scope_assignments (the 7th junction) — still read by
-- get_user_full_context and the scope/context track; the scope track retires it.
--
-- Also graveyarded here: the two DEAD cld_ user-group tables (cld_user_groups,
-- cld_user_group_members) — confirmed unused (0 rows, no inbound FKs, all app
-- code removed in the cld_ cutover). Per docs/db_rebuild/03 §1c/§4.
-- Idempotent (only moves tables still present in public).

create schema if not exists graveyard;

do $$
declare t text;
begin
  foreach t in array array[
    'ctx_project_members','ctx_project_invitations','ctx_task_comments',
    'ctx_task_associations','ctx_task_attachments','ctx_task_assignments',
    'cld_user_groups','cld_user_group_members'
  ]
  loop
    if to_regclass('public.'||t) is not null then
      execute format('alter table public.%I set schema graveyard', t);
      raise notice 'graveyarded public.% -> graveyard.%', t, t;
    end if;
  end loop;
end $$;
