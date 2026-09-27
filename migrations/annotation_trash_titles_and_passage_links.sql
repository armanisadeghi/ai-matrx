-- draft: claude selection-toolbar lane — ready for the chair to apply (written 2026-09-26; NOT applied by the lane)
-- based-on: public._trash_kind_rows(uuid, uuid, uuid, text[], integer, integer) 0835054e6d20a37358915f86893c954bc4c9a4aa978f639216f9f43180db67af
-- based-on: public._trash_kind_counts(uuid, uuid, uuid) d6b74549441ec1b4d263f8bf13cf5cbf37432dc2de08f22e08f13454c1e20fe8
-- based-on: public.entity_undelete(text, uuid) 6abfa596e367cb7bd9bcd3ff2edd42c23689511fe5f1fd3b25f278b92f203a6d
-- based-on: public.cmt_restore(uuid) 78ba975b447dbeddf0678ec5b935ce64070226420646b451972392c1591a0e51
--
-- Two gaps in annotation trash (soft-delete law: anything important can be restored, never lost):
--
-- 1. TITLES. /trash titles a comment by `body`, so a suggestion with no "why" and an anchored
--    comment with an empty body render blank. platform.comment_trash_title(row) is THE title rule
--    for the comment kind: a suggestion shows "Suggested: <replacement>" or else its quoted
--    passage; a comment shows its body or else its quote; a last resort names the record it is on.
--    _trash_kind_rows uses it for token 'comment'. Never empty (coalesce ends in a literal).
--
-- 2. PASSAGE LINKS. A detached passage link (platform.associations, role 'anchored_to') is
--    soft-deleted with no way back but its toast. It becomes the filtered trash kind
--    'passage_link' — ONLY anchored_to rows the person made, and only ones removed on their own
--    (deleted_via_type null: a link archived with its record comes back with that record). The rest
--    of platform.associations never reaches /trash. Title: the linked record's name and the quoted
--    passage (platform.passage_link_trash_title). Restore: entity_undelete('passage_link', id) →
--    public.passage_link_restore → public.assoc_add with the row's own endpoints, role and payload —
--    the SAME authority a new link needs, reviving the tombstone in place (same id).
--
-- 3. A REPLY UNDER A DELETED COMMENT. Measured live 2026-09-26: restoring only the reply from /trash
--    cleared its deleted_at, took it off /trash, and left it visible NOWHERE (its thread was still
--    deleted) — a restore that says yes and shows nothing. The honest behaviour: a reply comes back
--    WITH its thread. cmt_restore restores the parent comment first (same rungs for the parent); a
--    caller who may not restore the parent is refused with a sentence that says so, and nothing
--    changes. On /trash a reply is titled "Reply: …".
--
-- 4. THE GUARD'S READ. platform.trash_annotation_title_census() (invoker, read-only) counts, per
--    annotation trash kind, the trashed rows whose title would render empty. matrx-frontend
--    `pnpm check:annotation-trash` reads it and fails on any non-zero count or a missing kind.
--
-- Counts (_trash_kind_counts) mirror the listing row for row. Passage links are PERSONAL-trash only:
-- public.org_trash_restore resolves tokens through platform.entity_types, where 'passage_link' has no
-- row, so listing them in Organization Trash would draw a Restore that refuses. Adding them there is
-- a follow-up (a passage_link branch in org_trash_restore).

create or replace function platform.comment_trash_title(c platform.comments)
 returns text
 language sql
 stable
 set search_path to 'platform', 'public'
as $function$
  select case when c.parent_id is not null then 'Reply: ' else '' end || coalesce(
    case
      when c.suggested_text is not null then
        coalesce('Suggested: ' || nullif(btrim(c.suggested_text), ''),
                 'Suggested removal of “' || nullif(btrim(c.anchor ->> 'exact'), '') || '”')
      else
        coalesce(nullif(btrim(c.body), ''),
                 '“' || nullif(btrim(c.anchor ->> 'exact'), '') || '”')
    end,
    'Comment on ' || coalesce(nullif(btrim(platform.entity_title(c.entity_type, c.entity_id)), ''), 'a record')
  );
$function$;

create or replace function platform.passage_link_trash_title(a platform.associations)
 returns text
 language sql
 stable
 set search_path to 'platform', 'public'
as $function$
  select coalesce(nullif(btrim(platform.entity_title(a.source_type, a.source_id)), ''), 'A linked record')
         || coalesce(' — “' || nullif(btrim(left(a.payload ->> 'exact', 120)), '') || '”', '');
$function$;

create or replace function public.cmt_restore(p_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_parent uuid;
begin
  -- A reply comes back WITH its thread: an archived parent comment is restored first, through this
  -- same door and its same rungs. If the caller may not restore the parent, nothing changes.
  select c.parent_id into v_parent
    from platform.comments c
   where c.id = p_id and c.deleted_at is not null;
  if v_parent is not null and exists (select 1 from platform.comments p where p.id = v_parent and p.deleted_at is not null) then
    begin
      perform public.cmt_restore(v_parent);
    exception when sqlstate '42501' then
      raise exception 'cmt_restore: this reply belongs to a comment that is deleted, and you may not restore that comment -- ask its author or an admin of the record to restore it first'
        using errcode = '42501';
    end;
  end if;
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

create or replace function public.passage_link_restore(p_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  a platform.associations;
begin
  select * into a from platform.associations x
   where x.id = p_id and x.role = 'anchored_to' and x.deleted_at is not null;
  if not found then
    raise exception 'passage_link_restore: this passage link is not in the trash' using errcode = '42501';
  end if;
  -- The same door a new link goes through: its authority decision, reviving THIS row in place.
  perform public.assoc_add(a.source_type, a.source_id, a.target_type, a.target_id, a.organization_id,
                           a.label, a.metadata, a.role, a.position, a.payload_kind, a.payload);
end $function$;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by, non_client_lane, signed_in_callers, anonymous_callers)
values
  ('public', 'passage_link_restore', 'p_id uuid', array['uuid'::regtype]::oid[],
   'p_id is the archived passage link (platform.associations, role anchored_to). No decision of its own: it re-runs public.assoc_add with the row''s endpoints, which applies the SAME authority a new link needs (editor on one endpoint, viewer on the other; editor on both for a conveying edge). NULL p_id matches no row and raises 42501.',
   'annotation_trash_titles_and_passage_links (matrx-frontend migrations)',
   'server_only: reached only from public.entity_undelete(''passage_link'', id) — the /trash Restore — which runs as its owner; no client calls it directly.',
   false, false)
on conflict do nothing;

create or replace function platform.trash_annotation_title_census()
 returns table(kind text, trashed bigint, empty_titles bigint)
 language sql
 stable
 set search_path to 'platform', 'public'
as $function$
  select 'comment'::text, count(*),
         count(*) filter (where coalesce(btrim(platform.comment_trash_title(c)), '') = '')
    from platform.comments c where c.deleted_at is not null
  union all
  select 'passage_link'::text, count(*),
         count(*) filter (where coalesce(btrim(platform.passage_link_trash_title(a)), '') = '')
    from platform.associations a
   where a.role = 'anchored_to' and a.deleted_at is not null and a.deleted_via_type is null;
$function$;

do $do$
declare
  d text;
  anchor_title text := $a$      v_title_expr := case when v_title is null then 'null::text' else format('left(t.%I::text, 200)', v_title) end;$a$;
  anchor_store text := $a$  if to_regclass('custom.record') is null then return; end if;$a$;
  passage_rows text := $a$  -- ── PASSAGE LINKS (annotation trash) ─────────────────────────────────────────────────────────
  -- Only anchored_to associations the person made, removed on their own; personal Trash only (see
  -- the file header). The rest of platform.associations never reaches /trash.
  if p_kinds is null or 'passage_link' = any (p_kinds) then
    return query
    select 'passage_link'::text, 'passage_link'::text, 'Passage link'::text, a.id,
           left(platform.passage_link_trash_title(a), 200),
           a.deleted_at, a.organization_id, (a.created_by = p_uid), a.created_by
      from platform.associations a
     where a.role = 'anchored_to' and a.deleted_at is not null and a.deleted_via_type is null
       and p_org is null and a.created_by = p_uid
     order by a.deleted_at desc, a.id
     limit v_limit offset v_offset;
  end if;

$a$;
  passage_counts text := $a$  -- ── PASSAGE LINKS — the same predicate as _trash_kind_rows ─────────────────────────────────
  select count(*) into v_n from platform.associations a
   where a.role = 'anchored_to' and a.deleted_at is not null and a.deleted_via_type is null
     and p_org is null and a.created_by = p_uid;
  if v_n > 0 then
    artifact_kind := 'passage_link'; label := 'Passage link'; n := v_n; return next;
  end if;

$a$;
  undelete_top text := $a$  if p_token = 'record' then$a$;
begin
  -- 1+2. the listing
  d := pg_get_functiondef('public._trash_kind_rows(uuid,uuid,uuid,text[],integer,integer)'::regprocedure);
  if position('comment_trash_title' in d) = 0 then
    if (length(d) - length(replace(d, anchor_title, ''))) / length(anchor_title) <> 1
       or (length(d) - length(replace(d, anchor_store, ''))) / length(anchor_store) <> 1 then
      raise exception '_trash_kind_rows changed shape: re-read it and place the comment title rule and the passage-link section by hand';
    end if;
    d := replace(d, anchor_title, anchor_title || $a$
      -- The comment kind's title rule (a suggestion shows its replacement, a comment its body, else the quote).
      if rec.token = 'comment' then v_title_expr := 'left(platform.comment_trash_title(t), 200)'; end if;$a$);
    d := replace(d, anchor_store, passage_rows || anchor_store);
    execute d;
  end if;

  -- counts
  d := pg_get_functiondef('public._trash_kind_counts(uuid,uuid,uuid)'::regprocedure);
  if position('PASSAGE LINKS' in d) = 0 then
    if (length(d) - length(replace(d, anchor_store, ''))) / length(anchor_store) <> 1 then
      raise exception '_trash_kind_counts changed shape: re-read it and place the passage-link count by hand';
    end if;
    d := replace(d, anchor_store, passage_counts || anchor_store);
    execute d;
  end if;

  -- restore
  d := pg_get_functiondef('public.entity_undelete(text,uuid)'::regprocedure);
  if position('passage_link_restore' in d) = 0 then
    if (length(d) - length(replace(d, undelete_top, ''))) / length(undelete_top) <> 1 then
      raise exception 'entity_undelete changed shape: re-read it and add the passage-link door by hand';
    end if;
    d := replace(d, undelete_top, $a$  -- A passage link (anchored_to association) is a filtered trash kind with its own door.
  if p_token = 'passage_link' then
    perform public.passage_link_restore(p_id);
    return true;
  end if;

$a$ || undelete_top);
    execute d;
  end if;
end
$do$;
