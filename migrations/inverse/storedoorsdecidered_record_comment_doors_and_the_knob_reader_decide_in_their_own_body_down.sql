-- based-on: custom.io_comment_write(uuid, uuid, text, jsonb, uuid) 102c6262e0825bd19abbc0c1fdc6ffb248b17043357ecf8a7a2938f88955087e
-- based-on: custom.io_comment_resolve(uuid, uuid, boolean) f0793d8de32584f7633acbe03b67dfd5703ed53a33d4e1e5a46b5784dba258bb
-- based-on: custom.io_comments(uuid, uuid, boolean) 924c27a3a26fde072a0c94637b953215f1b64094182566754dae4bf3b8c77b44
-- based-on: platform.knob_person_for(uuid) bdd0f8b66de38f5a60e0ad2fb9f19eaf9d6b2dcc36039702991dc1a92b4ad00d
-- INVERSE of migrations/campaign/storedoorsdecidered_record_comment_doors_and_the_knob_reader_decide_in_their_own_body.sql
-- The four bodies exactly as production held them before it (the based-on hashes in the up file).
-- Rehearsal only.

set local lock_timeout = '2s';

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
  if not platform.detail_parent_access_for(v_user, 'record', p_record_id, 'commenter'::public.permission_level) then
    if platform.detail_parent_access_for(v_user, 'record', p_record_id, 'viewer'::public.permission_level) then
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
  if not platform.detail_parent_access_for(v_user, 'record', v_record, 'commenter'::public.permission_level) then
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
  if not platform.detail_parent_access_for(custom.query_principal(), 'record', p_record_id, 'viewer'::public.permission_level) then
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

CREATE OR REPLACE FUNCTION platform.knob_person_for(p_user uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
  -- RC-A8: the user rung a caller may stand on. SECURITY INVOKER on purpose: it reads the caller's
  -- own session (auth.uid(), iam.is_trusted_backend()), also when called inside a SECURITY DEFINER.
  select case when p_user is not null
               and (iam.is_trusted_backend() or p_user = (select auth.uid()))
              then p_user end;
$function$;
