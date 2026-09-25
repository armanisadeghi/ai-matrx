-- RC-B11 — COLLABORATION IN DOCUMENTS: the comment doors learn passages, suggestions and mentions.
-- chair-step: drops and recreates public.cmt_add and public.cmt_list with wider signatures (a new identity / return type needs DROP); same predicates, no access widened.
-- Register: common-docs/projects/rich-content-unification/REGISTER.md row RC-B11.
-- Design: STORE-DESIGN §3.8 (comments follow the parent, RC-A2) and §3.19 (annotation sidecar);
-- client: matrx-frontend features/rich-document/annotations/.
--
-- WHAT WAS MISSING, measured live 2026-09-25:
--   * platform.comments has had `anchor`, `resolved_at`, `resolved_by` since RC-A2, but the ONLY
--     client write door (cmt_add, clients are refused direct INSERT) cannot set an anchor, and the
--     only read door (cmt_list) does not return anchor or resolution — so a passage comment could
--     not be written and a resolved thread read back as open.
--   * a SUGGESTION (proposed replacement text on a passage, accepted through the document's splice
--     save) had nowhere to live.
--   * @-mentions had no door: nothing could ask "who may I mention here" or notify them.
--
-- WHAT THIS FILE DOES (access predicates unchanged — RC-A2's lane is the whole question):
--   1. platform.comments.suggested_text (catalog-only ADD COLUMN; a suggestion needs an anchor).
--   2. cmt_add(…, p_anchor, p_suggested_text): the anchor is judged by the SAME validators the
--      window trigger will run (platform.text_anchor_problem + text_anchor_target_problem, so a
--      document anchor must be true of that version); a reply carries neither.
--   3. cmt_list returns anchor, resolved_at, resolved_by, suggested_text.
--   4. cmt_mention_candidates: people who can VIEW the record, for a commenter to @-mention.
--   5. cmt_mention_notify: the author tells mentioned people through the ONE notification store
--      (communication.notification, event `comment.mention`), only people who can view the record
--      (a notice quotes the comment), each person's own channel switch honoured, deduped per
--      comment and person; every skipped person is named with the reason.
--   7. IDEMPOTENT CREATE: platform.comments.client_request_id (unique per author); cmt_add takes
--      p_client_request_id and answers a repeat with the FIRST row's id — a Retry after a lost
--      response never writes a second comment (verify-RC-B11 F2). The realtime row carries it, so
--      a tab recognises its own echo by id, never by a time window (F6).
--   9. EDITED MARKER: platform.comments.edited_at, stamped by cmt_edit only when the body actually
--      changes (a resolve or reopen also moves updated_at, so updated_at cannot say "edited").
--   8. CAS EDIT: cmt_edit(p_id, p_body, p_expected_version) refuses 40001 with the current text
--      when somebody changed the comment since the editor opened it (F6). cmt_list returns version.
--   6. association pairs document→note (annotates) and fc_card→note (anchored_to), mirroring the
--      RC-A3 document pairs, so a reader over a Notes source (the study guide, until its body
--      moves into content.document) files annotations on the canonical path. Non-conveying.
--
-- based-on: public.cmt_add(text, uuid, text, uuid, uuid) 4f69b21840f1cb176e2658ea611ee9028564af8fe0876780bc86e9dc120e57d9
-- based-on: public.cmt_list(text, uuid) 8bf23bcbb4951e65237c71091da14dd97fb912155caf3ceacc050590d74263e8
-- based-on: public.cmt_edit(uuid, text) f46ae8a89e46c695970b36cca87a2ed34f3f0272b8a3ccb5345152dc2a95a2b0

set local lock_timeout = '2s';

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. THE COLUMN
-- ─────────────────────────────────────────────────────────────────────────────
alter table platform.comments add column if not exists suggested_text text;
comment on column platform.comments.suggested_text is
  'RC-B11: a SUGGESTION — the proposed replacement for the anchored passage (empty string = delete it). Accepting applies it through the document''s splice save (only that block changes) and resolves the thread; rejecting deletes the comment. Null = an ordinary comment.';

alter table platform.comments add column if not exists client_request_id uuid;
alter table platform.comments add column if not exists edited_at timestamptz;
comment on column platform.comments.edited_at is
  'RC-B11: when the author last changed the text (cmt_edit, body actually different). Null = never edited. Resolving or reopening does not touch it.';
comment on column platform.comments.client_request_id is
  'RC-B11: the id the writing client minted for this create. cmt_add answers a repeat of the same (author, id) with the first row — Retry after a lost response never duplicates — and a tab recognises its own realtime echo by it.';
create unique index if not exists comments_author_client_request_uidx
  on platform.comments (created_by, client_request_id) where client_request_id is not null;

alter table platform.comments
  add constraint comments_suggestion_needs_a_passage check (
    suggested_text is null
    or (anchor is not null and parent_id is null and char_length(suggested_text) <= 20000));

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. cmt_add — same checks, in the same order, plus the passage and the suggestion
-- ─────────────────────────────────────────────────────────────────────────────
drop function public.cmt_add(text, uuid, text, uuid, uuid);

create function public.cmt_add(
  p_entity_type text,
  p_entity_id uuid,
  p_body text,
  p_parent_id uuid default null,
  p_org_id uuid default null,
  p_anchor jsonb default null,
  p_suggested_text text default null,
  p_client_request_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_org uuid := p_org_id;
  v_scoped boolean;
  v_entity_org uuid;
  v_named boolean := p_org_id is not null;
  v_problem text;
  v_id uuid;
begin
  -- 🚨 RC-A2b (2026-09-25): a comment is never the record a comment is on. A reply goes through
  -- the record's own thread (p_parent_id). Refused by TYPE, before any lookup, so it confirms
  -- nothing about any id (verify-RC-A2 F3; kept here because this file recreates cmt_add).
  if exists (select 1 from platform.entity_types et
              where et.token = p_entity_type and et.rls_variant = 'detail') then
    raise exception 'cmt_add: a comment cannot be filed on a % — reply in its thread instead: cmt_add(<the record type>, <the record id>, body, p_parent_id => <the comment id>)',
      p_entity_type using errcode = '22023';
  end if;
  -- Deny before resolving organization or looking up the row (RC-A2: no existence oracle).
  if not iam.has_access(p_entity_type, p_entity_id, 'commenter'::public.permission_level) then
    raise exception 'cmt_add: you cannot comment on this record (%/%) -- commenting needs the commenter level on it. Ask its owner to share it with you at commenter or above.',
      p_entity_type, p_entity_id
      using errcode = '42501';
  end if;

  v_scoped := platform.entity_is_org_scoped(p_entity_type);
  if v_scoped then
    v_entity_org := platform.entity_organization_id(p_entity_type, p_entity_id);
  end if;
  if v_org is null then
    v_org := v_entity_org;
  end if;
  if v_org is null then
    raise exception 'cmt_add: nothing named the organization this comment belongs to. The record (%/%) did not answer -- either its entity type is not organization-scoped or the row does not exist. Remedy: pass p_org_id, the organization you are acting in.',
      p_entity_type, p_entity_id
      using errcode = '23502';
  end if;
  if v_named and not iam.has_org_access(v_org) then
    raise exception 'cmt_add: no org access (org=%, %/%)', v_org, p_entity_type, p_entity_id
      using errcode = '42501';
  end if;
  if v_scoped and v_entity_org is distinct from v_org then
    raise exception 'cmt_add: entity not found in this organization' using errcode = '22023';
  end if;

  if p_parent_id is not null and not exists (
       select 1 from platform.comments parent
        where parent.id = p_parent_id and parent.deleted_at is null
          and parent.entity_type = p_entity_type and parent.entity_id = p_entity_id
          and parent.organization_id = v_org) then
    raise exception 'cmt_add: parent comment not found' using errcode = '22023';
  end if;

  -- RC-B11: the passage. A reply belongs to its thread's passage and carries none.
  if p_anchor is not null then
    if p_parent_id is not null then
      raise exception 'cmt_add: a reply carries no passage -- the thread it answers already points at one'
        using errcode = '22023';
    end if;
    if p_anchor ->> '__kind' is distinct from 'text_anchor' then
      raise exception 'cmt_add: a passage comment carries a text_anchor ("__kind": "text_anchor")'
        using errcode = '22023';
    end if;
    v_problem := coalesce(platform.text_anchor_problem(p_anchor),
                          platform.text_anchor_target_problem(p_entity_type, p_entity_id, p_anchor));
    if v_problem is not null then
      raise exception 'cmt_add: this comment''s passage is invalid: %', v_problem
        using errcode = '23514',
              hint = 'Anchor to the exact text of one version of the record (Unicode code points); a comment on the whole record carries no anchor.';
    end if;
  end if;
  if p_suggested_text is not null and p_anchor is null then
    raise exception 'cmt_add: a suggestion replaces a passage, so it needs one (p_anchor)'
      using errcode = '22023';
  end if;

  -- RC-B11: a repeat of the same create (a Retry after a lost response) is the first row.
  if p_client_request_id is not null then
    select c.id into v_id from platform.comments c
     where c.created_by = (select auth.uid()) and c.client_request_id = p_client_request_id;
    if v_id is not null then
      return v_id;
    end if;
  end if;

  insert into platform.comments (organization_id, entity_type, entity_id, parent_id, body, anchor,
                                 suggested_text, client_request_id, created_by, updated_by)
  values (v_org, p_entity_type, p_entity_id, p_parent_id, coalesce(p_body, ''), p_anchor,
          p_suggested_text, p_client_request_id, (select auth.uid()), (select auth.uid()))
  on conflict (created_by, client_request_id) where client_request_id is not null do nothing
  returning id into v_id;
  if v_id is null then  -- a concurrent twin of this same request won the race
    select c.id into v_id from platform.comments c
     where c.created_by = (select auth.uid()) and c.client_request_id = p_client_request_id;
  end if;
  return v_id;
end $function$;

comment on function public.cmt_add(text, uuid, text, uuid, uuid, jsonb, text, uuid) is
  'Add a comment to a record: commenter on the record (RC-A2). RC-B11: p_anchor pins a thread to a passage (text_anchor, judged against the record''s version for a document); p_suggested_text makes it a suggestion (needs p_anchor). Replies carry neither. p_client_request_id makes the create idempotent per author.';
-- The door row follows its function's new identity (platform.client_callable_door), BEFORE the grant.
update platform.client_callable_door d
   set identity_args = pg_get_function_identity_arguments('public.cmt_add(text, uuid, text, uuid, uuid, jsonb, text, uuid)'::regprocedure),
       identity_argtypes = platform.door_argtypes(p.proargtypes)
  from pg_proc p
 where p.oid = 'public.cmt_add(text, uuid, text, uuid, uuid, jsonb, text, uuid)'::regprocedure
   and d.schema_name = 'public' and d.function_name = 'cmt_add';
grant execute on function public.cmt_add(text, uuid, text, uuid, uuid, jsonb, text, uuid) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. cmt_list — same predicate, the passage and resolution come back
-- ─────────────────────────────────────────────────────────────────────────────
drop function public.cmt_list(text, uuid);

create function public.cmt_list(p_entity_type text, p_entity_id uuid)
returns table(id uuid, organization_id uuid, entity_type text, entity_id uuid, parent_id uuid, body text,
              created_at timestamptz, updated_at timestamptz, created_by uuid, author_email text,
              author_display_name text, author_avatar_url text,
              anchor jsonb, resolved_at timestamptz, resolved_by uuid, suggested_text text,
              version integer, client_request_id uuid, edited_at timestamptz)
language sql
stable security definer
set search_path to 'public'
as $function$
  -- RC-A2: the thread is readable by whoever may VIEW the record it is on -- and by nobody else.
  select c.id, c.organization_id, c.entity_type, c.entity_id, c.parent_id, c.body,
         c.created_at, c.updated_at, c.created_by,
         u.email,
         coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', u.email),
         u.raw_user_meta_data->>'avatar_url',
         c.anchor, c.resolved_at, c.resolved_by, c.suggested_text,
         c.version, c.client_request_id, c.edited_at
    from platform.comments c
    left join auth.users u on u.id = c.created_by
   where c.entity_type = p_entity_type and c.entity_id = p_entity_id
     and c.deleted_at is null
     and (select iam.has_access(p_entity_type, p_entity_id, 'viewer'::public.permission_level))
   order by c.created_at asc;
$function$;

comment on function public.cmt_list(text, uuid) is
  'The comments on a record, oldest first, for whoever may VIEW it (RC-A2). RC-B11: with each thread''s passage (anchor), resolution and suggestion.';
-- The door row follows its function's new identity (platform.client_callable_door), BEFORE the grant.
update platform.client_callable_door d
   set identity_args = pg_get_function_identity_arguments('public.cmt_list(text, uuid)'::regprocedure),
       identity_argtypes = platform.door_argtypes(p.proargtypes)
  from pg_proc p
 where p.oid = 'public.cmt_list(text, uuid)'::regprocedure
   and d.schema_name = 'public' and d.function_name = 'cmt_list';
grant execute on function public.cmt_list(text, uuid) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3b. cmt_edit — same predicate, plus compare-and-swap on the row version
-- ─────────────────────────────────────────────────────────────────────────────
drop function public.cmt_edit(uuid, text);

create function public.cmt_edit(p_id uuid, p_body text, p_expected_version integer default null)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_version integer;
  v_current record;
begin
  -- RC-A2: authorship alone is not enough -- the author must still hold commenter on the record.
  update platform.comments c
     set body = p_body, updated_by = (select auth.uid()),
         edited_at = case when c.body is distinct from p_body then now() else c.edited_at end
   where c.id = p_id and c.deleted_at is null and c.created_by = (select auth.uid())
     and iam.has_access(c.entity_type, c.entity_id, 'commenter'::public.permission_level)
     and (p_expected_version is null or c.version = p_expected_version)
  returning c.version into v_version;
  if v_version is not null then
    return v_version;
  end if;
  -- RC-B11: say WHICH refusal. A version that moved is a conflict the person resolves, not a denial.
  select c.version, c.body into v_current from platform.comments c
   where c.id = p_id and c.deleted_at is null and c.created_by = (select auth.uid())
     and iam.has_access(c.entity_type, c.entity_id, 'commenter'::public.permission_level);
  if v_current.version is not null and p_expected_version is not null then
    raise exception 'cmt_edit: this comment changed since you started editing it'
      using errcode = '40001',
            detail = json_build_object('version', v_current.version, 'body', v_current.body)::text,
            hint = 'Show the current text, then save again against its version.';
  end if;
  raise exception 'cmt_edit: comment not found, or you may not edit it -- only its author may, while holding commenter on the record it is on'
    using errcode = '42501';
end $function$;

comment on function public.cmt_edit(uuid, text, integer) is
  'Edit your own comment (commenter on the record, RC-A2). RC-B11: p_expected_version is a compare-and-swap; a moved version raises 40001 carrying the current text. Returns the new version.';
update platform.client_callable_door d
   set identity_args = pg_get_function_identity_arguments('public.cmt_edit(uuid, text, integer)'::regprocedure),
       identity_argtypes = platform.door_argtypes(p.proargtypes)
  from pg_proc p
 where p.oid = 'public.cmt_edit(uuid, text, integer)'::regprocedure
   and d.schema_name = 'public' and d.function_name = 'cmt_edit';
grant execute on function public.cmt_edit(uuid, text, integer) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. WHO MAY I MENTION HERE — people who can view the record
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.cmt_mention_candidates(
  p_entity_type text, p_entity_id uuid, p_search text default '', p_limit integer default 8)
returns table(user_id uuid, display_name text, email text, avatar_url text)
language plpgsql
stable security definer
set search_path to 'pg_catalog'
as $function$
declare
  v_org uuid;
  v_q text := lower(btrim(coalesce(p_search, '')));
begin
  if not iam.has_access(p_entity_type, p_entity_id, 'commenter'::public.permission_level) then
    raise exception 'cmt_mention_candidates: you cannot comment on this record, so you cannot mention anyone on it'
      using errcode = '42501';
  end if;
  v_org := platform.entity_organization_id(p_entity_type, p_entity_id);
  return query
    select u.id,
           coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', u.email)::text,
           u.email::text,
           (u.raw_user_meta_data->>'avatar_url')::text
      from iam.organization_member m
      join auth.users u on u.id = m.user_id
     where m.organization_id = v_org
       and u.id is distinct from (select auth.uid())
       and (v_q = ''
            or lower(coalesce(u.raw_user_meta_data->>'full_name', '')) like '%' || v_q || '%'
            or lower(coalesce(u.raw_user_meta_data->>'name', '')) like '%' || v_q || '%'
            or lower(coalesce(u.email, '')) like v_q || '%')
       and iam.has_access_for(u.id, p_entity_type, p_entity_id, 'viewer'::public.permission_level)
     order by 2
     limit least(greatest(coalesce(p_limit, 8), 1), 20);
end $function$;

comment on function public.cmt_mention_candidates(text, uuid, text, integer) is
  'RC-B11: people a commenter may @-mention on a record — members of the record''s organization who can VIEW it (a mention shows them the comment). Commenter on the record required.';
-- Declared signed-in door (platform.client_callable_door), BEFORE the grant.
insert into platform.client_callable_door (schema_name, function_name, identity_args, identity_argtypes, declared_by, reason, signed_in_callers)
select 'public', 'cmt_mention_candidates', pg_get_function_identity_arguments(p.oid), platform.door_argtypes(p.proargtypes), 'rcb11',
       'RC-B11 @-mention picker: definer so the answer is only people who can VIEW the record, asked by a commenter on it.', true
  from pg_proc p where p.oid = 'public.cmt_mention_candidates(text, uuid, text, integer)'::regprocedure
   and not exists (select 1 from platform.client_callable_door d where d.schema_name = 'public' and d.function_name = 'cmt_mention_candidates');
grant execute on function public.cmt_mention_candidates(text, uuid, text, integer) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. TELL THE MENTIONED PEOPLE — one notice each, through the one notification store
-- ─────────────────────────────────────────────────────────────────────────────
insert into communication.notification_event_type
  (event_key, label, description, default_channels, config, enabled, organization_id, visibility)
select 'comment.mention', 'You were mentioned',
       'Somebody mentioned you in a comment on a document or record you can see.',
       '{"in_app": true}'::jsonb,
       jsonb_build_object(
         'mandatory', false,
         'templates', jsonb_build_object('in_app', jsonb_build_object('body', '{{notice.body}}', 'subject', 'You were mentioned')),
         'alert_tier', 'informational', 'digestible', true, 'sms_locked', true,
         'target_kind', 'comment', 'max_attempts', 5, 'routing_mode', 'declared_audience',
         'push_declared', false, 'non_user_capable', false, 'deep_link_template', null,
         'quiet_hours_exempt', false, 'retry_base_seconds', 60, 'sender_program_key', null,
         'sensitivity_ceiling', 'internal'),
       true, t.organization_id, 'internal'
  from communication.notification_event_type t
 where t.event_key = 'custom.comment.mention' and t.deleted_at is null
   and not exists (select 1 from communication.notification_event_type x where x.event_key = 'comment.mention');

create or replace function public.cmt_mention_notify(p_comment_id uuid, p_recipients uuid[], p_deep_link text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
declare
  c record;
  r uuid;
  v_author text;
  v_title text;
  v_told jsonb := '[]'::jsonb;
  v_skipped jsonb := '[]'::jsonb;
  v_ins integer;
begin
  select * into c from platform.comments where id = p_comment_id and deleted_at is null;
  if c.id is null or c.created_by is distinct from (select auth.uid()) then
    raise exception 'cmt_mention_notify: only the author of a comment can tell the people it mentions'
      using errcode = '42501';
  end if;
  if p_deep_link is not null and left(p_deep_link, 1) <> '/' then
    raise exception 'cmt_mention_notify: the link must be a path inside the app (starting with /)'
      using errcode = '22023';
  end if;
  select coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', u.email)
    into v_author from auth.users u where u.id = c.created_by;
  v_title := case when c.entity_type = 'document'
                  then (select d.title from content.document d where d.id = c.entity_id)
                  when c.entity_type = 'note'
                  then (select n.label from workbench.notes n where n.id = c.entity_id)
             end;

  for r in select distinct x from unnest(coalesce(p_recipients, '{}'::uuid[])) x loop
    if r = c.created_by then
      v_skipped := v_skipped || jsonb_build_object('user_id', r, 'why', 'self');
      continue;
    end if;
    if not iam.has_access_for(r, c.entity_type, c.entity_id, 'viewer'::public.permission_level) then
      -- A notice quotes the comment; somebody who cannot read the record is never shown it.
      v_skipped := v_skipped || jsonb_build_object('user_id', r, 'why', 'cannot_view');
      continue;
    end if;
    if not ('in_app' = any (coalesce(hr._notify_channels('comment.mention', c.organization_id, r, null), array['in_app']))) then
      v_skipped := v_skipped || jsonb_build_object('user_id', r, 'why', 'switched_off');
      continue;
    end if;
    insert into communication.notification
      (organization_id, event_key, channel, recipient_user_id, recipient_kind, dedupe_key,
       subject, body, payload, target_kind, target_id, deep_link, visibility)
    values
      (c.organization_id, 'comment.mention', 'in_app', r, 'user',
       format('comment.mention:%s:%s', c.id, r),
       format('%s mentioned you on %s', coalesce(v_author, 'Somebody'),
              coalesce(nullif(btrim(coalesce(v_title, '')), ''), 'a document')),
       left(btrim(coalesce(c.body, '')), 280),
       jsonb_build_object('comment_id', c.id, 'entity_type', c.entity_type, 'entity_id', c.entity_id,
                          'source', 'comment_mention'),
       c.entity_type, c.entity_id, p_deep_link, 'personal'::platform.visibility)
    on conflict do nothing;
    get diagnostics v_ins = row_count;
    if v_ins = 0 then
      v_skipped := v_skipped || jsonb_build_object('user_id', r, 'why', 'already_told');
    else
      v_told := v_told || to_jsonb(r);
    end if;
  end loop;
  return jsonb_build_object('told', v_told, 'skipped', v_skipped);
end $function$;

comment on function public.cmt_mention_notify(uuid, uuid[], text) is
  'RC-B11: the author of a comment tells the people it @-mentions — one in-app notice each (event comment.mention), only people who can VIEW the record, their own channel switch honoured, deduped per comment and person. Returns {told: [user_id], skipped: [{user_id, why}]}.';
-- Declared signed-in door (platform.client_callable_door), BEFORE the grant.
insert into platform.client_callable_door (schema_name, function_name, identity_args, identity_argtypes, declared_by, reason, signed_in_callers)
select 'public', 'cmt_mention_notify', pg_get_function_identity_arguments(p.oid), platform.door_argtypes(p.proargtypes), 'rcb11',
       'RC-B11 @-mention notices: definer so only the comment author sends them, and only to people who can VIEW the record.', true
  from pg_proc p where p.oid = 'public.cmt_mention_notify(uuid, uuid[], text)'::regprocedure
   and not exists (select 1 from platform.client_callable_door d where d.schema_name = 'public' and d.function_name = 'cmt_mention_notify');
grant execute on function public.cmt_mention_notify(uuid, uuid[], text) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. ANNOTATIONS AND PASSAGE LINKS ON A NOTES SOURCE (non-conveying, like the document pairs)
-- ─────────────────────────────────────────────────────────────────────────────
insert into platform.association_types (source_type, target_type, container_side, conveys_max, is_active, notes, allows_loops)
values
  ('document', 'note', 'none', 'viewer', true,
   'RC-B11: an annotation document (role annotates, payload text_anchor) on a Notes source such as a study guide, until that body moves into content.document. Non-conveying: an annotation is personal.', false),
  ('fc_card', 'note', 'none', 'viewer', true,
   'RC-B11: a flashcard linked to the passage of a Notes source it teaches (role anchored_to, payload text_anchor). The card stays in its own store; detaching removes the edge. Non-conveying.', false)
on conflict do nothing;
