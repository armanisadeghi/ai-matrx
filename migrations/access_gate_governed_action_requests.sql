-- Governed write denials need the same durable request + direct-message loop
-- as read denials.  `resource_action` records a one-click owner action while
-- `requested_level = admin` is the canonical "full access" request.

set local lock_timeout = '8s';

alter table iam.access_requests
  drop constraint if exists access_requests_request_kind_check;
alter table iam.access_requests
  add constraint access_requests_request_kind_check
  check (request_kind = any (array['resource_access'::text, 'resource_action'::text, 'setting'::text]));

alter table iam.access_requests
  drop constraint if exists access_requests_requested_level_check;
alter table iam.access_requests
  add constraint access_requests_requested_level_check
  check (requested_level = any (array['viewer'::text, 'editor'::text, 'admin'::text]));

create or replace function public.access_request_create(
  p_resource_type text,
  p_resource_id uuid,
  p_level text default 'viewer'::text,
  p_message text default null::text
) returns jsonb
language plpgsql
security definer
set search_path to 'public', 'platform', 'iam'
as $function$
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
begin
  if v_uid is null then
    raise exception 'Sign in to request access.' using errcode = '42501';
  end if;

  if v_command = 'delete' then
    v_kind := 'resource_action';
    v_request_key := 'delete';
    v_level := 'admin';
  elsif v_command in ('viewer', 'editor', 'admin') then
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

  v_org := public.current_personal_org_id();

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

create or replace function public.access_request_decide(
  p_request_id uuid,
  p_decision text,
  p_level text default null::text,
  p_note text default null::text
) returns jsonb
language plpgsql
security definer
set search_path to 'public', 'platform', 'iam'
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_req record;
  v_level public.permission_level;
  v_meta record;
  v_attrs record;
  v_can_decide boolean;
begin
  if v_uid is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  if p_decision not in ('grant', 'decline', 'complete') then
    raise exception 'Unsupported decision.' using errcode = '22023';
  end if;

  select * into v_req
  from iam.access_requests
  where id = p_request_id and deleted_at is null
  for update;

  if v_req.id is null then
    raise exception 'That request no longer exists.' using errcode = '02000';
  end if;
  if v_req.created_by = v_uid then
    raise exception 'You cannot answer your own request.' using errcode = '42501';
  end if;
  if v_req.status <> 'pending' then
    return jsonb_build_object('id', v_req.id, 'status', v_req.status,
                              'already', true);
  end if;

  v_can_decide := iam.can_decide_access_request(
    v_uid, v_req.resource_type, v_req.resource_id
  ) or (
    v_req.request_kind = 'resource_action'
    and coalesce(v_req.request_payload->'recipient_ids', '[]'::jsonb) ? v_uid::text
  );
  if not v_can_decide then
    raise exception 'You are not able to answer this request.' using errcode = '42501';
  end if;

  if p_decision = 'complete' and v_req.request_kind <> 'resource_action' then
    raise exception 'Only an action request can be completed.' using errcode = '22023';
  end if;

  if p_decision = 'grant' then
    select et.schema_name, et.table_name into v_meta
    from platform.entity_types et where et.token = v_req.resource_type;
    if v_meta.schema_name is not null then
      select * into v_attrs
      from platform.entity_row_access_attrs(v_meta.schema_name, v_meta.table_name,
                                            v_req.resource_id);
      if not coalesce(v_attrs.o_found, false) then
        raise exception 'That item no longer exists, so access cannot be granted.'
          using errcode = '02000';
      end if;
    end if;

    v_level := coalesce(nullif(p_level, ''), v_req.requested_level)::public.permission_level;
    insert into iam.permissions
      (resource_type, resource_id, granted_to_user_id, permission_level,
       status, created_by)
    values
      (v_req.resource_type, v_req.resource_id, v_req.created_by, v_level,
       'active', v_uid)
    on conflict (resource_type, resource_id, granted_to_user_id)
      do update set permission_level = excluded.permission_level,
                    status = 'active',
                    expires_at = null;
  end if;

  update iam.access_requests
     set status = case when p_decision in ('grant', 'complete') then 'granted' else 'declined' end,
         decided_by = v_uid,
         decided_at = now(),
         decision_note = nullif(btrim(p_note), ''),
         requested_level = case when p_decision = 'grant' then v_level::text else requested_level end
   where id = p_request_id;

  return jsonb_build_object(
    'id', p_request_id,
    'status', case when p_decision in ('grant', 'complete') then 'granted' else 'declined' end,
    'already', false,
    'request_kind', v_req.request_kind,
    'action_key', nullif(v_req.request_key, ''),
    'requester_id', v_req.created_by,
    'resource_type', v_req.resource_type,
    'resource_id', v_req.resource_id,
    'entity_label', coalesce(v_req.request_payload->>'entity_label',
      (select label from platform.entity_types where token = v_req.resource_type)),
    'entity_title', coalesce(v_req.request_payload->>'entity_title',
      platform.entity_title(v_req.resource_type, v_req.resource_id))
  );
end;
$function$;

create or replace function public.access_request_list(p_box text default 'inbox'::text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'platform', 'iam'
as $function$
declare v_uid uuid := auth.uid(); v_rows jsonb;
begin
  if v_uid is null then return '[]'::jsonb; end if;
  if p_box = 'sent' then
    select coalesce(jsonb_agg(row_json order by created_at desc), '[]'::jsonb) into v_rows
    from (
      select ar.created_at, jsonb_build_object(
        'id', ar.id, 'status', ar.status, 'requested_level', ar.requested_level,
        'message', ar.message, 'created_at', ar.created_at, 'decided_at', ar.decided_at,
        'decision_note', ar.decision_note, 'resource_type', ar.resource_type,
        'resource_id', ar.resource_id,
        'entity_label', case
          when ar.request_kind = 'setting' then 'Organization setting'
          else coalesce(ar.request_payload->>'entity_label', et.label) end,
        'entity_title', case
          when ar.request_kind = 'setting' then ar.request_payload->>'setting_label'
          else coalesce(ar.request_payload->>'entity_title', platform.entity_title(ar.resource_type, ar.resource_id)) end,
        'request_kind', ar.request_kind, 'request_key', ar.request_key,
        'request_payload', ar.request_payload
      ) row_json
      from iam.access_requests ar
      left join platform.entity_types et on et.token = ar.resource_type
      where ar.created_by = v_uid and ar.deleted_at is null
    ) s;
    return v_rows;
  end if;

  select coalesce(jsonb_agg(row_json order by created_at desc), '[]'::jsonb) into v_rows
  from (
    select ar.created_at, jsonb_build_object(
      'id', ar.id, 'status', ar.status, 'requested_level', ar.requested_level,
      'message', ar.message, 'created_at', ar.created_at,
      'resource_type', ar.resource_type, 'resource_id', ar.resource_id,
      'entity_label', case
        when ar.request_kind = 'setting' then 'Organization setting'
        else coalesce(ar.request_payload->>'entity_label', et.label) end,
      'entity_title', case
        when ar.request_kind = 'setting' then ar.request_payload->>'setting_label'
        else coalesce(ar.request_payload->>'entity_title', platform.entity_title(ar.resource_type, ar.resource_id)) end,
      'request_kind', ar.request_kind, 'request_key', ar.request_key,
      'request_payload', ar.request_payload,
      'requester', jsonb_build_object('user_id', ar.created_by,
        'display_name', nullif(pr.display_name, ''), 'avatar_url', nullif(pr.avatar_url, ''))
    ) row_json
    from iam.access_requests ar
    left join platform.entity_types et on et.token = ar.resource_type
    left join users.profiles pr on pr.id = ar.created_by
    where ar.status = 'pending' and ar.deleted_at is null and ar.created_by <> v_uid
      and (
        (ar.request_kind in ('resource_access', 'resource_action')
          and iam.can_decide_access_request(v_uid, ar.resource_type, ar.resource_id))
        or (ar.request_kind = 'resource_action'
          and coalesce(ar.request_payload->'recipient_ids', '[]'::jsonb) ? v_uid::text)
        or (ar.request_kind = 'setting' and exists (
          select 1 from iam.organization_member m
          where m.organization_id = ar.resource_id and m.user_id = v_uid
            and m.role in ('owner', 'admin')
        ))
      )
  ) s;
  return v_rows;
end;
$function$;

notify pgrst, 'reload schema';
