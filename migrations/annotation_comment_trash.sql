-- based-on: public.cmt_restore(uuid) 78ba975b447dbeddf0678ec5b935ce64070226420646b451972392c1591a0e51
-- based-on: public.entity_undelete(text, uuid) 6abfa596e367cb7bd9bcd3ff2edd42c23689511fe5f1fd3b25f278b92f203a6d
-- First applied through the Supabase MCP on 2026-09-26 (same statements); this file is idempotent and
-- is applied once more through `pnpm db:apply` so the ledger records the bytes that ran.
-- Passage comments on /trash, restorable (soft-delete law: anything important can be archived and
-- restored, never lost). Found 2026-09-26: platform.comments soft-deletes (cmt_delete) but no UI
-- could bring one back — not /trash, not the Notes & comments panel, no undo.
--
-- 1. Register the kind with THE trash registry: public._trash_kind_rows lists every
--    platform.entity_types row with a user_artifact_kind, owner = created_by, title = body.
--    Suggestions and thread replies are rows of the same table, so they come with it.
-- 2. Its own restore door (server-only: reached through entity_undelete), the twin of cmt_delete: the same people may bring a comment back —
--    its author (who can still see the record it is on) or an admin of that record. Access
--    follows the parent through platform.detail_parent_access, exactly as delete does.
-- 3. public.entity_undelete (the door /trash already calls) routes token 'comment' through it,
--    like folder / scope / mandate / team. No RLS change.
--
-- The existing _announce_delete trigger broadcasts comment.restored, so open documents re-read.
-- Client: matrx-frontend features/rich-document/annotations (Undo on the delete toast) + /trash.

update platform.entity_types
   set user_artifact_kind = 'comment'
 where token = 'comment' and user_artifact_kind is null;

create or replace function public.cmt_restore(p_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  -- The restore twin of cmt_delete (same rungs): the author, while they can still see the record the
  -- comment is on, or an admin of that record.
  update platform.comments c
     set deleted_at = null, updated_by = (select auth.uid())
   where c.id = p_id and c.deleted_at is not null
     and ((c.created_by = (select auth.uid())
           and platform.detail_parent_access(c.entity_type, c.entity_id, 'viewer'::public.permission_level))
          or platform.detail_parent_access(c.entity_type, c.entity_id, 'admin'::public.permission_level));
  if not found then
    raise exception 'cmt_restore: this comment is not in the trash, or you may not restore it -- its author may, and so may an admin of the record it is on'
      using errcode = '42501';
  end if;
end $function$;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by, non_client_lane, signed_in_callers, anonymous_callers)
values
  ('public', 'cmt_restore', 'p_id uuid', array['uuid'::regtype]::oid[],
   'Restore twin of cmt_delete. p_id is the comment; the decision resolves against the comment''s own row: its author (who must still have viewer access to the parent record, platform.detail_parent_access) or an admin of the parent record. A NULL p_id matches no row and raises 42501. Reached from entity_undelete(''comment'', id) — /trash and the delete toast''s Undo.',
   'annotation_comment_trash (matrx-frontend migrations)',
   'server_only: reached only from public.entity_undelete(''comment'', id) — the /trash Restore and the delete toast''s Undo — which runs as its owner; no client calls it directly.',
   false, false)
on conflict do nothing;

do $do$
declare
  d text;
begin
  d := pg_get_functiondef('public.entity_undelete(text,uuid)'::regprocedure);
  if position('when ''comment'' then' in d) > 0 then
    return;
  end if;
  d := replace(d,
    $r$    when 'team' then perform public.team_restore(p_id); return true;$r$,
    $r$    when 'team' then perform public.team_restore(p_id); return true;
    -- A passage comment (and its suggestion / reply rows) comes back through its own door: author or record admin.
    when 'comment' then perform public.cmt_restore(p_id); return true;$r$);
  if position('when ''comment'' then' in d) = 0 then
    raise exception 'entity_undelete changed shape: the comment door was not inserted — re-read the function and add it by hand';
  end if;
  execute d;
end
$do$;
