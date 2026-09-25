-- chair-step: rule-27 rehearsal inverse of rcb11_comment_collaboration_doors.sql — restores the LIVE
-- cmt_add / cmt_list / cmt_edit bodies it replaced (cmt_add as RC-A2b left it: the detail-type refusal
-- first, commenter on the record before any lookup), drops the two mention doors, the comment.mention
-- event type, and the three columns + index + check it added. Access predicates are the live ones,
-- verbatim. The association pairs document→note and fc_card→note are NOT removed: they were live
-- before the up file ran (its insert is `on conflict do nothing`).
-- The live bodies it restores were copied from pg_get_functiondef on production 2026-09-25
-- (cmt_add 4f69b218…, cmt_list 8bf23bcb…, cmt_edit f46ae8a8… — the up file's based-on lines).
-- It replaces the bodies the up file creates (hashes measured on the clone after the up):
-- based-on: public.cmt_add(text, uuid, text, uuid, uuid, jsonb, text, uuid) 0fb127e05c06fe80ef660eec998fc46d2f6d699c716241934b6a8455e3f5631f
-- based-on: public.cmt_list(text, uuid) a03f1a0e2fefbdd5fabc1c6471a13f94f5c27fbf771e8708d424e05a35ec5660
-- based-on: public.cmt_edit(uuid, text, integer) effd9a4c72ff9a413f6a104b414f62eddb4f37d42d1fb58877b4d56b54d1da44

set local lock_timeout = '2s';

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. The mention doors and their event type
-- ─────────────────────────────────────────────────────────────────────────────
delete from platform.client_callable_door
 where schema_name = 'public' and function_name in ('cmt_mention_candidates', 'cmt_mention_notify');
drop function if exists public.cmt_mention_notify(uuid, uuid[], text);
drop function if exists public.cmt_mention_candidates(text, uuid, text, integer);
delete from communication.notification_event_type where event_key = 'comment.mention';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. cmt_add — back to the five-argument live body (RC-A2b)
-- ─────────────────────────────────────────────────────────────────────────────
drop function public.cmt_add(text, uuid, text, uuid, uuid, jsonb, text, uuid);

CREATE OR REPLACE FUNCTION public.cmt_add(p_entity_type text, p_entity_id uuid, p_body text, p_parent_id uuid DEFAULT NULL::uuid, p_org_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org uuid := p_org_id;
  v_scoped boolean;
  v_entity_org uuid;
  v_named boolean := p_org_id is not null;
  v_id uuid;
begin
  -- 🚨 RC-A2b (2026-09-25): a comment is never the record a comment is on. A reply goes through
  -- the record's own thread (p_parent_id). Refused by TYPE, before any lookup, so it confirms
  -- nothing about any id (verify-RC-A2 F3).
  if exists (select 1 from platform.entity_types et
              where et.token = p_entity_type and et.rls_variant = 'detail') then
    raise exception 'cmt_add: a comment cannot be filed on a % — reply in its thread instead: cmt_add(<the record type>, <the record id>, body, p_parent_id => <the comment id>)',
      p_entity_type using errcode = '22023';
  end if;
  -- Deny before resolving organization or looking up the row. A missing ID and
  -- somebody else's private ID must take the same 42501 path; otherwise this
  -- SECURITY DEFINER door becomes a record-existence oracle (RC-A2 review).
  if not iam.has_access(p_entity_type, p_entity_id, 'commenter'::public.permission_level) then
    raise exception 'cmt_add: you cannot comment on this record (%/%) -- commenting needs the commenter level on it. Ask its owner to share it with you at commenter or above.',
      p_entity_type, p_entity_id
      using errcode = '42501';
  end if;

  -- The record answers first, for EVERY registered type -- not only `task`.
  v_scoped := platform.entity_is_org_scoped(p_entity_type);
  if v_scoped then
    v_entity_org := platform.entity_organization_id(p_entity_type, p_entity_id);
  end if;

  if v_org is null then
    v_org := v_entity_org;
  end if;

  -- No organization from the caller and none from the record: REFUSE. The author's own
  -- workspace is not an answer to "where does this comment belong" -- it is a place the
  -- record's organization can never read.
  if v_org is null then
    raise exception 'cmt_add: nothing named the organization this comment belongs to. The record (%/%) did not answer -- either its entity type is not organization-scoped or the row does not exist. Remedy: pass p_org_id, the organization you are acting in.',
      p_entity_type, p_entity_id
      using errcode = '23502';
  end if;

  -- An organization the CALLER names must be one the caller belongs to, asked before anything
  -- about the record is compared with it -- otherwise the 22023 below would answer "is record R
  -- in organization X?" for any X. A caller who names nothing is asked nothing here: commenter
  -- on the record, below, is the whole question (a share can reach a person outside the
  -- organization). The organization is echoed only when the CALLER named it.
  if v_named and not iam.has_org_access(v_org) then
    raise exception 'cmt_add: no org access (org=%, %/%)', v_org, p_entity_type, p_entity_id
      using errcode = '42501';
  end if;

  -- THE ENTITY AND THE PARENT ARE ARGUMENTS TOO (0850). The record must live in the
  -- organization the comment is filed in.
  if v_scoped and v_entity_org is distinct from v_org then
    raise exception 'cmt_add: entity not found in this organization' using errcode = '22023';
  end if;
  -- 🚨 RC-A2 (2026-09-23): THE RECORD DECIDES WHO MAY COMMENT ON IT. Until this line the
  -- only question was iam.has_org_access, so any member of an organization could comment on
  -- any record in it -- a colleague's PERSONAL note included -- and read the thread back
  -- through cmt_list. A comment is a Detail of its record (rich-content STORE-DESIGN §3.8):
  -- adding one needs COMMENTER on the record, which a share can confer on somebody outside
  -- the organization and which organization membership alone never confers on a private
  -- record. That check ran before any row lookup above, including for a missing ID.

  if p_parent_id is not null and not exists (
       select 1 from platform.comments parent
        where parent.id = p_parent_id and parent.deleted_at is null
          and parent.entity_type = p_entity_type and parent.entity_id = p_entity_id
          and parent.organization_id = v_org) then
    raise exception 'cmt_add: parent comment not found' using errcode = '22023';
  end if;

  insert into platform.comments (organization_id, entity_type, entity_id, parent_id, body, created_by, updated_by)
  values (v_org, p_entity_type, p_entity_id, p_parent_id, p_body, (select auth.uid()), (select auth.uid()))
  returning id into v_id;
  return v_id;
end $function$
;

comment on function public.cmt_add(text, uuid, text, uuid, uuid) is
  'DEFAULT-ORG-3 2026-09-22: a comment belongs to the organization THE COMMENTED RECORD belongs to, read from platform.entity_types for any registered type (p_org_id overrides and must agree). It is never the author''s own workspace: a comment filed there is a comment the record''s organization can never read. Where neither the caller nor the record names an organization, this refuses with 23502 rather than inventing one.';
update platform.client_callable_door d
   set identity_args = pg_get_function_identity_arguments('public.cmt_add(text, uuid, text, uuid, uuid)'::regprocedure),
       identity_argtypes = platform.door_argtypes(p.proargtypes)
  from pg_proc p
 where p.oid = 'public.cmt_add(text, uuid, text, uuid, uuid)'::regprocedure
   and d.schema_name = 'public' and d.function_name = 'cmt_add';
grant execute on function public.cmt_add(text, uuid, text, uuid, uuid) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. cmt_list — back to the live return shape
-- ─────────────────────────────────────────────────────────────────────────────
drop function public.cmt_list(text, uuid);

CREATE OR REPLACE FUNCTION public.cmt_list(p_entity_type text, p_entity_id uuid)
 RETURNS TABLE(id uuid, organization_id uuid, entity_type text, entity_id uuid, parent_id uuid, body text, created_at timestamp with time zone, updated_at timestamp with time zone, created_by uuid, author_email text, author_display_name text, author_avatar_url text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- RC-A2: the thread is readable by whoever may VIEW the record it is on -- and by nobody
  -- else, organization members included. A record you may not see answers an empty thread,
  -- exactly as a record that does not exist does.
  select c.id, c.organization_id, c.entity_type, c.entity_id, c.parent_id, c.body,
         c.created_at, c.updated_at, c.created_by,
         u.email,
         coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', u.email),
         u.raw_user_meta_data->>'avatar_url'
    from platform.comments c
    left join auth.users u on u.id = c.created_by
   where c.entity_type = p_entity_type and c.entity_id = p_entity_id
     and c.deleted_at is null
     and (select iam.has_access(p_entity_type, p_entity_id, 'viewer'::public.permission_level))
   order by c.created_at asc;
$function$
;

update platform.client_callable_door d
   set identity_args = pg_get_function_identity_arguments('public.cmt_list(text, uuid)'::regprocedure),
       identity_argtypes = platform.door_argtypes(p.proargtypes)
  from pg_proc p
 where p.oid = 'public.cmt_list(text, uuid)'::regprocedure
   and d.schema_name = 'public' and d.function_name = 'cmt_list';
grant execute on function public.cmt_list(text, uuid) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. cmt_edit — back to the two-argument live body
-- ─────────────────────────────────────────────────────────────────────────────
drop function public.cmt_edit(uuid, text, integer);

CREATE OR REPLACE FUNCTION public.cmt_edit(p_id uuid, p_body text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- RC-A2: authorship alone is not enough -- somebody whose share was narrowed to viewer (or
  -- withdrawn) may no longer change what the thread says. Nothing fails silently: a refused
  -- edit used to update zero rows and report success.
  update platform.comments c
     set body = p_body, updated_by = (select auth.uid())
   where c.id = p_id and c.deleted_at is null and c.created_by = (select auth.uid())
     and iam.has_access(c.entity_type, c.entity_id, 'commenter'::public.permission_level);
  if not found then
    raise exception 'cmt_edit: comment not found, or you may not edit it -- only its author may, while holding commenter on the record it is on'
      using errcode = '42501';
  end if;
end $function$
;

update platform.client_callable_door d
   set identity_args = pg_get_function_identity_arguments('public.cmt_edit(uuid, text)'::regprocedure),
       identity_argtypes = platform.door_argtypes(p.proargtypes)
  from pg_proc p
 where p.oid = 'public.cmt_edit(uuid, text)'::regprocedure
   and d.schema_name = 'public' and d.function_name = 'cmt_edit';
grant execute on function public.cmt_edit(uuid, text) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. The columns, index and check (after every function that read them is gone)
-- ─────────────────────────────────────────────────────────────────────────────
alter table platform.comments drop constraint if exists comments_suggestion_needs_a_passage;
drop index if exists platform.comments_author_client_request_uidx;
alter table platform.comments drop column if exists suggested_text;
alter table platform.comments drop column if exists client_request_id;
alter table platform.comments drop column if exists edited_at;
