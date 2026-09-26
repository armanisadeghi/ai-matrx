-- chair-step: _container_authz's result shape changes (the deprecated organization flag's column leaves it), and a function's RETURNS TABLE can only change by DROP + CREATE; the REVOKE re-establishes its original service-role-only grant. There is no additive form of removing a column from a result.
-- based-on: iam._container_authz(text, uuid, uuid, boolean) 27c026c23816b0300efc6c21c8c36a97c5b35182e39b6d35179a71b30b8ffce8
-- based-on: iam._managed_invitation(uuid) 7b4f203da0d62a701782a3fdd9983e63ea2370a1afaac5d6d8cfb90f1a9234e0
-- based-on: public.inv_create(text, uuid, text, text, uuid, uuid, timestamp with time zone) ed9e1cb629022947821b44bdef5449cb6302366e1d037b2ffbfc81adaf19a298
-- based-on: public.inv_list(text, uuid) 08764d54a3c67aee9909eab0d47b3575ec829e5aa3309b154d01b328529f39cb
-- based-on: public.mbr_add(text, uuid, uuid, uuid, text, text, jsonb) 66bab441ead267c4e91fd4bed42d6e440fc22c2a7896411d13668e64b7c99a91
-- based-on: public.mbr_remove(text, uuid, uuid) b514100949434be8641cf7328adc3f3168e895e0847d0b0ea3b8fc5b69c648f4
-- based-on: public.mbr_update_role(text, uuid, uuid, text) de4e0a09d5543143edded6f49a3ffe63ccc02a92971b1e97150c4ae6be43837e
-- based-on: public.transfer_organization_ownership(uuid, uuid, uuid) e555b63989ef22c4517fa9c2ef2e43cd93ef65ec73124f5f0067ef7142ab3a90
-- lane: access-ladder T-3
-- lock: iam
--
-- EVERY ORGANIZATION'S OWNERS AND ADMINS MANAGE ITS MEMBERS — NO ORGANIZATION IS SPECIAL.
-- (The access ladder, common-docs/policies/access-ladder.md: organizations are unlimited and
-- equal; anyone may be invited into any organization, including the one created at signup.)
--
-- iam._container_authz returned the deprecated organization flag as resource_is_personal and
-- six RPCs refused on it: mbr_add / mbr_update_role / mbr_remove ("personal organization
-- memberships are immutable"), transfer_organization_ownership ("personal organization
-- ownership is immutable"), inv_create / inv_list / iam._managed_invitation ("invitation manager
-- role required" even for the owner). So the owner of a signup organization could not invite or
-- add anyone to it. The column leaves _container_authz; each caller loses the branch and nothing
-- else — the owner/admin role checks, last-owner and last-organization guards are unchanged.

set local lock_timeout = '3s';

drop function iam._container_authz(text, uuid, uuid, boolean);

CREATE OR REPLACE FUNCTION iam._container_authz(p_container_type text, p_container_id uuid, p_actor uuid, p_require_role boolean DEFAULT true)
 RETURNS TABLE(resource_org_id uuid, resource_creator uuid, actor_role text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_service boolean := coalesce(auth.role() = 'service_role', false);
begin
  for resource_org_id, resource_creator, actor_role in
    select
      organization.id,
      organization.created_by,
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
      and project.deleted_at is null

    union all

    select
      scope.organization_id,
      scope.created_by,
      (
        case
          when scope.created_by = p_actor then 'owner'
          when exists (
            select 1
            from iam.memberships as org_membership
            where org_membership.container_type = 'organization'
              and org_membership.container_id = scope.organization_id
              and org_membership.user_id = p_actor
              and org_membership.role in ('owner', 'admin')
              and org_membership.status = 'active'
              and org_membership.deleted_at is null
          ) then 'admin'
          else (
            select scope_membership.role
            from iam.memberships as scope_membership
            where scope_membership.container_type = 'scope'
              and scope_membership.container_id = scope.id
              and scope_membership.user_id = p_actor
              and scope_membership.status = 'active'
              and scope_membership.deleted_at is null
            limit 1
          )
        end
      )
    from context.scopes as scope
    where p_container_type = 'scope'
      and scope.id = p_container_id
      and scope.deleted_at is null
  loop
    -- THE REFUSAL, before any caller compares anything. A container that does not exist still
    -- returns no rows and no error, so a caller's own "not found" sentence is unchanged.
    if p_require_role and not v_service and actor_role is null then
      raise exception
        'You are not a member of this %, so you can''t manage it. Ask one of its owners or admins.',
        p_container_type
        using errcode = '42501';
    end if;
    return next;
  end loop;
  return;
end;
$function$
;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values
  ('iam', '_container_authz',
   'p_container_type text, p_container_id uuid, p_actor uuid, p_require_role boolean',
   array['text'::regtype, 'uuid'::regtype, 'uuid'::regtype, 'boolean'::regtype]::oid[],
   'Recreated by access-ladder T-3 (its result lost the deprecated organization flag). p_container_id is read against iam.organizations / workspace.projects / context.scopes by exact id; p_actor is compared to iam.memberships.user_id; NULL ids match nothing and return no row. With p_require_role an actor holding no role is refused 42501.',
   'migrations/access_ladder_t3_every_org_manages_its_members.sql (lane access-ladder T-3)',
   'server_only: service_role alone holds EXECUTE; anon and authenticated hold none. It is called only from inside the membership, invitation, ownership-transfer and access-request RPCs, which pass auth.uid() as p_actor.',
   false, false)
on conflict do nothing;

revoke all on function iam._container_authz(text, uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function iam._container_authz(text, uuid, uuid, boolean) to service_role;

comment on function iam._container_authz(text, uuid, uuid, boolean) is
  'THE ONE container authority read: an organization/project/scope''s organization id, creator, and the actor''s active membership role in it. Every organization is equal (access ladder, 2026-09-26): there is no organization type in this answer. DD-191: with p_require_role (the default) an actor holding NO role in an existing container is refused here with 42501 — before any caller can compare a NULL role and fall through its own guard. Pass p_require_role => false ONLY where absence is a legitimate answer (a boolean visibility predicate, container bootstrap, or a pure resource_org_id lookup) and never decide privilege from a possibly-NULL actor_role. The service role is exempt, as every caller already exempts it.';

CREATE OR REPLACE FUNCTION public.mbr_add(p_container_type text, p_container_id uuid, p_user_id uuid, p_organization_id uuid, p_role text DEFAULT 'member'::text, p_status text DEFAULT 'active'::text, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_service boolean := coalesce(auth.role() = 'service_role', false);
  v_org uuid;
  v_creator uuid;
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
    pg_catalog.hashtextextended(p_container_type || ':' || p_container_id::text, 0));

  -- DD-191: LENIENT on purpose. The creator claiming the first owner membership of a brand-new
  -- container has no membership yet, so a strict helper would make bootstrap impossible. The
  -- authority below never reads a possibly-NULL actor_role without a coalesce.
  select
    container.resource_org_id, container.resource_creator,
    container.actor_role
  into v_org, v_creator, v_actor_role
  from iam._container_authz(p_container_type, p_container_id, v_uid, false) as container;

  if not found or v_org is null then
    perform platform.refuse_not_found('membership container not found');
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

    -- DD-191: NULL-safe. A non-member lands on the else arm, never on a NULL that skips the chain.
    if coalesce(v_actor_role, 'none') = 'owner' then
      null;
    elsif coalesce(v_actor_role, 'none') = 'admin'
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

  -- DD-162: THE ONE DOOR, asked about the write itself rather than about the branch that reached
  -- it. The bootstrap case lands on the "nothing actually moved" arm (the creator claiming their
  -- own first membership), the org-manager case on the organization arm, a project admin on the
  -- kernel arm, and the service role on its own.
  perform iam.assert_may_transfer('membership', v_creator, p_user_id, v_org,
                                  p_container_type, p_container_id);

  insert into iam.memberships (
    container_type, container_id, user_id, organization_id, role, status, metadata, created_by
  )
  values (
    p_container_type, p_container_id, p_user_id, v_org, p_role, 'active',
    coalesce(p_metadata, '{}'::jsonb), v_uid
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
$function$
;

CREATE OR REPLACE FUNCTION public.mbr_update_role(p_container_type text, p_container_id uuid, p_user_id uuid, p_role text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_service boolean := coalesce(auth.role() = 'service_role', false);
  v_org uuid;
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

  -- DD-191: strict.
  select
    container.resource_org_id,
    container.actor_role
  into v_org, v_actor_role
  from iam._container_authz(p_container_type, p_container_id, v_uid) as container;

  if not found or v_org is null then
    perform platform.refuse_not_found('membership container not found');
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
    perform platform.refuse_not_found('membership not found');
  end if;

  if not v_service then

    if p_container_type = 'organization' then
      -- R21: one owner per organization. Ownership moves ONLY through
      -- transfer_organization_ownership, which demotes the outgoing owner in
      -- the same step. A role update may never mint a second owner.
      if p_role = 'owner' and v_target_role is distinct from 'owner' then
        raise exception
          'An organization can have exactly one owner. Use Transfer ownership to hand it to someone else.'
          using errcode = '23514';
      end if;

      if coalesce(v_actor_role, 'none') = 'owner' then
        null;
      -- R21: admins add and remove ADMINS and members. Only the owner is
      -- untouchable by an admin.
      elsif coalesce(v_actor_role, 'none') = 'admin'
            and coalesce(v_target_role, 'none') in ('member', 'admin')
            and p_role in ('member', 'admin') then
        null;
      elsif coalesce(v_target_role, 'none') = 'owner' then
        raise exception
          'The owner''s role can only be changed by transferring ownership, and only the owner can do that.'
          using errcode = '42501';
      else
        raise exception
          'Only this organization''s owner and admins can change what someone''s role is here.'
          using errcode = '42501';
      end if;
    elsif coalesce(v_actor_role, 'none') is distinct from 'owner' or p_role = 'owner' then
      raise exception 'project owner role required' using errcode = '42501';
    end if;
  end if;

  if coalesce(v_target_role, 'none') = 'owner' and p_role <> 'owner' then
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
$function$
;

CREATE OR REPLACE FUNCTION public.mbr_remove(p_container_type text, p_container_id uuid, p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_service boolean := coalesce(auth.role() = 'service_role', false);
  v_org uuid;
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

  -- DD-191: strict. Every arm below belongs to someone who holds a role here.
  select
    container.resource_org_id,
    container.actor_role
  into v_org, v_actor_role
  from iam._container_authz(p_container_type, p_container_id, v_uid) as container;

  if not found or v_org is null then
    perform platform.refuse_not_found('membership container not found');
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
    perform platform.refuse_not_found('membership not found');
  end if;

  if not v_service then
    -- DD-044: nobody ends up belonging to no organization. This is checked
    -- first so the person is told the real reason ("it is your only one").
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


    if p_user_id = v_uid then
      null;
    elsif coalesce(v_actor_role, 'none') = 'owner' then
      null;
    -- R21: admins add and remove ADMINS and members. Only the owner is
    -- untouchable by an admin.
    elsif coalesce(v_actor_role, 'none') = 'admin' and coalesce(v_target_role, 'none') in ('member', 'admin') then
      null;
    elsif coalesce(v_target_role, 'none') = 'owner' then
      raise exception
        'The owner can''t be removed from their own organization. Transfer ownership first, then remove them.'
        using errcode = '42501';
    else
      raise exception
        'Only this organization''s owner and admins can remove someone, and anyone can remove themselves.'
        using errcode = '42501';
    end if;
  end if;

  if coalesce(v_target_role, 'none') = 'owner' then
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
$function$
;

CREATE OR REPLACE FUNCTION public.transfer_organization_ownership(org_id uuid, current_owner_id uuid, new_owner_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_service boolean := coalesce(auth.role() = 'service_role', false);
  v_org uuid;
  v_actor_role text;
  v_owner_count integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('organization:' || org_id::text, 0)
  );

  -- DD-191: strict.
  select
    container.resource_org_id,
    container.actor_role
  into v_org, v_actor_role
  from iam._container_authz('organization', org_id, v_uid) as container;

  if not found or v_org is null then
    perform platform.refuse_not_found('organization not found');
  end if;

  if not v_service then
    -- DD-045 P3 owns this guard; DD-048 leaves it exactly as it was.

    if current_owner_id is distinct from v_uid
       or coalesce(v_actor_role, 'none') is distinct from 'owner' then
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
    perform platform.refuse_not_found('current owner membership not found');
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
$function$
;

CREATE OR REPLACE FUNCTION public.inv_create(p_target_type text, p_target_id uuid, p_email text, p_role text DEFAULT 'member'::text, p_org_id uuid DEFAULT NULL::uuid, p_invited_user_id uuid DEFAULT NULL::uuid, p_expires_at timestamp with time zone DEFAULT (now() + '7 days'::interval))
 RETURNS iam.invitations
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_service boolean := coalesce(auth.role() = 'service_role', false);
  v_org uuid;
  v_actor_role text;
  v_email text := pg_catalog.lower(pg_catalog.btrim(p_email));
  v_resolved_user_id uuid;
  v_row iam.invitations;
begin
  if p_target_type not in ('organization', 'project', 'scope')
     or p_role not in ('owner', 'admin', 'member') then
    raise exception 'invalid invitation target or role' using errcode = '22023';
  end if;

  if p_target_type = 'scope' and p_role <> 'member' then
    raise exception 'scope invitations are member-only' using errcode = '42501';
  end if;

  if v_email is null or v_email = ''
     or p_expires_at is null
     or p_expires_at <= now() then
    raise exception 'invalid invitation email or expiry' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_target_type || ':' || p_target_id::text, 0)
  );

  -- DD-191: strict. A non-member never reaches the mint below.
  select
    container.resource_org_id,
    container.actor_role
  into v_org, v_actor_role
  from iam._container_authz(p_target_type, p_target_id, v_uid) as container;

  if not found or v_org is null then
    perform platform.refuse_not_found('invitation target not found');
  end if;

  if p_org_id is not null and p_org_id is distinct from v_org then
    raise exception 'invitation target/organization mismatch'
      using errcode = '42501';
  end if;

  if not v_service then
    if coalesce(v_actor_role, 'none') not in ('owner', 'admin') then
      raise exception 'invitation manager role required' using errcode = '42501';
    end if;

    if p_role = 'owner' and coalesce(v_actor_role, 'none') <> 'owner' then
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
$function$
;

CREATE OR REPLACE FUNCTION public.inv_list(p_target_type text, p_target_id uuid)
 RETURNS TABLE(id uuid, organization_id uuid, target_type text, target_id uuid, email text, invited_user_id uuid, role text, status text, token text, expires_at timestamp with time zone, accepted_at timestamp with time zone, created_at timestamp with time zone, created_by uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_service boolean := coalesce(auth.role() = 'service_role', false);
  v_org uuid;
  v_actor_role text;
begin
  -- DD-191: strict. A non-member never reaches the line below.
  select
    container.resource_org_id,
    container.actor_role
  into v_org, v_actor_role
  from iam._container_authz(p_target_type, p_target_id, v_uid) as container;

  if not found or v_org is null then
    perform platform.refuse_not_found('invitation target not found');
  end if;

  if not v_service
     and (coalesce(v_actor_role, 'none') not in ('owner', 'admin')) then
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
$function$
;

CREATE OR REPLACE FUNCTION iam._managed_invitation(p_invitation_id uuid)
 RETURNS iam.invitations
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_service boolean := coalesce(auth.role() = 'service_role', false);
  v_invitation iam.invitations;
  v_org uuid;
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
    perform platform.refuse_not_found('pending invitation not found');
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
    perform platform.refuse_not_found('pending invitation not found');
  end if;

  -- DD-191: strict. This helper is what inv_get_managed / inv_resend / inv_revoke run on, and its
  -- `not in` test had the same NULL fall-through as inv_list — a non-member could read, resend and
  -- revoke any pending invitation whose id they held. Proved live 2026-09-13.
  select
    container.resource_org_id,
    container.actor_role
  into v_org, v_actor_role
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
    if coalesce(v_actor_role, 'none') not in ('owner', 'admin') then
      raise exception 'invitation manager role required' using errcode = '42501';
    end if;

    if v_invitation.role = 'owner' and coalesce(v_actor_role, 'none') <> 'owner' then
      raise exception 'only an owner may manage an owner invitation'
        using errcode = '42501';
    end if;
  end if;

  return v_invitation;
end;
$function$
;

