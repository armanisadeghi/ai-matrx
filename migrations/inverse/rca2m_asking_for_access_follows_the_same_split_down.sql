-- chair-step: rehearsal inverse of rca2m — restores access_request_create's own body, blind/list/access_denied_context, drops public._access_request_file.
-- based-on: public.access_request_create(text, uuid, text, text) fa3a983c642c90bd2e070425c59b0dfbf0123a2c6f037a039205a8e779f2cba2
-- based-on: public.access_request_blind(text, uuid, text, text) 91ee4507d71cfb4ee0bb44562e9514c3fe20a1b82bbfebd2e98a92855b6aa1a6
-- based-on: public.access_request_list(text) b900eb849465308877cd4e4e54a0f9fd5976dd25543b06944e703d9774f9f909
-- based-on: public.access_denied_context(text, uuid) 143bea2914d264344db6044982d99883af57c550c3f2cf133485cab7200a05cb
-- Inverse of migrations/rca2m_asking_for_access_follows_the_same_split.sql (rehearsal only).

set local lock_timeout = '2s';

do $patch$
declare
  v_def text;
  v_n int;
  r record;
  v_fn text := null;
begin
  for r in
    select * from (values
      (1, 'public.access_denied_context(text,uuid)',
       $a$     -- RC-A2m (chair refinement): the organization's owners/admins keep the full answer only for
     -- records the ORGANIZATION holds — never a member's PERSONAL record (access is personal).
     and not (v_attrs.o_org is not null
              and v_attrs.o_vis is distinct from 'personal'::platform.visibility
              and public.is_org_admin_for(v_uid, v_attrs.o_org)) then
$a$,
       $a$     and not (v_attrs.o_org is not null and public.is_org_admin_for(v_uid, v_attrs.o_org)) then
$a$),
      (2, 'public.access_request_blind(text,uuid,text,text)',
       $a$public._access_request_file(v_meta.token, p_id, 'viewer', v_note)$a$,
       $a$public.access_request_create(v_meta.token, p_id, 'viewer', v_note)$a$),
      (3, 'public.access_request_list(text)',
       $a$
        -- RC-A2m: a request is listed only while the not-found split lets the asker know of the record
        and (ar.request_kind = 'setting'
             or (public.access_denied_context(ar.resource_type, ar.resource_id) ->> 'exists') = 'true')
$a$,
       E'\n')
    ) as t(ord, fn, anchor, repl)
    order by ord
  loop
    if v_fn is distinct from r.fn then
      if v_fn is not null then execute v_def; end if;
      v_fn := r.fn;
      v_def := pg_get_functiondef(r.fn::regprocedure);
    end if;
    v_n := (length(v_def) - length(replace(v_def, r.anchor, ''))) / length(r.anchor);
    if v_n <> 1 then
      raise exception 'rca2m inverse %: anchor occurs % time(s) in %, expected 1', r.ord, v_n, r.fn;
    end if;
    v_def := replace(v_def, r.anchor, r.repl);
  end loop;
  execute v_def;
end
$patch$;

-- access_request_create's own body, as it was
CREATE OR REPLACE FUNCTION public.access_request_create(p_resource_type text, p_resource_id uuid, p_level text DEFAULT 'viewer'::text, p_message text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'platform', 'iam'
AS $function$
declare
  v_uid uuid := (select auth.uid());
  v_command text := coalesce(nullif(p_level, ''), 'viewer');
  v_level text;
  v_kind text := 'resource_access';
  v_request_key text := '';
  v_meta record;
  v_attrs record;
  v_existing record;
  v_org uuid;
  v_id uuid;
  v_recent int;
  v_recipients jsonb;
  v_recipient_ids jsonb;
  v_payload jsonb := '{}'::jsonb;
  v_upgraded boolean := false;
  v_parent_type text; v_parent_id uuid;  -- RC-A2h (N3)
begin
  if v_uid is null then
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

  if v_command = 'delete' then
    v_kind := 'resource_action';
    v_request_key := 'delete';
    v_level := 'admin';
  elsif v_command in ('viewer', 'commenter', 'editor', 'admin') then
    v_level := v_command;
  else
    v_level := 'viewer';
  end if;

  select et.schema_name, et.table_name, et.label into v_meta
  from platform.entity_types et
  where et.token = p_resource_type and coalesce(et.is_active, true);

  if v_meta.schema_name is null then
    raise exception 'We could not identify what you are asking for.'
      using errcode = '22023';
  end if;

  select * into v_attrs
  from platform.entity_row_access_attrs(v_meta.schema_name, v_meta.table_name, p_resource_id);

  if not coalesce(v_attrs.o_found, false) then
    raise exception 'That % no longer exists.', lower(coalesce(v_meta.label, 'item'))
      using errcode = '02000';
  end if;

  if v_kind = 'resource_action' then
    if not iam.has_access(p_resource_type, p_resource_id, 'editor'::public.permission_level) then
      raise exception 'You need edit access before asking the owner to delete this %.',
        lower(coalesce(v_meta.label, 'item')) using errcode = '42501';
    end if;
    if iam.has_access(p_resource_type, p_resource_id, 'admin'::public.permission_level) then
      raise exception 'You already have full access to this %.',
        lower(coalesce(v_meta.label, 'item')) using errcode = '23505';
    end if;
  elsif iam.has_access(p_resource_type, p_resource_id, v_level::public.permission_level) then
    raise exception 'You already have the access you requested for this %.',
      lower(coalesce(v_meta.label, 'item')) using errcode = '23505';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'user_id', r.user_id,
           'reason', r.reason,
           'display_name', nullif(pr.display_name, '')
         )), '[]'::jsonb),
         coalesce(jsonb_agg(to_jsonb(r.user_id::text)), '[]'::jsonb)
    into v_recipients, v_recipient_ids
  from iam.access_request_recipients(p_resource_type, p_resource_id) r
  left join users.profiles pr on pr.id = r.user_id;

  if v_recipients = '[]'::jsonb then
    raise exception 'There is nobody who can grant access to this %.',
      lower(coalesce(v_meta.label, 'item')) using errcode = '42501';
  end if;

  if v_kind = 'resource_action' then
    v_payload := jsonb_build_object(
      'action_key', 'delete',
      'action_label', 'Delete ' || coalesce(v_meta.label, 'item'),
      'entity_label', v_meta.label,
      'entity_title', platform.entity_title(p_resource_type, p_resource_id),
      'recipient_ids', v_recipient_ids
    );
  end if;

  select ar.id, ar.status, ar.request_kind, ar.requested_level, ar.request_key
    into v_existing
  from iam.access_requests ar
  where ar.resource_type = p_resource_type
    and ar.resource_id = p_resource_id
    and ar.created_by = v_uid
    and ar.deleted_at is null
  order by ar.created_at desc
  limit 1;

  if v_existing.status = 'pending' then
    v_upgraded := v_existing.request_kind is distinct from v_kind
      or v_existing.requested_level is distinct from v_level
      or coalesce(v_existing.request_key, '') is distinct from v_request_key;
    if v_upgraded then
      update iam.access_requests
         set request_kind = v_kind,
             request_key = v_request_key,
             request_payload = v_payload,
             requested_level = v_level,
             message = nullif(btrim(p_message), ''),
             updated_at = now(),
             updated_by = v_uid
       where id = v_existing.id;
    end if;
    return jsonb_build_object(
      'request_id', v_existing.id,
      'status', 'pending',
      'already', not v_upgraded,
      'level', v_level,
      'request_kind', v_kind,
      'action_key', nullif(v_request_key, ''),
      'entity_label', v_meta.label,
      'entity_title', platform.entity_title(p_resource_type, p_resource_id),
      'recipients', case when v_upgraded then v_recipients else '[]'::jsonb end
    );
  end if;
  if v_existing.status = 'reported' then
    raise exception 'You can no longer make requests about this %.',
      lower(coalesce(v_meta.label, 'item')) using errcode = '42501';
  end if;

  select count(*) into v_recent
  from iam.access_requests ar
  where ar.created_by = v_uid
    and ar.created_at > now() - interval '1 day'
    and ar.deleted_at is null;
  if v_recent >= 25 then
    raise exception 'You have sent a lot of access requests today. Try again tomorrow.'
      using errcode = '54000';
  end if;

  -- THE RECORD ANSWERS. A request to be let into something is recorded where that
  -- something lives, so the people who can grant it can see it. It used to be recorded
  -- in the REQUESTER'S personal workspace.
  if platform.entity_is_org_scoped(p_resource_type) then
    v_org := platform.entity_organization_id(p_resource_type, p_resource_id);
  end if;
  if v_org is null then
    raise exception
      'We could not tell which organization this % belongs to, so your request was not filed.',
      lower(coalesce(v_meta.label, 'item'))
      using errcode = '23502',
            hint = 'This kind of record does not carry an organization, so there is nowhere to file a request about it. Ask the owner directly.';
  end if;

  begin
    insert into iam.access_requests
      (organization_id, created_by, resource_type, resource_id, requested_level,
       message, request_kind, request_key, request_payload)
    values
      (v_org, v_uid, p_resource_type, p_resource_id, v_level,
       nullif(btrim(p_message), ''), v_kind, v_request_key, v_payload)
    returning id into v_id;
  exception when unique_violation then
    select ar.id into v_id
    from iam.access_requests ar
    where ar.resource_type = p_resource_type
      and ar.resource_id = p_resource_id
      and ar.created_by = v_uid
      and ar.status = 'pending'
      and ar.deleted_at is null
    limit 1;
    return jsonb_build_object('request_id', v_id, 'status', 'pending',
                              'already', true, 'level', v_level,
                              'request_kind', v_kind, 'recipients', '[]'::jsonb);
  end;

  return jsonb_build_object(
    'request_id', v_id,
    'status', 'pending',
    'already', false,
    'level', v_level,
    'request_kind', v_kind,
    'action_key', nullif(v_request_key, ''),
    'entity_label', v_meta.label,
    'entity_title', platform.entity_title(p_resource_type, p_resource_id),
    'recipients', v_recipients
  );
end;
$function$;

delete from platform.client_callable_door where schema_name = 'public' and function_name = '_access_request_file';
drop function public._access_request_file(text, uuid, text, text);
