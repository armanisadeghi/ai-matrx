-- admin_manage_organization_membership.sql
--
-- Super-admin control plane for the canonical iam.memberships rows whose
-- container is an organization. This does not introduce a second membership
-- model: it performs the same soft-delete/reactivation lifecycle as mbr_* while
-- adding the global super-admin gate and an iam.org_admin_audit entry.
-- Idempotent.

create or replace function public.admin_manage_organization_membership(
  p_action text,
  p_org_id uuid,
  p_user_id uuid,
  p_role text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_actor uuid := (select auth.uid());
  v_membership iam.memberships%rowtype;
  v_org iam.organizations%rowtype;
  v_previous_role text;
  v_owner_count integer;
begin
  if v_actor is null or not public.is_super_admin() then
    raise exception 'Forbidden: Super Admin required' using errcode = '42501';
  end if;

  if p_action not in ('add', 'set_role', 'remove') then
    raise exception 'Unsupported organization membership action: %', p_action
      using errcode = '22023';
  end if;

  select * into v_org
  from iam.organizations
  where id = p_org_id;

  if not found then
    raise exception 'Organization not found' using errcode = 'P0002';
  end if;

  -- A personal organization belongs to exactly one person. Admin tooling may
  -- inspect it, but membership mutation must not turn it into a shared org.
  if coalesce(v_org.is_personal, false) then
    raise exception 'Personal organization membership cannot be changed'
      using errcode = '23514';
  end if;

  if p_action in ('add', 'set_role') and p_role not in ('owner', 'admin', 'member') then
    raise exception 'Role must be owner, admin, or member' using errcode = '22023';
  end if;

  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'User not found' using errcode = 'P0002';
  end if;

  -- Serialize owner-count checks with other organization membership changes.
  perform 1
  from iam.memberships
  where container_type = 'organization'
    and container_id = p_org_id
    and deleted_at is null
  for update;

  select * into v_membership
  from iam.memberships
  where container_type = 'organization'
    and container_id = p_org_id
    and user_id = p_user_id
    and deleted_at is null;

  v_previous_role := v_membership.role;

  if p_action = 'add' then
    insert into iam.memberships (
      container_type,
      container_id,
      organization_id,
      user_id,
      role,
      status,
      metadata,
      created_by,
      updated_by
    )
    values (
      'organization',
      p_org_id,
      p_org_id,
      p_user_id,
      p_role,
      'active',
      '{}'::jsonb,
      v_actor,
      v_actor
    )
    on conflict (container_type, container_id, user_id)
    do update set
      organization_id = excluded.organization_id,
      role = excluded.role,
      status = 'active',
      deleted_at = null,
      updated_by = v_actor,
      updated_at = now()
    returning * into v_membership;

  elsif p_action = 'set_role' then
    if v_membership.id is null then
      raise exception 'Organization membership not found' using errcode = 'P0002';
    end if;

    if v_membership.role = 'owner' and p_role <> 'owner' then
      select count(*) into v_owner_count
      from iam.memberships
      where container_type = 'organization'
        and container_id = p_org_id
        and role = 'owner'
        and deleted_at is null;

      if v_owner_count <= 1 then
        raise exception 'Cannot demote the last organization owner'
          using errcode = '23514';
      end if;
    end if;

    update iam.memberships
    set role = p_role,
        updated_by = v_actor,
        updated_at = now()
    where id = v_membership.id
    returning * into v_membership;

  else
    if v_membership.id is null then
      raise exception 'Organization membership not found' using errcode = 'P0002';
    end if;

    if v_membership.role = 'owner' then
      select count(*) into v_owner_count
      from iam.memberships
      where container_type = 'organization'
        and container_id = p_org_id
        and role = 'owner'
        and deleted_at is null;

      if v_owner_count <= 1 then
        raise exception 'Cannot remove the last organization owner'
          using errcode = '23514';
      end if;
    end if;

    update iam.memberships
    set deleted_at = now(),
        status = 'removed',
        updated_by = v_actor,
        updated_at = now()
    where id = v_membership.id
    returning * into v_membership;
  end if;

  insert into iam.org_admin_audit (
    organization_id,
    actor_user_id,
    target_user_id,
    action,
    detail
  )
  values (
    p_org_id,
    v_actor,
    p_user_id,
    'super_admin_membership_' || p_action,
    jsonb_build_object(
      'previous_role', v_previous_role,
      'role', v_membership.role,
      'membership_id', v_membership.id
    )
  );

  return jsonb_build_object(
    'action', p_action,
    'membership_id', v_membership.id,
    'organization_id', p_org_id,
    'user_id', p_user_id,
    'role', v_membership.role
  );
end;
$function$;

revoke all on function public.admin_manage_organization_membership(text, uuid, uuid, text) from public, anon;
grant execute on function public.admin_manage_organization_membership(text, uuid, uuid, text) to authenticated;
