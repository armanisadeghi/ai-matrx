-- iam_org_update_role_and_member_orphan_dd048_fix1.sql
--
-- DD-048 fix round 1 — the three findings an independent verifier raised against
-- `iam_org_ownership_rulings_dd048.sql` (V-1, 2026-09-11). Read that migration first.
--
--   FIX 1 — THE `created_by` CLASS WAS NOT CLOSED.
--   `iam.organizations.org_update_policy` was still
--   `is_platform_admin() OR created_by = auth.uid()`. Probed live on a
--   post-transfer organization: the NEW owner renaming it updated **0 rows**,
--   and the PREVIOUS owner (still `created_by`) updated **1**. That is the same
--   defect the delete policy had, one policy over — and the previous commit made
--   it reachable for the first time by shipping a Transfer ownership button.
--   It now keys on the membership role, via the new `iam.is_org_manager`.
--   Owner AND admin, deliberately: Arman, 2026-09-10 (access/DECISIONS.md) —
--   an admin "can act as an admin on things and make all kinds of changes to
--   just about everything". Only TRANSFER and DELETE are owner-only (R21).
--
--   FIX 2 — THE LAST-ORGANIZATION RULE ONLY PROTECTED THE DELETER.
--   `iam._guard_organization_delete` asked `is_last_organization(auth.uid(), …)`
--   and nothing else, so an owner who belongs to two organizations could delete
--   one that was another member's ONLY organization and leave that person
--   belonging to none — exactly the state DD-044 forbids, since §5.2 rule 2 is
--   about every user, not about the person clicking. The guard now counts EVERY
--   member who would be orphaned and names the number in the refusal.
--
--   FIX 3 — TWO REFUSALS WERE IMPLEMENTATION PHRASES.
--   `not authorized to remove membership` / `not authorized to update membership
--   role` reach the user through `mbr_remove` / `mbr_update_role`. Every new
--   refusal the previous migration wrote is a sentence with a remedy; these two
--   pre-existing ones were rewritten around and left as jargon. They now say who
--   CAN do the thing.
--
-- Unchanged on purpose: every `is_personal` guard (DD-045 P3 owns them), the
-- one-owner invariant, the delete policy's `is_personal = false` term, and the
-- authority rules themselves — FIX 3 changes wording only, never who may act.
--
-- Idempotent: CREATE OR REPLACE / DROP … IF EXISTS throughout.

-- ---------------------------------------------------------------------------
-- 1. "Owner or admin of this organization" — the predicate the update policy needs
-- ---------------------------------------------------------------------------

create or replace function iam.is_org_manager(p_org_id uuid, p_user_id uuid)
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
         and membership.role in ('owner', 'admin')
         and membership.status = 'active'
         and membership.deleted_at is null
     );
$$;

comment on function iam.is_org_manager(uuid, uuid) is
  'True when p_user_id is the owner OR an admin of organization p_org_id, by membership role. '
  'The authority key for changing an organization''s own row; never iam.organizations.created_by, '
  'which does not move on an ownership transfer (DD-048 fix 1).';

-- An RLS policy expression is evaluated as the CALLER, so `authenticated` needs
-- EXECUTE on this. It is SECURITY DEFINER, so the door is declared BEFORE the
-- grant or the DB-wide guard re-revokes it (db-rules §6d-4). It discloses only
-- what a member can already read: the organization's own membership rows.
insert into platform.client_callable_door (schema_name, function_name, identity_args, reason)
select 'iam', 'is_org_manager', 'p_org_id uuid, p_user_id uuid',
       'Evaluated inside iam.organizations.org_update_policy, which runs as the caller. Returns only whether a user holds the owner or admin membership of an organization.'
where not exists (
  select 1 from platform.client_callable_door d
  where d.schema_name = 'iam' and d.function_name = 'is_org_manager'
);

grant execute on function iam.is_org_manager(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Updating an organization follows the owner/admin ROLE, not created_by
-- ---------------------------------------------------------------------------

drop policy if exists org_update_policy on iam.organizations;

create policy org_update_policy on iam.organizations
  for update
  using (
    (select public.is_platform_admin())
    or iam.is_org_manager(id, (select auth.uid()))
  )
  with check (
    (select public.is_platform_admin())
    or iam.is_org_manager(id, (select auth.uid()))
  );

-- ---------------------------------------------------------------------------
-- 3. Deleting an organization may not orphan ANY member, not just the deleter
-- ---------------------------------------------------------------------------

create or replace function iam._guard_organization_delete()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_orphans integer;
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

  -- DD-044 applies to EVERY user, not to the one holding the mouse: deleting an
  -- organization removes its memberships, so anyone whose ONLY organization this
  -- is would be left belonging to none.
  select count(*)::integer
  into v_orphans
  from iam.memberships as membership
  where membership.container_type = 'organization'
    and membership.container_id = old.id
    and membership.status = 'active'
    and membership.deleted_at is null
    and membership.user_id is distinct from v_uid
    and iam.is_last_organization(membership.user_id, old.id);

  if v_orphans > 0 then
    raise exception
      '% % no other organization and would be left with none. Ask them to join or create another organization first, then delete this one.',
      v_orphans,
      case when v_orphans = 1 then 'member of this organization has' else 'members of this organization have' end
      using errcode = '23514';
  end if;

  return old;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Two refusals become sentences that say who CAN do it
--    (wording only — the authority rules above them are byte-identical)
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
      elsif v_target_role = 'owner' then
        raise exception
          'The owner''s role can only be changed by transferring ownership, and only the owner can do that.'
          using errcode = '42501';
      else
        raise exception
          'Only this organization''s owner and admins can change what someone''s role is here.'
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
    elsif v_target_role = 'owner' then
      raise exception
        'The owner can''t be removed from their own organization. Transfer ownership first, then remove them.'
        using errcode = '42501';
    else
      raise exception
        'Only this organization''s owner and admins can remove someone, and anyone can remove themselves.'
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
