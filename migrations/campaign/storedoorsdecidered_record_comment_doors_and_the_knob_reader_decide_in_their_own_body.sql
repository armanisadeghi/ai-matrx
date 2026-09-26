-- chair-step: lane STORE-DOORS-DECIDE-RED. The three Data Tables comment doors ask the organization wall in their own body, and platform.knob_person_for is plpgsql; no answer changes for an authorised caller.
-- based-on: custom.io_comment_write(uuid, uuid, text, jsonb, uuid) 55d689d8777517f36ee02670b330d8b0b8969797e0d6a992db3df32ea8922e00
-- based-on: custom.io_comment_resolve(uuid, uuid, boolean) 7e44e0b589c12dbf1dbe86bee04b8d6c749ce9df2f30431d11df621763f2d0de
-- based-on: custom.io_comments(uuid, uuid, boolean) 4576c1e475e7dc3451b4831e24846206a61c3c98294eb667658c4a81488d72dd
-- based-on: platform.knob_person_for(uuid) 3af01a7df95e1bac8dafdd558153f0f1a2e52285f86614c298f6a85cf7cfa02e
--
-- STORE-DOORS-DECIDE-RED (2026-09-26) — FOUR DOORS DECIDE IN THEIR OWN BODY AGAIN.
--
-- `pnpm check:store-doors-decide` (production, read-only) was RED for about eight hours on:
--
--   [FAIL] client doors taking an organization id that never decide the caller - 3
--   [FAIL] declared client doors whose body never goes through the one ladder - 3
--          custom.io_comment_resolve / custom.io_comment_write / custom.io_comments
--   [FAIL] functions the one ladder reaches that re-plan their body on every call - 1
--          platform.knob_person_for(sql)
--
-- WHERE IT CAME FROM. rca2h_one_rule_for_record_comments.sql (applied 2026-09-26 04:31Z) replaced
-- each comment door's `custom.has_visibility(...)` with `platform.detail_parent_access_for(...)`
-- — the right row question (a comment follows its record's ladder, never the "may know this
-- Table" arm), and it STAYS. But has_visibility was also the only thing in those bodies the census
-- could read as a decision; after the swap each door asked the switch (assert_store_door) and the
-- row, and nothing about the organization it was handed. rca8a (08:41Z) added
-- platform.knob_person_for as LANGUAGE sql with SET, which PostgreSQL cannot inline and re-plans
-- on every call.
--
-- THE FIX, per door, with no answer changed for an authorised caller:
--   * custom.io_comment_write / io_comment_resolve / io_comments ask
--     `custom.assert_client_may_reach(p_organization_id, '<this door>')` right after the switch:
--     DOOR-1's one order (the wall, then the row) — the line custom.read_record and
--     custom.comment_thread (the wrapper the app reads a thread through) already ask. Members,
--     portal principals, people a Table of the organization is shared with, and scope members pass
--     it exactly as before (portal_admits' three arms), memoised per transaction. The row question
--     is untouched: platform.detail_parent_access_for at viewer/commenter, as RC-A2h wrote it.
--     A stranger naming another organization is now refused with the wall's plain sentence
--     ("You are not a member of that organization, so custom.io_comments has nothing to do
--     there.") instead of io_comments quietly answering an empty thread.
--   * platform.knob_person_for: the identical decision, in plpgsql. It answers the person asked
--     about only when that person is the caller or the trusted backend is asking, NULL otherwise.
--
-- Nothing else is touched: no table, grant, door row, kernel member or fingerprinted body
-- (iam.entity_read_kernel_* do not list these four). Inverse:
-- migrations/inverse/storedoorsdecidered_record_comment_doors_and_the_knob_reader_decide_in_their_own_body_down.sql
-- Suite (red on the old bodies, green on these): scripts/campaign-tests/doorsdecide_green.sql

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
  -- THE ORGANIZATION WALL, IN THIS DOOR'S OWN BODY (STORE-DOORS-DECIDE-RED, 2026-09-26). RC-A2h
  -- moved the row question to platform.detail_parent_access_for, which is right and stays; this
  -- is the first half of DOOR-1's one order (the wall, then the row) that custom.read_record and
  -- custom.comment_thread already ask. Members, portal principals, people a Table of this
  -- organization is shared with and scope members pass it exactly as before (memoised per
  -- transaction); a stranger now hears a sentence instead of a door that trusted its argument.
  perform custom.assert_client_may_reach(p_organization_id, 'custom.io_comment_write');
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
  -- THE ORGANIZATION WALL, IN THIS DOOR'S OWN BODY (STORE-DOORS-DECIDE-RED, 2026-09-26). RC-A2h
  -- moved the row question to platform.detail_parent_access_for, which is right and stays; this
  -- is the first half of DOOR-1's one order (the wall, then the row) that custom.read_record and
  -- custom.comment_thread already ask. Members, portal principals, people a Table of this
  -- organization is shared with and scope members pass it exactly as before (memoised per
  -- transaction); a stranger now hears a sentence instead of a door that trusted its argument.
  perform custom.assert_client_may_reach(p_organization_id, 'custom.io_comment_resolve');
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
  -- THE ORGANIZATION WALL, IN THIS DOOR'S OWN BODY (STORE-DOORS-DECIDE-RED, 2026-09-26). RC-A2h
  -- moved the row question to platform.detail_parent_access_for, which is right and stays; this
  -- is the first half of DOOR-1's one order (the wall, then the row) that custom.read_record and
  -- custom.comment_thread already ask. Members, portal principals, people a Table of this
  -- organization is shared with and scope members pass it exactly as before (memoised per
  -- transaction); a stranger now hears a sentence instead of a door that trusted its argument.
  perform custom.assert_client_may_reach(p_organization_id, 'custom.io_comments');
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
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
begin
  -- RC-A8: the user rung a caller may stand on - the person named, only when that person IS the
  -- caller or the trusted backend is asking; NULL otherwise, so a resolve answers the organization
  -- and platform layers. SECURITY INVOKER on purpose: it reads the caller's own session
  -- (auth.uid(), iam.is_trusted_backend()), also when called inside a SECURITY DEFINER.
  -- STORE-DOORS-DECIDE-RED (2026-09-26): the identical decision in plpgsql, because a LANGUAGE sql
  -- body with SET is not inlinable and was re-planned on every call the ladder made.
  if p_user is not null and (iam.is_trusted_backend() or p_user = (select auth.uid())) then
    return p_user;
  end if;
  return null;
end;
$function$;
