-- chair-step: rule-27 rehearsal inverse of rca2h_one_rule_for_record_comments.sql — puts the comment doors, the kernel's detail branch, the generator, the certifier, the topic and access_request_create back on their previous questions and regenerates platform.comments; it RE-OPENS N1 (a one-row sharee reads a Table's discussion). Emergency rollback only.
-- based-on: iam.has_access_for_base(uuid, text, uuid, permission_level, boolean, text[]) a5fa8a2601bd07c9b4675d4c090c3f6b623cd19fbf922138adc1fa892fa636f0
-- based-on: iam._apply_rls_unchecked(text, text, text, text) 506790d2e3f0e9cb629c14197f91d199132e3cef288ba250226a5f96a1e51b69
-- based-on: iam.verify_canonical(text, text, text, text) d55c8fdf991e5e05d7bbe7a0010a99e27ebf27bd80a61a1413ef754a6c318898
-- based-on: public.cmt_list(text, uuid) a1979297692417fceb7f8f89efb7944023ffd4ab3d63a9bb3518646dbc2f1000
-- based-on: public.cmt_add(text, uuid, text, uuid, uuid, jsonb, text, uuid) 0be2466345b4a008850bf71aeac432cf397e6e0c603902a1dec75b8f74a26fc6
-- based-on: public.cmt_edit(uuid, text, integer) b360c529c2ba4f2ea4d42511d198154058cd38af2a500e74ff0ecd635625a009
-- based-on: public.cmt_resolve(uuid, boolean) 365cefc97d77bd62d56fd26ae65b3090247289e3d39a76b08db707cd250985fa
-- based-on: public.cmt_delete(uuid) 887b20ea3c4949a240622ffd09ead5f260897a9d62a08e0550e5b0b63f9f1dbd
-- based-on: public.cmt_mention_candidates(text, uuid, text, integer) ef070b1a4559049f93e7cd798c51692c6e4aa960d0ca509580708ab3dae23c81
-- based-on: public.cmt_mention_notify(uuid, uuid[], text) 0c4b86f3ab093012257acc76cafd4a9d82d9cdbcd1d38ec8e0fb1ec34359512c
-- based-on: platform.comments_topic_admits(text) 240c90a90e95c2bd3fc296b966dbae7c59209df1ba75256e5f3dd18af0021017
-- based-on: custom.io_comment_write(uuid, uuid, text, jsonb, uuid) 55d689d8777517f36ee02670b330d8b0b8969797e0d6a992db3df32ea8922e00
-- based-on: custom.io_comment_resolve(uuid, uuid, boolean) 7e44e0b589c12dbf1dbe86bee04b8d6c749ce9df2f30431d11df621763f2d0de
-- based-on: custom.io_comments(uuid, uuid, boolean) 4576c1e475e7dc3451b4831e24846206a61c3c98294eb667658c4a81488d72dd
-- based-on: custom.comment_thread(uuid, uuid, boolean) 1f8116454bc593afa2e0ce548b02183f93186fdf98073f5aa4ad1084e32feaf9
-- based-on: custom.comment_write(uuid, uuid, text, jsonb, uuid, uuid[]) cf77470fe2cf06990023766920a9d45f908d102dd6c2039316487da93b464e50
-- based-on: public.access_request_create(text, uuid, text, text) cb619bad5729f7f13f4b99c2c38b5956a9e9892843b7a8ec4632ae2054b3389e

set local lock_timeout = '2s';

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
    ) as t(ord, fn, expected, repl, anchor)
    order by ord desc
  loop
    v_def := pg_get_functiondef(r.fn::regprocedure);
    v_n := (length(v_def) - length(replace(v_def, r.anchor, ''))) / length(r.anchor);
    if v_n <> r.expected then
      raise exception 'rca2h inverse %: anchor occurs % time(s) in %, expected % — nothing was changed', r.ord, v_n, r.fn, r.expected;
    end if;
    execute replace(v_def, r.anchor, r.repl);
  end loop;
end
$patch$;

select iam.apply_rls('platform', 'comments', 'comment', 'detail');

delete from platform.client_callable_door where schema_name = 'platform' and function_name = 'detail_parent_access';
drop function if exists platform.detail_parent_access(text, uuid, public.permission_level);
drop function if exists platform.detail_parent_access_for(uuid, text, uuid, public.permission_level);
