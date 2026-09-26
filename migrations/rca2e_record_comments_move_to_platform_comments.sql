-- rca2e_record_comments_move_to_platform_comments
-- based-on: iam.has_access_for_base(uuid, text, uuid, permission_level, boolean, text[]) 7ff488e310fd62d0c9a475aa10e1d17f5a1a46dc678430b3e88ad2028467cac6
-- based-on: iam.accessible_entity_ids(text, permission_level, integer, boolean) c6f87f39a912274a3581dd38eaf45160f88ef35d914a1671c799118e5948a507
-- based-on: public.cmt_add(text, uuid, text, uuid, uuid, jsonb, text, uuid) 0fb127e05c06fe80ef660eec998fc46d2f6d699c716241934b6a8455e3f5631f
-- based-on: public.version_list(text, uuid, integer, integer) 02e47c426510f8fae9ea61e7640d2a7342c842587d9c6cd15e0ef4b9f26a9f75
-- based-on: public.version_snapshot(text, uuid, integer) 45573b6688666af326ef43c81da46b6bee5993130727bb9445ecb34ac6b36bf1
-- based-on: public.access_denied_context(text, uuid) a7efc37f964f81fe3c87b9122a596faa7e883e3a0f95f9aa5a1b4f254081132b
-- based-on: custom.comment_write(uuid, uuid, text, jsonb, uuid, uuid[]) a99bfa372136ed499d9e5c9b9a8e4903550f5e924ec7f3da33f353499cf7fea7
-- based-on: custom.table_move(uuid, uuid, integer) 684a71f2b69c6af65813b8bcac68ffeb8b172986238f33d4908816bfc3da5fb5
-- based-on: custom.io_comment_write(uuid, uuid, text, jsonb, uuid) 39c6920f186ad9181528d4b0360e65c9f2d3c004521644f8406ce914f2fc6c5e
-- based-on: custom.io_comment_resolve(uuid, uuid, boolean) 2a5c604bdc9ade62b579fbb715cfd195e8adc236b6d52051ea2c275fb6589553
-- based-on: custom.io_comments(uuid, uuid, boolean) c852644a82dc0662117b6969df570140b9a58ec4bb36dcc996166bf80f38b01b
--
-- RC-A2e (register row RC-A2; STORE-DESIGN §3.8 item 4; verify-RC-A2-independent-2026-09-25.md §2).
-- Function bodies plus a one-time copy of 36 rows. No table, index, policy or lock-taking DDL.
--
-- THE DEFECT, measured live 2026-09-26 (rolled back): Data Tables record comments lived in a
-- SECOND comment store, custom.io_comment (token `io_comment`, registered `entity`, parent pointer
-- `record_id`). The kernel's detail rule (rca2b) keyed on platform.comments' own column names, so
-- it never saw io_comment, and resolved it from the row's own `visibility` + organization:
-- iam.accessible_entity_ids('io_comment') listed 3 ids of comments on records test@test.com cannot
-- open, and 21 of 21 non-author member/comment pairs held EDITOR (an organization admin could
-- soft-delete a colleague's comment; on an "Only people I share it with" table the org-admin lane
-- would have opened the comment while the record stayed shut).
--
-- THE CLASS FIX:
--   1. platform.detail_parent_columns(token) — THE DECLARATION of a detail's parent pointer:
--      {type column, id column, fixed type}. comment → (entity_type, entity_id); io_comment →
--      (record_id, always 'record'). platform.token_is_detail(token) = registered `detail` OR
--      declared. The kernel's detail branch now reads the parent through the declaration, runs for
--      every declared token whatever its registry variant, and FAILS CLOSED for a `detail` token
--      with no declaration — the next detail table cannot slip through by naming its columns
--      differently. The set form, cmt_add's comment-on-a-comment refusal, the history doors (R1)
--      and access_denied_context (R2) ask the same helper.
--   2. ONE comment store. The Data Tables doors keep their names, arguments and payload shapes
--      (the client and the client portal call only them) and now read and write platform.comments
--      with entity_type = 'record': custom.io_comment_write, io_comment_resolve, io_comments, and
--      comment_write's table lookup. The field a comment points at is a `record_field_anchor` kind
--      (published to content_ir.kind_definition 2026-09-26); mentions and the table id ride in
--      metadata; custom.io_comments hands back the old anchor shape ({field_key, mentions}).
--      custom.table_move carries a table's record comments to its new organization.
--   3. The 36 rows are copied with their ids, authors, times, parent and resolution unchanged; each
--      old row is soft-archived (deleted_at), never deleted. Archived io_comment rows now answer to
--      their author only (the detail rule's soft-delete clause).
-- Forcing suite: aidream db/tests/test_rca2e_record_comments_move_to_the_one_store.py
-- (RCA2E_BEFORE=1 = red: 7 failed on production 2026-09-26).

set local lock_timeout = '2s';

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. THE DECLARATION
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function platform.detail_parent_columns(p_token text)
returns text[]
language sql
immutable
as $fn$
  -- RC-A2e: THE ONE LIST of how a detail names the record it belongs to — {type column, id column,
  -- fixed type}. A detail's access IS that record's (iam.has_access_for_base). A plain CASE with no
  -- SET clause so the planner inlines it: the kernel asks it on every node of every walk. A token
  -- registered `detail` that is missing here is refused by the kernel (fails closed).
  select case p_token
           when 'comment'    then array['entity_type', 'entity_id', null]   -- platform.comments
           when 'io_comment' then array[null, 'record_id', 'record']        -- custom.io_comment (archived; record comments now live in platform.comments)
         end
$fn$;

comment on function platform.detail_parent_columns(text) is
  'RC-A2e: {type column, id column, fixed type} naming the record a detail row belongs to, or null. The kernel, the set form, cmt_add, the history doors and access_denied_context read it. common-docs/projects/rich-content-unification/REGISTER.md RC-A2.';

create or replace function platform.token_is_detail(p_token text)
returns boolean
language sql
stable
as $fn$
  -- RC-A2e: a detail is a token registered `detail` or one that declares its parent pointer.
  select platform.detail_parent_columns(p_token) is not null
      or exists (select 1 from platform.entity_types et
                  where et.token = p_token and et.is_active and et.rls_variant = 'detail')
$fn$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. EVERY PLACE THAT ASKS "IS THIS A DETAIL, AND WHOSE?" ASKS THE DECLARATION
-- ─────────────────────────────────────────────────────────────────────────────
do $patch$
declare
  v_def text;
  v_n int;
  r record;
begin
  for r in
    select * from (values
      (1, 'iam.has_access_for_base(uuid,text,uuid,permission_level,boolean,text[])',
$a$  v_variant text; v_detail jsonb; v_detail_type text; v_detail_id uuid; v_detail_author uuid;
$a$,
$a$  v_variant text; v_detail jsonb; v_detail_type text; v_detail_id uuid; v_detail_author uuid;
  v_detail_cols text[];  -- RC-A2e: the declared parent pointer (platform.detail_parent_columns)
$a$),
      (2, 'iam.has_access_for_base(uuid,text,uuid,permission_level,boolean,text[])',
$a$    if v_variant = 'detail' then
      v_detail := null;
$a$,
$a$    -- RC-A2e: every DECLARED detail takes this branch whatever its registry variant, and a
    -- `detail` token with no declaration fails closed instead of reading columns it may not have.
    v_detail_cols := platform.detail_parent_columns(v_type);
    if v_variant = 'detail' or v_detail_cols is not null then
      continue walk when v_detail_cols is null;
      v_detail := null;
$a$),
      (3, 'iam.has_access_for_base(uuid,text,uuid,permission_level,boolean,text[])',
$a$      v_detail_type := v_detail ->> 'entity_type';
      v_detail_id := (v_detail ->> 'entity_id')::uuid;
$a$,
$a$      v_detail_type := coalesce(v_detail ->> v_detail_cols[1], v_detail_cols[3]);
      v_detail_id := (v_detail ->> v_detail_cols[2])::uuid;
$a$),
      (4, 'iam.has_access_for_base(uuid,text,uuid,permission_level,boolean,text[])',
$a$      continue walk when exists (select 1 from platform.entity_types pet
                                  where pet.token = v_detail_type and pet.rls_variant = 'detail');
$a$,
$a$      continue walk when platform.token_is_detail(v_detail_type);
$a$),
      (5, 'iam.accessible_entity_ids(text,permission_level,integer,boolean)',
$a$  if exists (select 1 from platform.entity_types et
              where et.token = p_type and et.is_active and et.rls_variant = 'detail') then
$a$,
$a$  if platform.token_is_detail(p_type) then  -- RC-A2e: every declared detail
$a$),
      (6, 'public.cmt_add(text,uuid,text,uuid,uuid,jsonb,text,uuid)',
$a$  if exists (select 1 from platform.entity_types et
              where et.token = p_entity_type and et.rls_variant = 'detail') then
$a$,
$a$  if platform.token_is_detail(p_entity_type) then  -- RC-A2e: every declared detail
$a$),
      (7, 'public.version_list(text,uuid,integer,integer)',
$a$       (CASE WHEN EXISTS (SELECT 1 FROM platform.entity_types WHERE token=p_token AND rls_variant='detail')
$a$,
$a$       (CASE WHEN platform.token_is_detail(p_token)
$a$),
      (8, 'public.version_snapshot(text,uuid,integer)',
$a$       (CASE WHEN EXISTS (SELECT 1 FROM platform.entity_types WHERE token=p_token AND rls_variant='detail')
$a$,
$a$       (CASE WHEN platform.token_is_detail(p_token)
$a$),
      (9, 'public.access_denied_context(text,uuid)',
$a$  if exists (select 1 from platform.entity_types et
              where et.token = v_meta.token and et.rls_variant = 'detail') then
    execute format('select entity_type, entity_id from %I.%I where id = $1',
                   v_meta.schema_name, v_meta.table_name)
      into v_parent_type, v_parent_id using p_id;
$a$,
$a$  if platform.token_is_detail(v_meta.token) then
    -- RC-A2e: the parent is read through the declaration (an undeclared detail answers "missing").
    v_parent_type := null; v_parent_id := null;
    if platform.detail_parent_columns(v_meta.token) is not null then
      execute format('select coalesce(to_jsonb(t) ->> $2, $3), (to_jsonb(t) ->> $4)::uuid from %I.%I t where t.id = $1',
                     v_meta.schema_name, v_meta.table_name)
        into v_parent_type, v_parent_id
        using p_id, (platform.detail_parent_columns(v_meta.token))[1],
              (platform.detail_parent_columns(v_meta.token))[3],
              (platform.detail_parent_columns(v_meta.token))[2];
    end if;
$a$),
      (10, 'custom.comment_write(uuid,uuid,text,jsonb,uuid,uuid[])',
$a$    select c.table_id into v_table
      from custom.io_comment c
     where c.organization_id = p_organization_id and c.id = v_comment;
$a$,
$a$    -- RC-A2e: record comments live in platform.comments; the table rides in metadata.
    select (c.metadata ->> 'table_id')::uuid into v_table
      from platform.comments c
     where c.organization_id = p_organization_id and c.id = v_comment;
$a$),
      (11, 'custom.table_move(uuid,uuid,integer)',
$a$  update custom.io_comment c set organization_id = p_to_organization_id
   where c.organization_id = v_from and (c.table_id = any (v_tables) or c.record_id = any (v_rows));
$a$,
$a$  update custom.io_comment c set organization_id = p_to_organization_id
   where c.organization_id = v_from and (c.table_id = any (v_tables) or c.record_id = any (v_rows));
  -- RC-A2e: record comments live in platform.comments (entity_type 'record'); they follow too.
  update platform.comments c set organization_id = p_to_organization_id
   where c.organization_id = v_from and c.entity_type = 'record' and c.entity_id = any (v_rows);
$a$)
    ) as t(ord, fn, anchor, repl)
    order by ord
  loop
    v_def := pg_get_functiondef(r.fn::regprocedure);
    v_n := (length(v_def) - length(replace(v_def, r.anchor, ''))) / length(r.anchor);
    if v_n <> 1 then
      raise exception 'rca2e patch %: anchor occurs % time(s) in %, expected exactly 1 — nothing was changed', r.ord, v_n, r.fn;
    end if;
    execute replace(v_def, r.anchor, r.repl);
  end loop;
end
$patch$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. THE DATA TABLES DOORS WRITE AND READ THE ONE COMMENT STORE (same names, args, shapes)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION custom.io_comment_write(p_organization_id uuid, p_record_id uuid, p_body text, p_anchor jsonb DEFAULT '{}'::jsonb, p_parent_comment_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_user  uuid := custom.query_principal();
  v_doc   jsonb;
  v_table uuid;
  v_id    uuid;
  v_org_of_record uuid;
  v_field text;
  v_extra jsonb;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.io_comment_write');
  if coalesce(btrim(coalesce(p_body, '')), '') = '' then
    raise exception 'custom.io_comment_write: a comment with no body is not a comment'
      using errcode = '22004';
  end if;

  -- THE LEVEL: commenter on the record (viewer < commenter < editor < admin), asked of the store's
  -- one answer. The refusal sentence matches the fact (lane LEAK-T10): the lower rung is asked
  -- before telling anybody they may read a record.
  if not custom.has_visibility(v_user, 'record', p_record_id, 'commenter'::public.permission_level) then
    if custom.has_visibility(v_user, 'record', p_record_id, 'viewer'::public.permission_level) then
      raise exception 'You may read this record but not comment on it.'
        using errcode = '42501',
              hint = 'Commenting needs the commenter level on the record (viewer < commenter < editor < admin). Ask whoever shared it with you to raise your level; nothing about the record itself has to change.';
    end if;
    raise exception 'You do not have access to this record.'
      using errcode = '42501',
            hint = 'REC-29 / VIS-1: this is the same answer every other door gives about a record you do not hold, and it is deliberately the same whether the record exists or not. Ask whoever owns it to share it with you at the commenter level.';
  end if;

  -- THE ORGANIZATION IS THE RECORD'S (ARGS-RULED 2026-09-21), never the caller's to choose.
  v_org_of_record := custom._organization_of_record(p_record_id);
  if v_org_of_record is null then
    raise exception 'custom.io_comment_write: record % is not in this organization, or is deleted', p_record_id
      using errcode = '23503';
  end if;
  if v_org_of_record <> p_organization_id then
    raise exception 'That record belongs to a different organization, so the comment was not written.'
      using errcode = '23514',
            hint = format('A comment is filed where its record lives. This record belongs to organization %s; you named %s. Switch to that organization and comment there — being shared a record does not move it.',
                          v_org_of_record, p_organization_id);
  end if;

  -- THE ONE READ DOOR for the table id (a convenience copy; absent when the read door declines).
  begin
    v_doc := custom.read_record(p_organization_id, p_record_id, true);
  exception when sqlstate '42501' then
    v_doc := null;
  end;
  v_table := (v_doc ->> 'table_id')::uuid;

  if p_parent_comment_id is not null
     and not exists (select 1 from platform.comments c
                      where c.organization_id = p_organization_id
                        and c.id = p_parent_comment_id
                        and c.entity_type = 'record'
                        and c.entity_id = p_record_id
                        and c.deleted_at is null) then
    -- A reply to a comment on ANOTHER record would put one conversation in two places.
    raise exception 'custom.io_comment_write: comment % is not a comment on record %', p_parent_comment_id, p_record_id
      using errcode = '23503';
  end if;

  -- 🚨 RC-A2e: THE ONE COMMENT STORE. A record comment is a platform.comments row on
  -- (record, id); the field it points at is a record_field_anchor kind, mentions and the table id
  -- ride in metadata, and any other key the caller sent is kept, never dropped.
  v_field := nullif(btrim(coalesce(p_anchor ->> 'field_key', '')), '');
  v_extra := nullif(coalesce(p_anchor, '{}'::jsonb) - 'field_key' - 'mentions', '{}'::jsonb);
  insert into platform.comments (organization_id, entity_type, entity_id, parent_id, body, anchor,
                                 metadata, created_by, updated_by)
  values (p_organization_id, 'record', p_record_id, p_parent_comment_id, btrim(p_body),
          case when v_field is not null
               then jsonb_build_object('__kind', 'record_field_anchor', 'field_key', v_field) end,
          jsonb_strip_nulls(jsonb_build_object(
            'table_id', v_table,
            'mentions', case when jsonb_typeof(p_anchor -> 'mentions') = 'array' then p_anchor -> 'mentions' end,
            'anchor_extra', v_extra)),
          v_user, v_user)
  returning id into v_id;
  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION custom.io_comment_resolve(p_organization_id uuid, p_comment_id uuid, p_resolved boolean DEFAULT true)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_user   uuid := custom.query_principal();
  v_record uuid;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.io_comment_resolve');
  -- RC-A2e: record comments live in platform.comments (entity_type 'record').
  select c.entity_id into v_record from platform.comments c
   where c.organization_id = p_organization_id and c.id = p_comment_id
     and c.entity_type = 'record' and c.deleted_at is null;
  if v_record is null then return false; end if;
  if not custom.has_visibility(v_user, 'record', v_record, 'commenter'::public.permission_level) then
    raise exception 'You may not resolve comments on this record.'
      using errcode = '42501',
            hint = 'Resolving is a commenter-level act on the record the comment is attached to.';
  end if;
  -- A resolved comment is STILL a comment and is still readable. Resolution hides a thread from
  -- the default list; it is not a delete wearing a friendlier word.
  update platform.comments
     set resolved_at = case when p_resolved then now() else null end,
         resolved_by = case when p_resolved then v_user else null end,
         updated_by  = v_user
   where organization_id = p_organization_id and id = p_comment_id and entity_type = 'record';
  return true;
end;
$function$;

CREATE OR REPLACE FUNCTION custom.io_comments(p_organization_id uuid, p_record_id uuid, p_include_resolved boolean DEFAULT false)
 RETURNS TABLE(id uuid, body text, anchor jsonb, parent_comment_id uuid, created_by uuid, created_at timestamp with time zone, resolved_at timestamp with time zone, resolved_by uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
begin
  perform custom.assert_store_door(p_organization_id, 'custom.io_comments');
  -- Reading a comment needs only what reading the record needs. A viewer sees the conversation
  -- and cannot join it — which is exactly what the two rungs mean.
  if not custom.has_visibility(custom.query_principal(), 'record', p_record_id, 'viewer'::public.permission_level) then
    return;
  end if;
  -- RC-A2e: the one comment store; the anchor comes back in the shape every caller reads
  -- ({field_key, mentions} plus any extra key the writer sent).
  return query
    select c.id, c.body,
           coalesce(c.metadata -> 'anchor_extra', '{}'::jsonb)
             || jsonb_strip_nulls(jsonb_build_object('field_key', c.anchor ->> 'field_key',
                                                     'mentions', c.metadata -> 'mentions')),
           c.parent_id, c.created_by, c.created_at, c.resolved_at, c.resolved_by
      from platform.comments c
     where c.organization_id = p_organization_id
       and c.entity_type = 'record'
       and c.entity_id = p_record_id
       and c.deleted_at is null
       and (p_include_resolved or c.resolved_at is null)
     order by c.created_at, c.id;
end;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. THE 36 ROWS: copied unchanged, then the old rows soft-archived (never deleted)
-- ─────────────────────────────────────────────────────────────────────────────
insert into platform.comments (id, organization_id, entity_type, entity_id, parent_id, body, anchor,
                               metadata, created_by, updated_by, created_at, updated_at, deleted_at,
                               resolved_at, resolved_by)
select o.id, o.organization_id, 'record', o.record_id, o.parent_comment_id, o.body,
       case when nullif(btrim(coalesce(o.anchor ->> 'field_key', '')), '') is not null
            then jsonb_build_object('__kind', 'record_field_anchor', 'field_key', btrim(o.anchor ->> 'field_key')) end,
       jsonb_strip_nulls(jsonb_build_object(
         'table_id', o.table_id,
         'mentions', case when jsonb_typeof(o.anchor -> 'mentions') = 'array' then o.anchor -> 'mentions' end,
         'anchor_extra', nullif(coalesce(o.anchor, '{}'::jsonb) - 'field_key' - 'mentions', '{}'::jsonb),
         'io_metadata', nullif(coalesce(o.metadata, '{}'::jsonb), '{}'::jsonb),
         'migrated_from', 'custom.io_comment')),
       o.created_by, o.updated_by, o.created_at, o.updated_at, o.deleted_at, o.resolved_at, o.resolved_by
  from custom.io_comment o
 where not exists (select 1 from platform.comments p where p.id = o.id)
 order by o.created_at;  -- a parent is always older than its reply

update custom.io_comment o
   set deleted_at = now()
 where o.deleted_at is null
   and exists (select 1 from platform.comments p where p.id = o.id);
