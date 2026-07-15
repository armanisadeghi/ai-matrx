-- D2: invitations expose email addresses and transferable acceptance tokens,
-- so every management path must be bound to an owner/admin of the exact target.

create or replace function public.inv_list(
  p_target_type text,
  p_target_id uuid
)
returns table(
  id uuid,
  organization_id uuid,
  target_type text,
  target_id uuid,
  email text,
  invited_user_id uuid,
  role text,
  status text,
  token text,
  expires_at timestamptz,
  accepted_at timestamptz,
  created_at timestamptz,
  created_by uuid
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_service boolean := coalesce(auth.role() = 'service_role', false);
  v_org uuid;
  v_personal boolean;
  v_actor_role text;
begin
  select
    container.resource_org_id,
    container.resource_is_personal,
    container.actor_role
  into v_org, v_personal, v_actor_role
  from iam._container_authz(p_target_type, p_target_id, v_uid) as container;

  if not found or v_org is null then
    raise exception 'invitation target not found' using errcode = 'P0002';
  end if;

  if not v_service
     and (v_personal or v_actor_role not in ('owner', 'admin')) then
    raise exception 'invitation manager role required' using errcode = '42501';
  end if;

  return query
  select
    invitation.id,
    invitation.organization_id,
    invitation.target_type,
    invitation.target_id,
    invitation.email,
    invitation.invited_user_id,
    invitation.role,
    invitation.status,
    invitation.token,
    invitation.expires_at,
    invitation.accepted_at,
    invitation.created_at,
    invitation.created_by
  from iam.invitations as invitation
  where invitation.target_type = p_target_type
    and invitation.target_id = p_target_id
    and invitation.organization_id = v_org
    and invitation.deleted_at is null
  order by invitation.created_at desc;
end;
$function$;

create or replace function public.inv_create(
  p_target_type text,
  p_target_id uuid,
  p_email text,
  p_role text default 'member',
  p_org_id uuid default null,
  p_invited_user_id uuid default null,
  p_expires_at timestamptz default (now() + interval '7 days')
)
returns iam.invitations
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_service boolean := coalesce(auth.role() = 'service_role', false);
  v_org uuid;
  v_personal boolean;
  v_actor_role text;
  v_email text := pg_catalog.lower(pg_catalog.btrim(p_email));
  v_resolved_user_id uuid;
  v_row iam.invitations;
begin
  if p_target_type not in ('organization', 'project')
     or p_role not in ('owner', 'admin', 'member') then
    raise exception 'invalid invitation target or role' using errcode = '22023';
  end if;

  if v_email is null or v_email = ''
     or p_expires_at is null
     or p_expires_at <= now() then
    raise exception 'invalid invitation email or expiry' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_target_type || ':' || p_target_id::text, 0)
  );

  select
    container.resource_org_id,
    container.resource_is_personal,
    container.actor_role
  into v_org, v_personal, v_actor_role
  from iam._container_authz(p_target_type, p_target_id, v_uid) as container;

  if not found or v_org is null then
    raise exception 'invitation target not found' using errcode = 'P0002';
  end if;

  if p_org_id is not null and p_org_id is distinct from v_org then
    raise exception 'invitation target/organization mismatch'
      using errcode = '42501';
  end if;

  if not v_service then
    if v_personal or v_actor_role not in ('owner', 'admin') then
      raise exception 'invitation manager role required' using errcode = '42501';
    end if;

    if p_role = 'owner' and v_actor_role <> 'owner' then
      raise exception 'only an owner may invite another owner'
        using errcode = '42501';
    end if;

    if p_target_type = 'project' and p_role = 'owner' then
      raise exception 'project owner is not an invitational role'
        using errcode = '42501';
    end if;
  end if;

  select account.id
  into v_resolved_user_id
  from auth.users as account
  where pg_catalog.lower(account.email) = v_email
  order by account.created_at asc
  limit 1;

  if p_invited_user_id is not null
     and p_invited_user_id is distinct from v_resolved_user_id then
    raise exception 'invited user does not match invitation email'
      using errcode = '22023';
  end if;

  update iam.invitations
  set role = p_role,
      expires_at = p_expires_at,
      token = pg_catalog.gen_random_uuid()::text,
      status = 'pending',
      accepted_at = null,
      invited_user_id = v_resolved_user_id,
      updated_by = v_uid,
      updated_at = now()
  where target_type = p_target_type
    and target_id = p_target_id
    and organization_id = v_org
    and pg_catalog.lower(email) = v_email
    and status = 'pending'
    and deleted_at is null
  returning * into v_row;

  if v_row.id is null then
    insert into iam.invitations (
      organization_id,
      target_type,
      target_id,
      email,
      invited_user_id,
      role,
      status,
      expires_at,
      created_by,
      updated_by
    )
    values (
      v_org,
      p_target_type,
      p_target_id,
      v_email,
      v_resolved_user_id,
      p_role,
      'pending',
      p_expires_at,
      v_uid,
      v_uid
    )
    returning * into v_row;
  end if;

  return v_row;
end;
$function$;

create or replace function iam._managed_invitation(p_invitation_id uuid)
returns iam.invitations
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_service boolean := coalesce(auth.role() = 'service_role', false);
  v_invitation iam.invitations;
  v_org uuid;
  v_personal boolean;
  v_actor_role text;
begin
  -- Read target identity first, acquire the same container lock as inv_create,
  -- then lock/re-read the row. This order avoids advisory/row-lock inversion.
  select invitation.*
  into v_invitation
  from iam.invitations as invitation
  where invitation.id = p_invitation_id
    and invitation.status = 'pending'
    and invitation.deleted_at is null;

  if v_invitation.id is null then
    raise exception 'pending invitation not found' using errcode = 'P0002';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      v_invitation.target_type || ':' || v_invitation.target_id::text,
      0
    )
  );

  select invitation.*
  into v_invitation
  from iam.invitations as invitation
  where invitation.id = p_invitation_id
    and invitation.status = 'pending'
    and invitation.deleted_at is null
  for update;

  if v_invitation.id is null then
    raise exception 'pending invitation not found' using errcode = 'P0002';
  end if;

  select
    container.resource_org_id,
    container.resource_is_personal,
    container.actor_role
  into v_org, v_personal, v_actor_role
  from iam._container_authz(
    v_invitation.target_type,
    v_invitation.target_id,
    v_uid
  ) as container;

  if not found
     or v_org is null
     or v_invitation.organization_id is distinct from v_org then
    raise exception 'invitation target/organization mismatch'
      using errcode = '42501';
  end if;

  if not v_service then
    if v_personal or v_actor_role not in ('owner', 'admin') then
      raise exception 'invitation manager role required' using errcode = '42501';
    end if;

    if v_invitation.role = 'owner' and v_actor_role <> 'owner' then
      raise exception 'only an owner may manage an owner invitation'
        using errcode = '42501';
    end if;
  end if;

  return v_invitation;
end;
$function$;

revoke all on function iam._managed_invitation(uuid)
  from public, anon, authenticated, service_role;

create or replace function public.inv_get_managed(p_invitation_id uuid)
returns iam.invitations
language plpgsql
security definer
set search_path = ''
as $function$
begin
  return iam._managed_invitation(p_invitation_id);
end;
$function$;

create or replace function public.inv_revoke(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_invitation iam.invitations;
begin
  v_invitation := iam._managed_invitation(p_invitation_id);

  update iam.invitations
  set status = 'revoked',
      deleted_at = now(),
      updated_by = v_uid,
      updated_at = now()
  where id = v_invitation.id
    and status = 'pending'
    and deleted_at is null;
end;
$function$;

create or replace function public.inv_resend(
  p_invitation_id uuid,
  p_expires_at timestamptz default (now() + interval '7 days')
)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_invitation iam.invitations;
  v_token text;
begin
  if p_expires_at is null or p_expires_at <= now() then
    raise exception 'invalid invitation expiry' using errcode = '22023';
  end if;

  v_invitation := iam._managed_invitation(p_invitation_id);

  update iam.invitations
  set token = pg_catalog.gen_random_uuid()::text,
      expires_at = p_expires_at,
      updated_by = v_uid,
      updated_at = now()
  where id = v_invitation.id
    and status = 'pending'
    and deleted_at is null
  returning token into v_token;

  return v_token;
end;
$function$;

revoke execute on function public.inv_list(text, uuid) from public, anon;
revoke execute on function public.inv_create(text, uuid, text, text, uuid, uuid, timestamptz)
  from public, anon;
revoke execute on function public.inv_get_managed(uuid) from public, anon;
revoke execute on function public.inv_revoke(uuid) from public, anon;
revoke execute on function public.inv_resend(uuid, timestamptz) from public, anon;

grant execute on function public.inv_list(text, uuid)
  to authenticated, service_role;
grant execute on function public.inv_create(text, uuid, text, text, uuid, uuid, timestamptz)
  to authenticated, service_role;
grant execute on function public.inv_get_managed(uuid)
  to authenticated, service_role;
grant execute on function public.inv_revoke(uuid)
  to authenticated, service_role;
grant execute on function public.inv_resend(uuid, timestamptz)
  to authenticated, service_role;

do $verification$
begin
  if has_function_privilege(
       'anon',
       'public.inv_create(text,uuid,text,text,uuid,uuid,timestamptz)',
       'execute'
     )
     or has_function_privilege(
       'anon',
       'public.inv_get_managed(uuid)',
       'execute'
     ) then
    raise exception 'D2 invitation RPC ACL hardening failed';
  end if;
end;
$verification$;
