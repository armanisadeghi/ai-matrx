-- Access Gate — the request/decide RPC family.
--
-- Four verbs, one table (`iam.access_requests`), one authorization idea:
--   * ASK      — any signed-in user who genuinely lacks access may ask once.
--   * DECIDE   — only someone who administers the TARGET resource may answer.
--   * REPORT   — same authority as decide; ends the conversation permanently.
--   * WITHDRAW — the requester's own retraction.
--
-- WHO RECEIVES THE ASK (owner ruling 2026-08-11): the owner AND, when the row
-- belongs to a shared (non-personal) organization, that org's owners/admins.
-- First to act wins. A request must never die because one person is away.
--
-- Delivery is NOT done here. These RPCs return the recipient list and the
-- client hands it to `sendDirectActionMessage` — the platform's existing
-- "system notifies a user" primitive, which already renders action chips in the
-- DM the user is already reading. No second notification system.

-- ── Who can answer for this resource ────────────────────────────────────────
create or replace function iam.access_request_recipients(
  p_type text,
  p_id uuid
)
returns table (user_id uuid, reason text)
language plpgsql
stable
security definer
set search_path to 'public', 'platform', 'iam'
as $function$
declare
  v_meta   record;
  v_attrs  record;
begin
  select et.schema_name, et.table_name into v_meta
  from platform.entity_types et
  where et.token = p_type and coalesce(et.is_active, true);

  if v_meta.schema_name is null then
    return;
  end if;

  select * into v_attrs
  from platform.entity_row_access_attrs(v_meta.schema_name, v_meta.table_name, p_id);

  if not coalesce(v_attrs.o_found, false) then
    return;
  end if;

  return query
  -- The owner.
  select v_attrs.o_owner, 'owner'::text
  where v_attrs.o_owner is not null
  union
  -- The org's owners/admins, but only for a SHARED org. In a personal
  -- workspace the org owner IS the row owner, and duplicating them would send
  -- the same person two messages.
  select om.user_id, 'org_admin'::text
  from iam.organization_member om
  join iam.organizations o on o.id = om.organization_id
  where v_attrs.o_org is not null
    and om.organization_id = v_attrs.o_org
    and om.role in ('owner', 'admin')
    and coalesce(o.is_personal, false) = false
    and om.user_id is distinct from v_attrs.o_owner;
end;
$function$;

comment on function iam.access_request_recipients(text, uuid) is
  'Everyone entitled to answer an access request for a resource: its owner, plus '
  'the owners/admins of its organization when that org is shared (not personal).';

-- ── Is the caller entitled to decide? ───────────────────────────────────────
create or replace function iam.can_decide_access_request(
  p_user_id uuid,
  p_type text,
  p_id uuid
)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'platform', 'iam'
as $function$
  select p_user_id is not null
     and (
       exists (select 1 from iam.access_request_recipients(p_type, p_id) r
                where r.user_id = p_user_id)
       or iam.has_access_for(p_user_id, p_type, p_id, 'admin'::public.permission_level)
     );
$function$;

-- ── ASK ─────────────────────────────────────────────────────────────────────
create or replace function public.access_request_create(
  p_resource_type text,
  p_resource_id uuid,
  p_level text default 'viewer',
  p_message text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public', 'platform', 'iam'
as $function$
declare
  v_uid       uuid := (select auth.uid());
  v_level     text := coalesce(nullif(p_level, ''), 'viewer');
  v_meta      record;
  v_attrs     record;
  v_existing  record;
  v_org       uuid;
  v_id        uuid;
  v_recent    int;
  v_recipients jsonb;
begin
  if v_uid is null then
    raise exception 'Sign in to request access.' using errcode = '42501';
  end if;
  if v_level not in ('viewer', 'editor') then
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

  -- Asking for something you can already open is a UI bug, not a user action.
  if iam.has_access(p_resource_type, p_resource_id, 'viewer'::public.permission_level) then
    raise exception 'You already have access to this %.',
      lower(coalesce(v_meta.label, 'item')) using errcode = '23505';
  end if;

  select ar.id, ar.status into v_existing
  from iam.access_requests ar
  where ar.resource_type = p_resource_type
    and ar.resource_id = p_resource_id
    and ar.created_by = v_uid
    and ar.deleted_at is null
  order by ar.created_at desc
  limit 1;

  if v_existing.status = 'pending' then
    return jsonb_build_object('request_id', v_existing.id, 'status', 'pending',
                              'already', true, 'recipients', '[]'::jsonb);
  end if;
  if v_existing.status = 'reported' then
    raise exception 'You can no longer request access to this %.',
      lower(coalesce(v_meta.label, 'item')) using errcode = '42501';
  end if;

  -- A humane cap, not a security control: it stops a stuck UI (or a bored
  -- user) from filling someone's inbox.
  select count(*) into v_recent
  from iam.access_requests ar
  where ar.created_by = v_uid
    and ar.created_at > now() - interval '1 day'
    and ar.deleted_at is null;
  if v_recent >= 25 then
    raise exception 'You have sent a lot of access requests today. Try again tomorrow.'
      using errcode = '54000';
  end if;

  -- The request row belongs to the requester's own workspace, so it can never
  -- widen anything in the target's organization.
  v_org := public.current_personal_org_id();

  -- The SELECT above is not a lock, so two tabs can both reach here. The
  -- partial unique index is the real arbiter; losing that race means the ask
  -- already landed, which is exactly the `already` answer — not an error, and
  -- never a raw constraint name in a toast.
  begin
    insert into iam.access_requests
      (organization_id, created_by, resource_type, resource_id, requested_level, message)
    values
      (v_org, v_uid, p_resource_type, p_resource_id, v_level, nullif(btrim(p_message), ''))
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
                              'already', true, 'recipients', '[]'::jsonb);
  end;

  select coalesce(jsonb_agg(jsonb_build_object(
           'user_id', r.user_id,
           'reason', r.reason,
           'display_name', nullif(pr.display_name, '')
         )), '[]'::jsonb)
    into v_recipients
  from iam.access_request_recipients(p_resource_type, p_resource_id) r
  left join users.profiles pr on pr.id = r.user_id;

  return jsonb_build_object(
    'request_id', v_id,
    'status', 'pending',
    'already', false,
    'level', v_level,
    'entity_label', v_meta.label,
    'entity_title', platform.entity_title(p_resource_type, p_resource_id),
    'recipients', v_recipients
  );
end;
$function$;

-- ── LIST (both directions) ──────────────────────────────────────────────────
create or replace function public.access_request_list(
  p_box text default 'inbox'
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'platform', 'iam'
as $function$
declare
  v_uid  uuid := (select auth.uid());
  v_rows jsonb;
begin
  if v_uid is null then
    return '[]'::jsonb;
  end if;

  if p_box = 'sent' then
    select coalesce(jsonb_agg(row_json order by created_at desc), '[]'::jsonb)
      into v_rows
    from (
      select ar.created_at,
             jsonb_build_object(
               'id', ar.id,
               'status', ar.status,
               'requested_level', ar.requested_level,
               'message', ar.message,
               'created_at', ar.created_at,
               'decided_at', ar.decided_at,
               'decision_note', ar.decision_note,
               'resource_type', ar.resource_type,
               'resource_id', ar.resource_id,
               'entity_label', et.label,
               'entity_title', platform.entity_title(ar.resource_type, ar.resource_id)
             ) as row_json
      from iam.access_requests ar
      left join platform.entity_types et on et.token = ar.resource_type
      where ar.created_by = v_uid and ar.deleted_at is null
    ) s;
    return v_rows;
  end if;

  -- Inbox: everything I am entitled to answer. Bounded by "requests that exist
  -- at all", then authorized one resource at a time — the set is small by
  -- construction (open asks against MY things), never a table scan of grants.
  select coalesce(jsonb_agg(row_json order by created_at desc), '[]'::jsonb)
    into v_rows
  from (
    select ar.created_at,
           jsonb_build_object(
             'id', ar.id,
             'status', ar.status,
             'requested_level', ar.requested_level,
             'message', ar.message,
             'created_at', ar.created_at,
             'resource_type', ar.resource_type,
             'resource_id', ar.resource_id,
             'entity_label', et.label,
             'entity_title', platform.entity_title(ar.resource_type, ar.resource_id),
             'requester', jsonb_build_object(
               'user_id', ar.created_by,
               'display_name', nullif(pr.display_name, ''),
               'avatar_url', nullif(pr.avatar_url, '')
             )
           ) as row_json
    from iam.access_requests ar
    left join platform.entity_types et on et.token = ar.resource_type
    left join users.profiles pr on pr.id = ar.created_by
    where ar.status = 'pending'
      and ar.deleted_at is null
      and ar.created_by <> v_uid
      and iam.can_decide_access_request(v_uid, ar.resource_type, ar.resource_id)
  ) s;

  return v_rows;
end;
$function$;

-- ── DECIDE ──────────────────────────────────────────────────────────────────
create or replace function public.access_request_decide(
  p_request_id uuid,
  p_decision text,
  p_level text default null,
  p_note text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public', 'platform', 'iam'
as $function$
declare
  v_uid    uuid := (select auth.uid());
  v_req    record;
  v_level  public.permission_level;
  v_meta   record;
  v_attrs  record;
begin
  if v_uid is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  if p_decision not in ('grant', 'decline') then
    raise exception 'Unsupported decision.' using errcode = '22023';
  end if;

  select * into v_req
  from iam.access_requests
  where id = p_request_id and deleted_at is null
  for update;

  if v_req.id is null then
    raise exception 'That request no longer exists.' using errcode = '02000';
  end if;

  -- Nobody answers their own ask. Today an org admin asking for a row in their
  -- own org is refused earlier by iam.has_access, but that is a coincidence of
  -- the resolver, not a rule of this function.
  if v_req.created_by = v_uid then
    raise exception 'You cannot answer your own request.' using errcode = '42501';
  end if;

  if v_req.status <> 'pending' then
    return jsonb_build_object('id', v_req.id, 'status', v_req.status,
                              'already', true);
  end if;
  if not iam.can_decide_access_request(v_uid, v_req.resource_type, v_req.resource_id) then
    raise exception 'You are not able to answer this request.' using errcode = '42501';
  end if;

  if p_decision = 'grant' then
    -- The target can be deleted between the ask and the answer. Granting on a
    -- dead row writes a permission that points at nothing.
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

    -- Write the grant directly. `share_resource_with_user` requires the CALLER
    -- to be the owner, which an org admin answering for their org is not — and
    -- this function has already established their authority.
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

    update iam.access_requests
       set status = 'granted', decided_by = v_uid, decided_at = now(),
           decision_note = nullif(btrim(p_note), ''),
           requested_level = v_level::text
     where id = p_request_id;
  else
    update iam.access_requests
       set status = 'declined', decided_by = v_uid, decided_at = now(),
           decision_note = nullif(btrim(p_note), '')
     where id = p_request_id;
  end if;

  return jsonb_build_object(
    'id', p_request_id,
    'status', case when p_decision = 'grant' then 'granted' else 'declined' end,
    'already', false,
    'requester_id', v_req.created_by,
    'resource_type', v_req.resource_type,
    'resource_id', v_req.resource_id,
    'entity_label', (select label from platform.entity_types
                      where token = v_req.resource_type),
    'entity_title', platform.entity_title(v_req.resource_type, v_req.resource_id)
  );
end;
$function$;

-- ── REPORT ──────────────────────────────────────────────────────────────────
create or replace function public.access_request_report(
  p_request_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public', 'platform', 'iam'
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_req record;
begin
  if v_uid is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;

  select * into v_req
  from iam.access_requests
  where id = p_request_id and deleted_at is null
  for update;

  if v_req.id is null then
    raise exception 'That request no longer exists.' using errcode = '02000';
  end if;
  if not iam.can_decide_access_request(v_uid, v_req.resource_type, v_req.resource_id) then
    raise exception 'You are not able to answer this request.' using errcode = '42501';
  end if;

  update iam.access_requests
     set status = 'reported', decided_by = v_uid, decided_at = now(),
         decision_note = nullif(btrim(p_reason), '')
   where id = p_request_id;

  -- Reported asks are a moderation signal, so they are recorded where the
  -- platform already keeps them rather than in a private column nobody reads.
  begin
    insert into platform.activity_log
      (organization_id, actor_id, entity_type, entity_id, action, metadata)
    values
      (v_req.organization_id, v_uid, 'access_request', v_req.id, 'reported',
       jsonb_build_object('resource_type', v_req.resource_type,
                          'resource_id', v_req.resource_id,
                          'requester_id', v_req.created_by,
                          'reason', nullif(btrim(p_reason), '')));
  exception when others then
    -- The report itself already landed; never fail the moderation action
    -- because the audit sink changed shape.
    raise warning 'access_request_report: activity_log write failed for %', v_req.id;
  end;

  return jsonb_build_object('id', p_request_id, 'status', 'reported');
end;
$function$;

-- ── WITHDRAW ────────────────────────────────────────────────────────────────
create or replace function public.access_request_withdraw(
  p_request_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public', 'platform', 'iam'
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_n   int;
begin
  if v_uid is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;

  update iam.access_requests
     set status = 'withdrawn'
   where id = p_request_id
     and created_by = v_uid
     and status = 'pending'
     and deleted_at is null;
  get diagnostics v_n = row_count;

  if v_n = 0 then
    raise exception 'That request is no longer open.' using errcode = '02000';
  end if;
  return jsonb_build_object('id', p_request_id, 'status', 'withdrawn');
end;
$function$;

-- ── Grants ──────────────────────────────────────────────────────────────────
revoke all on function iam.access_request_recipients(text, uuid) from public;
revoke all on function iam.can_decide_access_request(uuid, text, uuid) from public;

revoke all on function public.access_request_create(text, uuid, text, text) from public;
revoke all on function public.access_request_list(text) from public;
revoke all on function public.access_request_decide(uuid, text, text, text) from public;
revoke all on function public.access_request_report(uuid, text) from public;
revoke all on function public.access_request_withdraw(uuid) from public;

grant execute on function public.access_request_create(text, uuid, text, text) to authenticated;
grant execute on function public.access_request_list(text) to authenticated;
grant execute on function public.access_request_decide(uuid, text, text, text) to authenticated;
grant execute on function public.access_request_report(uuid, text) to authenticated;
grant execute on function public.access_request_withdraw(uuid) to authenticated;
