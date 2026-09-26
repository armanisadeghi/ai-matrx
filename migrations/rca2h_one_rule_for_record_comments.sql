-- rca2h_one_rule_for_record_comments
-- based-on: iam.has_access_for_base(uuid, text, uuid, permission_level, boolean, text[]) cd55cecb5c837fa0c22382f55c192a6c7befeb34c99d4fb73c97e28444bd9212
-- based-on: iam._apply_rls_unchecked(text, text, text, text) bf478df1ca3b95728d93e630ca7b57b25f278ef9dea066c21638ca4be464fd28
-- based-on: iam.verify_canonical(text, text, text, text) 12c6f216423cbed4838c3ba9f32d0721a8b17c84825372fc0a3a96c905e49127
-- based-on: public.cmt_list(text, uuid) a03f1a0e2fefbdd5fabc1c6471a13f94f5c27fbf771e8708d424e05a35ec5660
-- based-on: public.cmt_add(text, uuid, text, uuid, uuid, jsonb, text, uuid) 6fd31f1f56f5b982456f8529bfd6e6d1bf14e3e0a17bad5decd3c5af9923061d
-- based-on: public.cmt_edit(uuid, text, integer) faf2507a020eb52244abcfafe1886fa799a0b136957bb3b92acf596998169596
-- based-on: public.cmt_resolve(uuid, boolean) d2cf998e121073c734d2f4cb990ddcee59d1ba711f6c4f0918ca8ea3a1551e78
-- based-on: public.cmt_delete(uuid) e510b6c20926b7ceb33e5b338094544bee81a1b0f6788cc4cae7b4e15f8bbd45
-- based-on: public.cmt_mention_candidates(text, uuid, text, integer) 41f5b00be42ea024b4128c06dab9198725502813a7946697cac3ae5828b75aa0
-- based-on: public.cmt_mention_notify(uuid, uuid[], text) e82810bbc528a2dac88336d0b7284304dc3443d72508dcafa8ebcc1686e18ead
-- based-on: platform.comments_topic_admits(text) 2eefcb7477ae85a2b0979f93dc28d19966d45c5b08a484b88532e469c214b82b
-- based-on: custom.io_comment_write(uuid, uuid, text, jsonb, uuid) 8d1b8d6af688867c7611dc45479454f1c112836a3a34fb97af0a34f7705def4a
-- based-on: custom.io_comment_resolve(uuid, uuid, boolean) 38202dbd7c4eb4bb889e4d19569e6f6f847719d85ac28319fee2d6eea5e478c9
-- based-on: custom.io_comments(uuid, uuid, boolean) df036036fc3ea888813e1a8a3c6a86a806f97c102c2db12f4cc01436df25d548
-- based-on: custom.comment_thread(uuid, uuid, boolean) cb4b22b0beb357b77dd18f312d8873bf7d1617138c860c15b81a43f1abc77a04
-- based-on: custom.comment_write(uuid, uuid, text, jsonb, uuid, uuid[]) 38c37b480c4ae22818696af53db0c1cfa2a0ee1672312e57d021a7ef8f6477bc
-- based-on: public.access_request_create(text, uuid, text, text) 97e326d520ec2eb478976c2a830048dd1974e2434d17797ffc0a425a87d65d72
--
-- RC-A2 round 3 (N1–N3 of common-docs/projects/rich-content-unification/evidence/verify-RC-A2.md,
-- 00fb8fcb1). Register row RC-A2.
--
-- N1 (chair ruling, Airtable behaviour: sharing one record never opens the base's discussion).
--   The Data Tables comment doors (custom.io_comments behind custom.comment_thread, io_comment_write,
--   io_comment_resolve, comment_write's mention check) asked custom.has_visibility. Its LAST arm —
--   "a Table you can see something inside is a Table you may know" — exists so a person shared one
--   row can see the Table's name and columns, and its own header says "IT DOES NOT CARRY". Asked
--   about a Table's comments, it carried: a one-row sharee read the discussion on the Table itself
--   (measured live, rolled back: 1 Table comment readable). Census of every other has_visibility
--   caller: the last arm only answers for a TABLE id at viewer, and every other door that can be
--   handed a Table id returns the Table's own identity (name, columns, card, label, schema history,
--   portal/capture metadata) — what the arm is for — or lists rows it checks one by one; only the
--   comment doors returned content (the discussion). They are fixed here.
-- N2 (one rule). People the Data Tables sharing model admits to a record (a Table shared with them,
--   a portal visitor, a scope member — custom.reaches_directly's store arms) saw its thread through
--   the Data Tables door while cmt_list, the table read, the `comment` token and the realtime topic
--   refused them, so their open thread never heard a delete or restore.
-- THE ONE RULE: platform.detail_parent_access_for(person, type, id, level) is what a comment asks
--   about the record it is on — custom.reaches_directly for a Data Tables `record` (the store's own
--   grant model, which calls the kernel as its first arm and adds the store's carrying, WITHOUT the
--   "may know the Table" arm), iam.has_access_for for every other record type.
--   platform.detail_parent_access(type, id, level) is the same for the signed-in caller (the RLS
--   predicate). Every comment door, the kernel's detail branch, the generator's detail lane (the
--   table read, so realtime), the certifier's check of it, and the delete/restore topic ask it.
-- N3. public.access_request_create on a comment files the request against the record its access
--   comes from (marked `via`), never against the comment — a grant on a comment admits nobody.
-- Forcing suite: aidream db/tests/test_rca2h_one_rule_for_record_comments.py (RCA2H_BEFORE=1 = red:
-- 3 failed on production 2026-09-26). The last statement regenerates platform.comments' RLS through
-- the generator (policy DDL: the sub-second auth/storage/realtime freeze measured in RC-A2b).

set local lock_timeout = '2s';

create or replace function platform.detail_parent_access_for(p_user uuid, p_type text, p_id uuid,
                                                             p_required public.permission_level default 'viewer')
returns boolean
language plpgsql
stable
set search_path to 'pg_catalog'
as $fn$
begin
  -- RC-A2h: THE ONE RULE a comment (any detail) asks about the record it is on. A Data Tables
  -- record answers by the store's own grant model — the kernel plus the store's carrying (a shared
  -- Table, a portal, a scope) and NEVER the "may know this Table" arm of custom.has_visibility,
  -- which is for a Table's name and columns, not its content. Every other record type answers by
  -- the kernel. Invoker rights: its callers are the kernel, the comment doors and
  -- platform.detail_parent_access, all SECURITY DEFINER.
  if p_user is null or p_type is null or p_id is null then return false; end if;
  if p_type = 'record' then
    return custom.reaches_directly(p_user, 'record', p_id, p_required);
  end if;
  return iam.has_access_for(p_user, p_type, p_id, p_required);
end;
$fn$;

create or replace function platform.detail_parent_access(p_type text, p_id uuid,
                                                         p_required public.permission_level default 'viewer')
returns boolean
language sql
stable
security definer
set search_path to 'pg_catalog'
as $fn$
  -- RC-A2h: the one rule for the signed-in caller — the predicate platform.comments' generated
  -- policies and the comments topic ask.
  select platform.detail_parent_access_for((select auth.uid()), p_type, p_id, p_required)
$fn$;

insert into platform.client_callable_door (schema_name, function_name, identity_args, identity_argtypes,
                                           reason, declared_by, signed_in_callers, anonymous_callers)
values ('platform', 'detail_parent_access', 'p_type text, p_id uuid, p_required permission_level',
        array['text'::regtype, 'uuid'::regtype, 'public.permission_level'::regtype]::oid[],
        'The RLS predicate of platform.comments (a detail) and the question every comment door asks about the record a comment is on. It answers only for the signed-in caller (auth.uid()), true/false, exactly what that person could learn by opening the record: iam.has_access for a platform record, custom.reaches_directly for a Data Tables record. No organization argument; p_id is checked against the caller''s own access and a missing id answers false.',
        'rca2h_one_rule_for_record_comments.sql', true, false);
grant execute on function platform.detail_parent_access(text, uuid, public.permission_level) to authenticated;

do $patch$
declare
  v_def text;
  v_n int;
  r record;
begin
  for r in
    select * from (values
      -- the kernel's detail branch
      (1, 'iam.has_access_for_base(uuid,text,uuid,permission_level,boolean,text[])', 3,
       $a$iam.has_access_for(v_uid, v_detail_type, v_detail_id,$a$,
       $a$platform.detail_parent_access_for(v_uid, v_detail_type, v_detail_id,$a$),
      -- the generator's detail lane (select ×2 forms, insert, update using+check, delete)
      (2, 'iam._apply_rls_unchecked(text,text,text,text)', 6,
       $a$iam.has_access(entity_type, entity_id, $a$,
       $a$platform.detail_parent_access(entity_type, entity_id, $a$),
      -- the certifier accepts the one rule as the detail's read
      (3, 'iam.verify_canonical(text,text,text,text)', 1,
       $a$IF COALESCE(v_sel,'') LIKE '%has_access(entity_type, entity_id, ''viewer''::%'$a$,
       $a$IF (COALESCE(v_sel,'') LIKE '%has_access(entity_type, entity_id, ''viewer''::%'
        OR COALESCE(v_sel,'') LIKE '%detail_parent_access(entity_type, entity_id, ''viewer''::%')$a$),
      -- the comment doors
      (4,  'public.cmt_list(text,uuid)', 1, $a$iam.has_access($a$, $a$platform.detail_parent_access($a$),
      (5,  'public.cmt_add(text,uuid,text,uuid,uuid,jsonb,text,uuid)', 1, $a$iam.has_access($a$, $a$platform.detail_parent_access($a$),
      (6,  'public.cmt_edit(uuid,text,integer)', 2, $a$iam.has_access($a$, $a$platform.detail_parent_access($a$),
      (7,  'public.cmt_resolve(uuid,boolean)', 1, $a$iam.has_access($a$, $a$platform.detail_parent_access($a$),
      (8,  'public.cmt_delete(uuid)', 1, $a$iam.has_access($a$, $a$platform.detail_parent_access($a$),
      (9,  'public.cmt_mention_candidates(text,uuid,text,integer)', 1, $a$iam.has_access($a$, $a$platform.detail_parent_access($a$),
      (10, 'public.cmt_mention_candidates(text,uuid,text,integer)', 1, $a$iam.has_access_for($a$, $a$platform.detail_parent_access_for($a$),
      (11, 'public.cmt_mention_notify(uuid,uuid[],text)', 1, $a$iam.has_access_for($a$, $a$platform.detail_parent_access_for($a$),
      (12, 'platform.comments_topic_admits(text)', 1, $a$iam.has_access($a$, $a$platform.detail_parent_access($a$),
      -- the Data Tables comment doors (N1): the one rule, never the "may know the Table" arm
      (13, 'custom.io_comment_write(uuid,uuid,text,jsonb,uuid)', 2,
       $a$custom.has_visibility(v_user, 'record', p_record_id,$a$, $a$platform.detail_parent_access_for(v_user, 'record', p_record_id,$a$),
      (14, 'custom.io_comment_resolve(uuid,uuid,boolean)', 1,
       $a$custom.has_visibility(v_user, 'record', v_record,$a$, $a$platform.detail_parent_access_for(v_user, 'record', v_record,$a$),
      (15, 'custom.io_comments(uuid,uuid,boolean)', 1,
       $a$custom.has_visibility(custom.query_principal(), 'record', p_record_id,$a$, $a$platform.detail_parent_access_for(custom.query_principal(), 'record', p_record_id,$a$),
      (16, 'custom.comment_thread(uuid,uuid,boolean)', 2,
       $a$custom.has_visibility(v_user, 'record', p_record_id,$a$, $a$platform.detail_parent_access_for(v_user, 'record', p_record_id,$a$),
      (17, 'custom.comment_write(uuid,uuid,text,jsonb,uuid,uuid[])', 1,
       $a$custom.has_visibility(v_who, 'record', p_record_id,$a$, $a$platform.detail_parent_access_for(v_who, 'record', p_record_id,$a$),
      -- N3: a request for a comment is a request for its record
      (18, 'public.access_request_create(text,uuid,text,text)', 1,
       $a$  v_upgraded boolean := false;
begin
$a$,
       $a$  v_upgraded boolean := false;
  v_parent_type text; v_parent_id uuid;  -- RC-A2h (N3)
begin
$a$),
      (19, 'public.access_request_create(text,uuid,text,text)', 1,
       $a$  if v_uid is null then
    raise exception 'Sign in to request access.' using errcode = '42501';
  end if;
$a$,
       $a$  if v_uid is null then
    raise exception 'Sign in to request access.' using errcode = '42501';
  end if;

  -- 🚨 RC-A2h (N3): A REQUEST FOR A COMMENT IS A REQUEST FOR ITS RECORD. A detail's access only
  -- ever comes from the record it is on (platform.detail_parent_columns); a grant on the comment
  -- itself admits nobody, so filing against it would be a dead end. The request goes to the
  -- record, marked `via` the detail token.
  if platform.token_is_detail(p_resource_type) then
    select et.schema_name, et.table_name into v_meta
      from platform.entity_types et
     where et.token = p_resource_type and coalesce(et.is_active, true);
    if v_meta.schema_name is not null and platform.detail_parent_columns(p_resource_type) is not null then
      execute format('select coalesce(to_jsonb(t) ->> $2, $3), (to_jsonb(t) ->> $4)::uuid from %I.%I t where t.id = $1',
                     v_meta.schema_name, v_meta.table_name)
        into v_parent_type, v_parent_id
        using p_resource_id, (platform.detail_parent_columns(p_resource_type))[1],
              (platform.detail_parent_columns(p_resource_type))[3],
              (platform.detail_parent_columns(p_resource_type))[2];
    end if;
    if v_parent_type is null or v_parent_id is null then
      raise exception 'That % no longer exists.', lower(p_resource_type) using errcode = '02000';
    end if;
    return public.access_request_create(v_parent_type, v_parent_id, p_level, p_message)
           || jsonb_build_object('via', jsonb_build_object('token', p_resource_type));
  end if;
$a$)
    ) as t(ord, fn, expected, anchor, repl)
    order by ord
  loop
    v_def := pg_get_functiondef(r.fn::regprocedure);
    v_n := (length(v_def) - length(replace(v_def, r.anchor, ''))) / length(r.anchor);
    if v_n <> r.expected then
      raise exception 'rca2h patch %: anchor occurs % time(s) in %, expected % — nothing was changed', r.ord, v_n, r.fn, r.expected;
    end if;
    execute replace(v_def, r.anchor, r.repl);
  end loop;
end
$patch$;

-- The table read (and so the realtime feed) asks the one rule: regenerate through the generator.
select iam.apply_rls('platform', 'comments', 'comment', 'detail');
