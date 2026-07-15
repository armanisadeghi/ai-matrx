-- D2: bind membership and ownership mutations to the authenticated actor's
-- role on the authoritative organization/project container.

-- The project is authoritative for the denormalized organization_id.
update iam.memberships as membership
set organization_id = project.organization_id,
    updated_at = now()
from workspace.projects as project
where membership.container_type = 'project'
  and membership.container_id = project.id
  and membership.organization_id is distinct from project.organization_id;

create or replace function iam._container_authz(
  p_container_type text,
  p_container_id uuid,
  p_actor uuid
)
returns table(
  resource_org_id uuid,
  resource_creator uuid,
  resource_is_personal boolean,
  actor_role text
)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    organization.id,
    organization.created_by,
    organization.is_personal,
    (
      select membership.role
      from iam.memberships as membership
      where membership.container_type = 'organization'
        and membership.container_id = organization.id
        and membership.organization_id = organization.id
        and membership.user_id = p_actor
        and membership.status = 'active'
        and membership.deleted_at is null
      limit 1
    )
  from iam.organizations as organization
  where p_container_type = 'organization'
    and organization.id = p_container_id

  union all

  select
    project.organization_id,
    project.created_by,
    false,
    (
      select membership.role
      from iam.memberships as membership
      where membership.container_type = 'project'
        and membership.container_id = project.id
        and membership.organization_id = project.organization_id
        and membership.user_id = p_actor
        and membership.status = 'active'
        and membership.deleted_at is null
      limit 1
    )
  from workspace.projects as project
  where p_container_type = 'project'
    and project.id = p_container_id
    and project.deleted_at is null;
$function$;

revoke all on function iam._container_authz(text, uuid, uuid)
  from public, anon, authenticated, service_role;

create or replace function public.mbr_add(
  p_container_type text,
  p_container_id uuid,
  p_user_id uuid,
  p_organization_id uuid,
  p_role text default 'member',
  p_status text default 'active',
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_service boolean := coalesce(auth.role() = 'service_role', false);
  v_org uuid;
  v_creator uuid;
  v_personal boolean;
  v_actor_role text;
  v_target_id uuid;
  v_target_role text;
  v_bootstrap boolean;
  v_id uuid;
begin
  if p_container_type not in ('organization', 'project') then
    raise exception 'unsupported membership container type %', p_container_type
      using errcode = '22023';
  end if;

  if p_role not in ('owner', 'admin', 'member') then
    raise exception 'invalid membership role %', p_role
      using errcode = '22023';
  end if;

  if p_status is distinct from 'active' then
    raise exception 'invalid membership status %', p_status
      using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_container_type || ':' || p_container_id::text,
      0
    )
  );

  select
    container.resource_org_id,
    container.resource_creator,
    container.resource_is_personal,
    container.actor_role
  into v_org, v_creator, v_personal, v_actor_role
  from iam._container_authz(p_container_type, p_container_id, v_uid) as container;

  if not found or v_org is null then
    raise exception 'membership container not found' using errcode = 'P0002';
  end if;

  if p_organization_id is distinct from v_org then
    raise exception 'membership container/organization mismatch'
      using errcode = '42501';
  end if;

  select membership.id, membership.role
  into v_target_id, v_target_role
  from iam.memberships as membership
  where membership.container_type = p_container_type
    and membership.container_id = p_container_id
    and membership.organization_id = v_org
    and membership.user_id = p_user_id
    and membership.status = 'active'
    and membership.deleted_at is null
  for update;

  v_bootstrap :=
    v_uid is not null
    and v_uid = v_creator
    and p_user_id = v_uid
    and p_role = 'owner'
    and not exists (
      select 1
      from iam.memberships as membership
      where membership.container_type = p_container_type
        and membership.container_id = p_container_id
        and membership.organization_id = v_org
        and membership.status = 'active'
        and membership.deleted_at is null
    );

  if not v_service and not v_bootstrap then
    if v_personal then
      raise exception 'personal organization memberships are immutable'
        using errcode = '42501';
    end if;

    if v_actor_role = 'owner' then
      null;
    elsif v_actor_role = 'admin'
          and p_role in ('member', 'admin')
          and (v_target_role is null or v_target_role = 'member') then
      null;
    else
      raise exception 'membership manager role required'
        using errcode = '42501';
    end if;

    if p_container_type = 'project' and p_role = 'owner' then
      raise exception 'project owner role can only be established at bootstrap'
        using errcode = '42501';
    end if;
  end if;

  -- mbr_add is idempotent, not a second role-update surface. Existing live
  -- rows must go through mbr_update_role so last-owner rules cannot be bypassed.
  if v_target_id is not null then
    return v_target_id;
  end if;

  insert into iam.memberships (
    container_type,
    container_id,
    user_id,
    organization_id,
    role,
    status,
    metadata,
    created_by
  )
  values (
    p_container_type,
    p_container_id,
    p_user_id,
    v_org,
    p_role,
    'active',
    coalesce(p_metadata, '{}'::jsonb),
    v_uid
  )
  on conflict (container_type, container_id, user_id)
  do update set
    organization_id = excluded.organization_id,
    role = excluded.role,
    status = 'active',
    metadata = excluded.metadata,
    deleted_at = null,
    updated_by = v_uid,
    updated_at = now()
  returning id into v_id;

  return v_id;
end;
$function$;

create or replace function public.mbr_update_role(
  p_container_type text,
  p_container_id uuid,
  p_user_id uuid,
  p_role text
)
returns void
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
  v_target_role text;
  v_owner_count integer;
begin
  if p_container_type not in ('organization', 'project')
     or p_role not in ('owner', 'admin', 'member') then
    raise exception 'invalid membership role update' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_container_type || ':' || p_container_id::text,
      0
    )
  );

  select
    container.resource_org_id,
    container.resource_is_personal,
    container.actor_role
  into v_org, v_personal, v_actor_role
  from iam._container_authz(p_container_type, p_container_id, v_uid) as container;

  if not found or v_org is null then
    raise exception 'membership container not found' using errcode = 'P0002';
  end if;

  select membership.role
  into v_target_role
  from iam.memberships as membership
  where membership.container_type = p_container_type
    and membership.container_id = p_container_id
    and membership.organization_id = v_org
    and membership.user_id = p_user_id
    and membership.status = 'active'
    and membership.deleted_at is null
  for update;

  if not found then
    raise exception 'membership not found' using errcode = 'P0002';
  end if;

  if not v_service then
    if v_personal then
      raise exception 'personal organization memberships are immutable'
        using errcode = '42501';
    end if;

    if p_container_type = 'organization' then
      if v_actor_role = 'owner' then
        null;
      elsif v_actor_role = 'admin'
            and v_target_role = 'member'
            and p_role in ('member', 'admin') then
        null;
      else
        raise exception 'not authorized to update membership role'
          using errcode = '42501';
      end if;
    elsif v_actor_role is distinct from 'owner' or p_role = 'owner' then
      raise exception 'project owner role required' using errcode = '42501';
    end if;
  end if;

  if v_target_role = 'owner' and p_role <> 'owner' then
    select count(*)::integer
    into v_owner_count
    from iam.memberships as membership
    where membership.container_type = p_container_type
      and membership.container_id = p_container_id
      and membership.organization_id = v_org
      and membership.role = 'owner'
      and membership.status = 'active'
      and membership.deleted_at is null;

    if v_owner_count <= 1 then
      raise exception 'cannot demote the last owner' using errcode = '23514';
    end if;
  end if;

  update iam.memberships
  set role = p_role,
      updated_by = v_uid,
      updated_at = now()
  where container_type = p_container_type
    and container_id = p_container_id
    and organization_id = v_org
    and user_id = p_user_id
    and status = 'active'
    and deleted_at is null;
end;
$function$;

create or replace function public.mbr_remove(
  p_container_type text,
  p_container_id uuid,
  p_user_id uuid
)
returns void
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
  v_target_role text;
  v_owner_count integer;
begin
  if p_container_type not in ('organization', 'project') then
    raise exception 'unsupported membership container type %', p_container_type
      using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_container_type || ':' || p_container_id::text,
      0
    )
  );

  select
    container.resource_org_id,
    container.resource_is_personal,
    container.actor_role
  into v_org, v_personal, v_actor_role
  from iam._container_authz(p_container_type, p_container_id, v_uid) as container;

  if not found or v_org is null then
    raise exception 'membership container not found' using errcode = 'P0002';
  end if;

  select membership.role
  into v_target_role
  from iam.memberships as membership
  where membership.container_type = p_container_type
    and membership.container_id = p_container_id
    and membership.organization_id = v_org
    and membership.user_id = p_user_id
    and membership.status = 'active'
    and membership.deleted_at is null
  for update;

  if not found then
    raise exception 'membership not found' using errcode = 'P0002';
  end if;

  if not v_service then
    if v_personal then
      raise exception 'personal organization memberships are immutable'
        using errcode = '42501';
    end if;

    if p_user_id = v_uid then
      null;
    elsif v_actor_role = 'owner' then
      null;
    elsif v_actor_role = 'admin' and v_target_role = 'member' then
      null;
    else
      raise exception 'not authorized to remove membership'
        using errcode = '42501';
    end if;
  end if;

  if v_target_role = 'owner' then
    select count(*)::integer
    into v_owner_count
    from iam.memberships as membership
    where membership.container_type = p_container_type
      and membership.container_id = p_container_id
      and membership.organization_id = v_org
      and membership.role = 'owner'
      and membership.status = 'active'
      and membership.deleted_at is null;

    if v_owner_count <= 1 then
      raise exception 'cannot remove the last owner' using errcode = '23514';
    end if;
  end if;

  update iam.memberships
  set deleted_at = now(),
      updated_by = v_uid,
      updated_at = now()
  where container_type = p_container_type
    and container_id = p_container_id
    and organization_id = v_org
    and user_id = p_user_id
    and status = 'active'
    and deleted_at is null;
end;
$function$;

create or replace function public.transfer_organization_ownership(
  org_id uuid,
  current_owner_id uuid,
  new_owner_id uuid
)
returns boolean
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
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('organization:' || org_id::text, 0)
  );

  select
    container.resource_org_id,
    container.resource_is_personal,
    container.actor_role
  into v_org, v_personal, v_actor_role
  from iam._container_authz('organization', org_id, v_uid) as container;

  if not found or v_org is null then
    raise exception 'organization not found' using errcode = 'P0002';
  end if;

  if not v_service then
    if v_personal then
      raise exception 'personal organization ownership is immutable'
        using errcode = '42501';
    end if;

    if current_owner_id is distinct from v_uid
       or v_actor_role is distinct from 'owner' then
      raise exception 'only the current authenticated owner may transfer ownership'
        using errcode = '42501';
    end if;
  end if;

  if not exists (
    select 1
    from iam.memberships as membership
    where membership.container_type = 'organization'
      and membership.container_id = org_id
      and membership.organization_id = org_id
      and membership.user_id = current_owner_id
      and membership.role = 'owner'
      and membership.status = 'active'
      and membership.deleted_at is null
  ) then
    raise exception 'current owner membership not found' using errcode = 'P0002';
  end if;

  if not exists (
    select 1
    from iam.memberships as membership
    where membership.container_type = 'organization'
      and membership.container_id = org_id
      and membership.organization_id = org_id
      and membership.user_id = new_owner_id
      and membership.status = 'active'
      and membership.deleted_at is null
  ) then
    raise exception 'new owner must be an active organization member'
      using errcode = '22023';
  end if;

  if current_owner_id = new_owner_id then
    return true;
  end if;

  update iam.memberships
  set role = 'owner', updated_by = v_uid, updated_at = now()
  where container_type = 'organization'
    and container_id = org_id
    and organization_id = org_id
    and user_id = new_owner_id
    and status = 'active'
    and deleted_at is null;

  update iam.memberships
  set role = 'admin', updated_by = v_uid, updated_at = now()
  where container_type = 'organization'
    and container_id = org_id
    and organization_id = org_id
    and user_id = current_owner_id
    and role = 'owner'
    and status = 'active'
    and deleted_at is null;

  return true;
end;
$function$;

revoke execute on function public.mbr_add(text, uuid, uuid, uuid, text, text, jsonb)
  from public, anon;
revoke execute on function public.mbr_update_role(text, uuid, uuid, text)
  from public, anon;
revoke execute on function public.mbr_remove(text, uuid, uuid)
  from public, anon;
revoke execute on function public.transfer_organization_ownership(uuid, uuid, uuid)
  from public, anon;

grant execute on function public.mbr_add(text, uuid, uuid, uuid, text, text, jsonb)
  to authenticated, service_role;
grant execute on function public.mbr_update_role(text, uuid, uuid, text)
  to authenticated, service_role;
grant execute on function public.mbr_remove(text, uuid, uuid)
  to authenticated, service_role;
grant execute on function public.transfer_organization_ownership(uuid, uuid, uuid)
  to authenticated, service_role;

do $verification$
begin
  if has_function_privilege(
       'anon',
       'public.mbr_update_role(text,uuid,uuid,text)',
       'execute'
     )
     or has_function_privilege(
       'anon',
       'public.mbr_remove(text,uuid,uuid)',
       'execute'
     )
     or has_function_privilege(
       'anon',
       'public.transfer_organization_ownership(uuid,uuid,uuid)',
       'execute'
     ) then
    raise exception 'D2 membership RPC ACL hardening failed';
  end if;

  if exists (
    select 1
    from iam.memberships as membership
    join workspace.projects as project on project.id = membership.container_id
    where membership.container_type = 'project'
      and membership.organization_id is distinct from project.organization_id
  ) then
    raise exception 'D2 project membership resource binding repair failed';
  end if;
end;
$verification$;
