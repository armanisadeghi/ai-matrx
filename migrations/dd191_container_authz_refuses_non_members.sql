-- dd191_container_authz_refuses_non_members — A NON-MEMBER IS REFUSED BEFORE ANY ROLE IS COMPARED
-- (DD-191. SECURITY P0. db-rules §0/§6d/§9. No DDL on tables, no policies: functions only.)
--
-- ═══ THE DEFECT, MEASURED LIVE 2026-09-13 ══════════════════════════════════════════════════════
-- `iam._container_authz(container_type, container_id, actor)` returns a row for ANY existing
-- container, with `actor_role = NULL` when the actor holds no membership in it. Three of its nine
-- callers compared that role with `not in`:
--
--     if v_personal or v_actor_role not in ('owner', 'admin') then raise ... end if;
--
-- `NULL not in ('owner','admin')` is NULL, `false or NULL` is NULL, the `if` never fires, and the
-- refusal is dead code for exactly the population it exists to stop. Four live surfaces, every one
-- reached over HTTPS as `test@test.com` (4060701e-706a-4c76-b3ca-0bbc69fa5a14), a plain member of
-- two organizations and of NEITHER of the victims:
--
--   POST /rest/v1/rpc/inv_list        {organization 5dc930e9-… AI Matrx} → 200, the pending
--                                      invitation WITH its acceptance token
--                                      e74e408b-ed94-4568-90e9-1c77773dfe71
--   POST /rest/v1/rpc/inv_get_managed {that invitation id}              → 200, the whole row
--                                      (and inv_resend / inv_revoke ride the same helper)
--   public.inv_create('organization','5dc930e9-…',…,'admin',…)          → an ADMIN invitation into
--                                      an organization the caller has no standing in
--                                      (proved in a rolled-back transaction; 0 rows persisted)
--
-- Under RLS that same identity reads ZERO rows of `iam.invitations` — the only read policy is
-- `inv_invitee_read` (`invited_user_id = auth.uid()` or the JWT's own email). So this is not a
-- broad policy; it is a door walking past one.
--
-- ═══ THE CLASS, AND WHY THE FIX IS IN THE HELPER ═══════════════════════════════════════════════
-- Every caller that decides privilege from `actor_role` is one missing `coalesce` away from the
-- same hole, and a future caller inherits it by writing the obvious thing. So the refusal moves
-- INTO the helper: `iam._container_authz` now raises 42501 with a human sentence when the actor
-- holds no role in the container, before any caller can compare anything. Belt and braces — every
-- caller's own test also becomes NULL-safe (`coalesce(v_actor_role, 'none')`), so the guard holds
-- even if a later edit opts a caller out of the strict form.
--
-- THE THREE CALLERS THAT MUST STILL SEE ABSENCE opt out explicitly with `p_require_role => false`,
-- and NONE of them decides privilege from `actor_role`:
--   • `iam.membership_row_visible` — a boolean visibility predicate. It must answer false, never
--     raise; raising inside a row-visibility test turns a denied row into a failed query.
--   • `public.mbr_add` — organization bootstrap. The creator claiming the FIRST owner membership
--     has, by construction, no membership yet. Its authority comes from `resource_creator` plus
--     "this container has no memberships at all", not from `actor_role`.
--   • `public.access_request_decide` — uses the helper as a scalar for `resource_org_id` only; the
--     decider was already authorized by `iam.can_decide_access_request`.
--
-- Six callers take the strict default: `iam._managed_invitation`, `public.inv_create`,
-- `public.inv_list`, `public.mbr_remove`, `public.mbr_update_role`,
-- `public.transfer_organization_ownership`.
--
-- The service role is exempt inside the helper (`auth.role() = 'service_role'`), exactly as every
-- caller already exempts it with `v_service`; aidream reaches these functions as the service role
-- with no `auth.uid()` at all, and a strict raise there would break the server's own paths.
--
-- The helper keeps its posture: EXECUTE to `postgres` and `service_role` only. It is not a door.

drop function if exists iam._container_authz(text, uuid, uuid);

create or replace function iam._container_authz(
  p_container_type text,
  p_container_id uuid,
  p_actor uuid,
  p_require_role boolean default true
)
returns table(
  resource_org_id uuid,
  resource_creator uuid,
  resource_is_personal boolean,
  actor_role text
)
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_service boolean := pg_catalog.coalesce(auth.role() = 'service_role', false);
begin
  for resource_org_id, resource_creator, resource_is_personal, actor_role in
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
      and project.deleted_at is null

    union all

    select
      scope.organization_id,
      scope.created_by,
      false,
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
$function$;

revoke all on function iam._container_authz(text, uuid, uuid, boolean) from public;
revoke all on function iam._container_authz(text, uuid, uuid, boolean) from anon;
revoke all on function iam._container_authz(text, uuid, uuid, boolean) from authenticated;
grant execute on function iam._container_authz(text, uuid, uuid, boolean) to service_role;

comment on function iam._container_authz(text, uuid, uuid, boolean) is
  'THE ONE container authority read: an organization/project/scope''s organization id, creator, '
  'personal flag, and the actor''s active membership role in it. DD-191: with p_require_role (the '
  'default) an actor holding NO role in an existing container is refused here with 42501 — before '
  'any caller can compare a NULL role and fall through its own guard. Pass p_require_role => false '
  'ONLY where absence is a legitimate answer (a boolean visibility predicate, container bootstrap, '
  'or a pure resource_org_id lookup) and never decide privilege from a possibly-NULL actor_role. '
  'The service role is exempt, as every caller already exempts it.';

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- THE THREE LENIENT CALLERS — unchanged behaviour, explicit opt-out
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

create or replace function iam.membership_row_visible(p_membership_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path to ''
as $function$
DECLARE
  v_uid uuid := auth.uid();
  v_membership iam.memberships%ROWTYPE;
  v_allowed boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RETURN false;
  END IF;

  SELECT *
    INTO v_membership
  FROM iam.memberships
  WHERE id = p_membership_id
    AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF v_membership.user_id = v_uid
     OR v_membership.created_by = v_uid THEN
    RETURN true;
  END IF;

  -- DD-191: a visibility predicate answers false; it never raises. Hence the explicit opt-out.
  SELECT EXISTS (
    SELECT 1
    FROM iam._container_authz(
      v_membership.container_type,
      v_membership.container_id,
      v_uid,
      false
    ) AS authz
    WHERE authz.resource_creator = v_uid
       OR coalesce(authz.actor_role, 'none') IN ('owner', 'admin')
  )
  INTO v_allowed;

  RETURN v_allowed;
END
$function$;

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
set search_path to ''
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
    pg_catalog.hashtextextended(p_container_type || ':' || p_container_id::text, 0));

  -- DD-191: LENIENT on purpose. The creator claiming the first owner membership of a brand-new
  -- container has no membership yet, so a strict helper would make bootstrap impossible. The
  -- authority below never reads a possibly-NULL actor_role without a coalesce.
  select
    container.resource_org_id, container.resource_creator,
    container.resource_is_personal, container.actor_role
  into v_org, v_creator, v_personal, v_actor_role
  from iam._container_authz(p_container_type, p_container_id, v_uid, false) as container;

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
$function$;

create or replace function public.access_request_decide(
  p_request_id uuid,
  p_decision text,
  p_level text default null,
  p_note text default null
)
returns jsonb
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

    -- A shareable resource takes an ordinary grant; a membership container takes
    -- a membership. See access_request_decide_container_grants_membership.sql.
    if exists (select 1 from platform.shareable_resource_registry sr
                where sr.resource_type = v_req.resource_type) then
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
    elsif exists (select 1 from iam.memberships m
                   where m.container_type = v_req.resource_type
                     and m.deleted_at is null) then
      -- DD-191: LENIENT on purpose — this reads resource_org_id ONLY, and the decider was already
      -- authorized by iam.can_decide_access_request above. mbr_add below runs its own authority.
      perform public.mbr_add(
        v_req.resource_type,
        v_req.resource_id,
        v_req.created_by,
        (select c.resource_org_id
           from iam._container_authz(v_req.resource_type, v_req.resource_id, v_uid, false) c),
        case when v_level = 'admin'::public.permission_level then 'admin'
             else 'member' end,
        'active',
        jsonb_build_object('grant_source', 'access_request',
                           'request_id', p_request_id));
    else
      raise exception 'Access to this % cannot be granted from a request.',
        lower(coalesce((select label from platform.entity_types
                         where token = v_req.resource_type), 'item'))
        using errcode = '42501';
    end if;
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

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- THE SIX STRICT CALLERS — the helper refuses first, and their own tests are NULL-safe anyway
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

create or replace function public.inv_list(p_target_type text, p_target_id uuid)
returns table(
  id uuid, organization_id uuid, target_type text, target_id uuid, email text,
  invited_user_id uuid, role text, status text, token text,
  expires_at timestamptz, accepted_at timestamptz, created_at timestamptz, created_by uuid
)
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_service boolean := coalesce(auth.role() = 'service_role', false);
  v_org uuid;
  v_personal boolean;
  v_actor_role text;
begin
  -- DD-191: strict. A non-member never reaches the line below.
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
     and (v_personal or coalesce(v_actor_role, 'none') not in ('owner', 'admin')) then
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
set search_path to ''
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
    if v_personal or coalesce(v_actor_role, 'none') not in ('owner', 'admin') then
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
$function$;

create or replace function iam._managed_invitation(p_invitation_id uuid)
returns iam.invitations
language plpgsql
security definer
set search_path to ''
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

  -- DD-191: strict. This helper is what inv_get_managed / inv_resend / inv_revoke run on, and its
  -- `not in` test had the same NULL fall-through as inv_list — a non-member could read, resend and
  -- revoke any pending invitation whose id they held. Proved live 2026-09-13.
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
    if v_personal or coalesce(v_actor_role, 'none') not in ('owner', 'admin') then
      raise exception 'invitation manager role required' using errcode = '42501';
    end if;

    if v_invitation.role = 'owner' and coalesce(v_actor_role, 'none') <> 'owner' then
      raise exception 'only an owner may manage an owner invitation'
        using errcode = '42501';
    end if;
  end if;

  return v_invitation;
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

  -- DD-191: strict. Every arm below belongs to someone who holds a role here.
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
    elsif coalesce(v_actor_role, 'none') = 'owner' then
      null;
    -- R21: admins add and remove ADMINS and members. Only the owner is
    -- untouchable by an admin.
    elsif coalesce(v_actor_role, 'none') = 'admin' and v_target_role in ('member', 'admin') then
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

create or replace function public.mbr_update_role(
  p_container_type text,
  p_container_id uuid,
  p_user_id uuid,
  p_role text
)
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

  -- DD-191: strict.
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

      if coalesce(v_actor_role, 'none') = 'owner' then
        null;
      -- R21: admins add and remove ADMINS and members. Only the owner is
      -- untouchable by an admin.
      elsif coalesce(v_actor_role, 'none') = 'admin'
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
    elsif coalesce(v_actor_role, 'none') is distinct from 'owner' or p_role = 'owner' then
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

create or replace function public.transfer_organization_ownership(
  org_id uuid,
  current_owner_id uuid,
  new_owner_id uuid
)
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

  -- DD-191: strict.
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
