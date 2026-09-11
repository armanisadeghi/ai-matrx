-- iam_org_ownership_rulings_dd048.sql
--
-- DD-048 / DD-044 — organization ownership, deletion, leaving and admin
-- management made to match the rulings (Arman, 2026-09-10; Data Doctrine R21,
-- recorded in common-docs/systems/platform/access/DECISIONS.md):
--
--   R21 "Who manages roles. Admins add and remove admins and members. Only the
--        owner transfers ownership or deletes the organization. One owner per
--        organization. Same rule in every container."
--   §5.2 rule 2 / DD-044 — a user cannot leave, be removed from, or delete
--        their LAST remaining organization.
--
-- What this migration changes, and the live gap each piece closes (all gaps
-- measured 2026-09-10 on brsgrqvjdzwihsvnfqkf):
--
--   1. iam.is_org_owner(org, user)          NEW — "owner" means the membership
--                                            role, everywhere.
--   2. iam.is_last_organization(user, org)  NEW — the one new predicate DD-045
--                                            §3.4 calls for.
--   3. iam.organizations.org_delete_policy  WAS `created_by = auth.uid() AND
--      rewritten onto the owner role        is_personal = false`. LIVE DEFECT:
--                                            after a transfer the PREVIOUS owner
--                                            could still delete and the new one
--                                            could not (proven refused/allowed
--                                            by pnpm check:org-ownership).
--                                            The `is_personal = false` term is
--                                            DELIBERATELY KEPT — retiring it is
--                                            DD-045 P3, sequenced later.
--   4. BEFORE DELETE guard on organizations NEW — the last-organization rule for
--                                            delete, raised as a sentence rather
--                                            than a silent zero-row no-op.
--   5. one-owner constraint trigger         NEW — a deferrable AFTER trigger on
--                                            iam.memberships refuses a second
--                                            active owner on any organization.
--                                            Live count of organizations with
--                                            more than one owner before this
--                                            migration: 0, so it installs clean.
--   6. public.mbr_update_role               admins may now promote/demote other
--                                            ADMINS (never the owner); nobody
--                                            may mint a second owner — the
--                                            refusal names Transfer ownership.
--   7. public.mbr_remove                    admins may now remove other ADMINS
--                                            (never the owner); the
--                                            last-organization rule is enforced
--                                            for both leaving and being removed,
--                                            with a human sentence.
--   8. public.transfer_organization_ownership
--                                            demote-then-promote so the
--                                            organization is never momentarily
--                                            two-owned, plus an explicit
--                                            post-condition check.
--   9. public.admin_manage_organization_membership
--                                            the super-admin door refuses a
--                                            second owner with the same sentence
--                                            instead of tripping the constraint.
--
-- NOT in this migration (explicitly out of scope, DD-045 P3 owns them): every
-- `is_personal` guard in mbr_add / mbr_remove / mbr_update_role /
-- transfer_organization_ownership / admin_manage_organization_membership is left
-- exactly as it is. This migration only ADDS the ownership and
-- last-organization rules beside them.
--
-- One new client-callable door (§9 at the foot of this file): iam.is_org_owner
-- is evaluated inside the DELETE policy, and a policy expression runs as the
-- CALLER — so `authenticated` needs EXECUTE on it, which for a SECURITY DEFINER
-- function means a platform.client_callable_door row declared before the GRANT
-- (db-rules §6d-4). iam.is_last_organization is called only from trigger and
-- RPC bodies that are themselves SECURITY DEFINER, so it stays ungranted.
--
-- Idempotent: CREATE OR REPLACE / DROP ... IF EXISTS throughout.

-- ---------------------------------------------------------------------------
-- 1. The two predicates
-- ---------------------------------------------------------------------------

create or replace function iam.is_org_owner(p_org_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select p_org_id is not null
     and p_user_id is not null
     and exists (
       select 1
       from iam.memberships as membership
       where membership.container_type = 'organization'
         and membership.container_id = p_org_id
         and membership.user_id = p_user_id
         and membership.role = 'owner'
         and membership.status = 'active'
         and membership.deleted_at is null
     );
$$;

comment on function iam.is_org_owner(uuid, uuid) is
  'True when p_user_id holds the active owner membership of organization p_org_id. '
  '"Owner" is the membership role — never iam.organizations.created_by, which does not '
  'move on a transfer (Doctrine R21, DD-048).';

create or replace function iam.is_last_organization(p_user_id uuid, p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select p_user_id is not null
     and p_org_id is not null
     and not exists (
       select 1
       from iam.memberships as membership
       where membership.container_type = 'organization'
         and membership.user_id = p_user_id
         and membership.container_id is distinct from p_org_id
         and membership.status = 'active'
         and membership.deleted_at is null
     );
$$;

comment on function iam.is_last_organization(uuid, uuid) is
  'True when p_org_id is the only organization p_user_id still belongs to. Applies to EVERY '
  'organization — there is no flagged kind (Doctrine R9/R21, DD-044).';

-- ---------------------------------------------------------------------------
-- 2. Delete is gated on the owner ROLE, not on created_by
-- ---------------------------------------------------------------------------

drop policy if exists org_delete_policy on iam.organizations;

create policy org_delete_policy on iam.organizations
  for delete
  using (
    (select public.is_platform_admin())
    or (
      iam.is_org_owner(id, (select auth.uid()))
      -- KEPT ON PURPOSE — the auto-created ("personal") organization stays
      -- undeletable until DD-045 P3 retires the flag. This migration changes
      -- WHO may delete, not WHICH organizations may be deleted.
      and is_personal = false
    )
  );

-- ---------------------------------------------------------------------------
-- 3. The last-organization rule for DELETE — loud, never a silent no-op
-- ---------------------------------------------------------------------------

create or replace function iam._guard_organization_delete()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  -- Platform admins and the service role are doing repair/cleanup, not leaving.
  if v_uid is null
     or coalesce(auth.role() = 'service_role', false)
     or (select public.is_platform_admin()) then
    return old;
  end if;

  if iam.is_last_organization(v_uid, old.id) then
    raise exception
      'You can''t delete your only organization. Create or join another one first.'
      using errcode = '23514';
  end if;

  return old;
end;
$$;

drop trigger if exists _guard_last_organization_delete on iam.organizations;
create trigger _guard_last_organization_delete
  before delete on iam.organizations
  for each row execute function iam._guard_organization_delete();

-- ---------------------------------------------------------------------------
-- 4. ONE OWNER PER ORGANIZATION — a deferrable invariant on the membership row
-- ---------------------------------------------------------------------------

create or replace function iam._guard_single_organization_owner()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_container_type text := coalesce(new.container_type, old.container_type);
  v_org uuid := coalesce(new.container_id, old.container_id);
  v_owners integer;
begin
  if v_container_type is distinct from 'organization' then
    return null;
  end if;

  select count(*)::integer
  into v_owners
  from iam.memberships as membership
  where membership.container_type = 'organization'
    and membership.container_id = v_org
    and membership.role = 'owner'
    and membership.status = 'active'
    and membership.deleted_at is null;

  if v_owners > 1 then
    raise exception
      'An organization can have exactly one owner. Use Transfer ownership to hand it to someone else.'
      using errcode = '23514';
  end if;

  return null;
end;
$$;

-- DEFERRABLE INITIALLY DEFERRED so a legitimate transfer (two row updates) is
-- judged once, at commit, on the final state — never on the intermediate one.
drop trigger if exists _guard_single_owner on iam.memberships;
create constraint trigger _guard_single_owner
  after insert or update on iam.memberships
  deferrable initially deferred
  for each row execute function iam._guard_single_organization_owner();

-- ---------------------------------------------------------------------------
-- 5. mbr_update_role — admins manage admins; nobody mints a second owner
-- ---------------------------------------------------------------------------

create or replace function public.mbr_update_role(p_container_type text, p_container_id uuid, p_user_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path to ''
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
    -- DD-045 P3 owns this guard; DD-048 leaves it exactly as it was.
    if v_personal then
      raise exception 'personal organization memberships are immutable'
        using errcode = '42501';
    end if;

    if p_container_type = 'organization' then
      -- R21: one owner per organization. Ownership moves ONLY through
      -- transfer_organization_ownership, which demotes the outgoing owner in
      -- the same step. A role update may never mint a second owner.
      if p_role = 'owner' and v_target_role is distinct from 'owner' then
        raise exception
          'An organization can have exactly one owner. Use Transfer ownership to hand it to someone else.'
          using errcode = '23514';
      end if;

      if v_actor_role = 'owner' then
        null;
      -- R21: admins add and remove ADMINS and members. Only the owner is
      -- untouchable by an admin.
      elsif v_actor_role = 'admin'
            and v_target_role in ('member', 'admin')
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

-- ---------------------------------------------------------------------------
-- 6. mbr_remove — admins remove admins; nobody loses their last organization
-- ---------------------------------------------------------------------------

create or replace function public.mbr_remove(p_container_type text, p_container_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
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
    -- DD-044: nobody ends up belonging to no organization. This is checked
    -- BEFORE the personal-organization guard so the person is told the real
    -- reason ("it is your only one") rather than an implementation word.
    if p_container_type = 'organization'
       and iam.is_last_organization(p_user_id, p_container_id) then
      if p_user_id = v_uid then
        raise exception
          'You can''t leave your only organization. Create or join another one first.'
          using errcode = '23514';
      else
        raise exception
          'This person can''t be removed from their only organization. They need to join or create another one first.'
          using errcode = '23514';
      end if;
    end if;

    -- DD-045 P3 owns this guard; DD-048 leaves it exactly as it was.
    if v_personal then
      raise exception 'personal organization memberships are immutable'
        using errcode = '42501';
    end if;

    if p_user_id = v_uid then
      null;
    elsif v_actor_role = 'owner' then
      null;
    -- R21: admins add and remove ADMINS and members. Only the owner is
    -- untouchable by an admin.
    elsif v_actor_role = 'admin' and v_target_role in ('member', 'admin') then
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

-- ---------------------------------------------------------------------------
-- 7. transfer_organization_ownership — demote, then promote, then prove it
-- ---------------------------------------------------------------------------

create or replace function public.transfer_organization_ownership(org_id uuid, current_owner_id uuid, new_owner_id uuid)
returns boolean
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_service boolean := coalesce(auth.role() = 'service_role', false);
  v_org uuid;
  v_personal boolean;
  v_actor_role text;
  v_owner_count integer;
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
    -- DD-045 P3 owns this guard; DD-048 leaves it exactly as it was.
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

  -- R21, one owner: DEMOTE FIRST, then promote, so the organization is never
  -- momentarily two-owned even to a concurrent reader inside this transaction.
  update iam.memberships
  set role = 'admin', updated_by = v_uid, updated_at = now()
  where container_type = 'organization'
    and container_id = org_id
    and organization_id = org_id
    and user_id = current_owner_id
    and role = 'owner'
    and status = 'active'
    and deleted_at is null;

  update iam.memberships
  set role = 'owner', updated_by = v_uid, updated_at = now()
  where container_type = 'organization'
    and container_id = org_id
    and organization_id = org_id
    and user_id = new_owner_id
    and status = 'active'
    and deleted_at is null;

  select count(*)::integer
  into v_owner_count
  from iam.memberships as membership
  where membership.container_type = 'organization'
    and membership.container_id = org_id
    and membership.organization_id = org_id
    and membership.role = 'owner'
    and membership.status = 'active'
    and membership.deleted_at is null;

  if v_owner_count <> 1 then
    raise exception
      'Ownership transfer left % owners on this organization; it must leave exactly one. Nothing was changed.',
      v_owner_count
      using errcode = '23514';
  end if;

  return true;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 8. The super-admin door refuses a second owner with the same sentence
-- ---------------------------------------------------------------------------

create or replace function public.admin_manage_organization_membership(p_action text, p_org_id uuid, p_user_id uuid, p_role text DEFAULT NULL::text)
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
  v_other_owner_count integer;
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

  -- DD-045 P3 owns these four branches; DD-048 leaves them exactly as they are.
  -- A personal organization belongs to its creator. Super-admin repair may
  -- restore that creator as owner or remove legacy extra members, but it may
  -- never turn the personal org into a shared org or remove its person.
  if coalesce(v_org.is_personal, false) then
    if p_action = 'add'
       and (p_user_id is distinct from v_org.created_by or p_role <> 'owner') then
      raise exception 'A personal organization may only add its creator as owner'
        using errcode = '23514';
    end if;
    if p_action = 'set_role'
       and (p_user_id is distinct from v_org.created_by or p_role <> 'owner') then
      raise exception 'A personal organization creator may only be restored to owner'
        using errcode = '23514';
    end if;
    if p_action = 'remove' and p_user_id is not distinct from v_org.created_by then
      raise exception 'Cannot remove the person from their personal organization'
        using errcode = '23514';
    end if;
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

  -- R21, one owner: even a super admin may not mint a second one. The route is
  -- transfer_organization_ownership, which demotes the outgoing owner.
  if p_action in ('add', 'set_role') and p_role = 'owner' then
    select count(*)::integer
    into v_other_owner_count
    from iam.memberships
    where container_type = 'organization'
      and container_id = p_org_id
      and role = 'owner'
      and status = 'active'
      and deleted_at is null
      and user_id is distinct from p_user_id;

    if v_other_owner_count > 0 then
      raise exception
        'An organization can have exactly one owner. Use Transfer ownership to hand it to someone else.'
        using errcode = '23514';
    end if;
  end if;

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

    -- DD-044: a super admin removing the last membership would leave the person
    -- with no organization at all.
    if iam.is_last_organization(p_user_id, p_org_id) then
      raise exception
        'This person can''t be removed from their only organization. They need to join or create another one first.'
        using errcode = '23514';
    end if;

    update iam.memberships
    set deleted_at = now(),
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

-- ---------------------------------------------------------------------------
-- 9. The DELETE policy's predicate must be callable BY THE CALLER
--
-- An RLS policy expression is evaluated as the INVOKER, not as the policy's
-- owner, so `authenticated` needs EXECUTE on iam.is_org_owner or every delete
-- attempt fails with `permission denied for function is_org_owner` — which
-- reads exactly like a refusal and is not one. Proven live 2026-09-11: with the
-- grant missing, BOTH the previous owner and the new owner were "refused",
-- so the fix looked green while the policy had never been reached.
--
-- iam.is_org_owner is SECURITY DEFINER, so the grant only sticks when the door
-- is declared first (db-rules §6d-4). It discloses nothing a member cannot
-- already read: the organization's own membership rows.
-- ---------------------------------------------------------------------------

insert into platform.client_callable_door (schema_name, function_name, identity_args, reason)
select 'iam', 'is_org_owner', 'p_org_id uuid, p_user_id uuid',
       'Evaluated inside iam.organizations.org_delete_policy, which runs as the caller. Returns only whether a user holds the owner membership of an organization.'
where not exists (
  select 1 from platform.client_callable_door d
  where d.schema_name = 'iam' and d.function_name = 'is_org_owner'
);

grant execute on function iam.is_org_owner(uuid, uuid) to authenticated;
