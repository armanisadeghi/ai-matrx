-- Class invites + join codes — the WP6 "teacher gets students in under a minute" affordance.
--
-- Two lanes, both reusing canon:
--   1. EMAIL / CSV INVITES ride the ONE canonical invitation system (iam.invitations + inv_* RPCs).
--      This migration extends that core — additively — to accept `scope` targets, because a class
--      IS a scope (`context.scopes`, scope type slug 'class') and `inv_accept` already writes the
--      exact `iam.memberships` row the class roster reads (container_type='scope'). No new table,
--      no second invitation system.
--   2. JOIN CODES follow the proven game_room join_code pattern: a short shareable code stored in
--      the class scope's settings (settings.join_code), owner-managed (get/rotate/disable), with a
--      SECURITY DEFINER resolver + join RPC. A code admits directly to open AND closed classes
--      (distributing the code IS the teacher's approval — Google Classroom semantics); it NEVER
--      bypasses payment on a paid class (needs_purchase unless already entitled).
--
-- Semantics decisions (logged in education-platform DECISION_LOG):
--   - An accepted email invite confers ACTIVE membership regardless of access mode — an invite
--     from the class owner is itself the approval (and, for paid classes, a deliberate comp:
--     only the owner/org-admin can mint invites).
--   - Scope invites are always role='member' (class ownership is never transferred by invite).
--
-- All functions are idempotent CREATE OR REPLACE; replacing a function preserves its ACL.

-- ============================================================================
-- 1. iam._container_authz — additive third branch: scope containers.
--    Manager authority for a scope = the scope's creator or an org owner/admin
--    (mirrors public._edu_is_owner). resource_is_personal is false for scopes:
--    classes deliberately live in the teacher's PERSONAL org, and the personal-org
--    refusal in inv_create/inv_list exists to keep people from inviting members
--    into a personal ORG — inviting members into a scope they own is the feature.
-- ============================================================================
CREATE OR REPLACE FUNCTION iam._container_authz(p_container_type text, p_container_id uuid, p_actor uuid)
 RETURNS TABLE(resource_org_id uuid, resource_creator uuid, resource_is_personal boolean, actor_role text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    and scope.deleted_at is null;
$function$;

-- ============================================================================
-- 2. inv_create — accept scope targets (member role only).
--    Only the target-type whitelist and a scope-role guard change; every other
--    rule (advisory lock, manager check, email resolution, pending-refresh) is
--    the existing canonical body, untouched.
-- ============================================================================
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

-- ============================================================================
-- 3. inv_get_by_token — resolve a scope target's name (class name on the
--    accept page). Additive CASE branch only.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.inv_get_by_token(p_token text)
 RETURNS TABLE(id uuid, organization_id uuid, target_type text, target_id uuid, email text, invited_user_id uuid, role text, status text, expires_at timestamp with time zone, accepted_at timestamp with time zone, created_at timestamp with time zone, created_by uuid, target_name text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    i.id,
    i.organization_id,
    i.target_type,
    i.target_id,
    i.email,
    i.invited_user_id,
    i.role,
    i.status,
    i.expires_at,
    i.accepted_at,
    i.created_at,
    i.created_by,
    CASE
      WHEN i.target_type = 'organization' THEN (
        SELECT o.name FROM iam.organizations o WHERE o.id = i.target_id
      )
      WHEN i.target_type = 'project' THEN (
        SELECT p.name FROM workspace.projects p WHERE p.id = i.target_id
      )
      WHEN i.target_type = 'scope' THEN (
        SELECT s.name FROM context.scopes s WHERE s.id = i.target_id
      )
      ELSE NULL
    END AS target_name
  FROM iam.invitations i
  WHERE i.token = p_token
    AND i.deleted_at IS NULL
    AND (
      i.invited_user_id = auth.uid()
      OR lower(i.email) = lower((
        SELECT u.email FROM auth.users u WHERE u.id = auth.uid()
      ))
    );
$function$;

-- ============================================================================
-- 4. Join codes — generation helper (internal, not granted).
--    game_room's alphabet (no 0/O/1/I), 6 chars, unique among live class codes.
-- ============================================================================
CREATE OR REPLACE FUNCTION public._edu_generate_join_code()
 RETURNS text
 LANGUAGE plpgsql
 VOLATILE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text;
  v_attempt int := 0;
begin
  loop
    v_attempt := v_attempt + 1;
    if v_attempt > 20 then
      raise exception 'could not generate a unique join code';
    end if;
    select string_agg(substr(v_alphabet, 1 + floor(random() * 32)::int, 1), '')
      into v_code
      from generate_series(1, 6);
    exit when not exists (
      select 1
      from context.scopes s
      join context.scope_types st on st.id = s.scope_type_id
      where st.slug = 'class'
        and s.deleted_at is null
        and upper(coalesce(s.settings->>'join_code', '')) = v_code
    );
  end loop;
  return v_code;
end;
$function$;

REVOKE EXECUTE ON FUNCTION public._edu_generate_join_code() FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 5. edu_class_join_code — owner-managed code lifecycle: get / rotate / disable.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.edu_class_join_code(p_class uuid, p_action text DEFAULT 'get')
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_scope context.scopes;
  v_uid uuid := (select auth.uid());
  v_code text;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if p_action not in ('get', 'rotate', 'disable') then
    raise exception 'invalid action %', p_action using errcode = '22023';
  end if;
  v_scope := public._edu_class(p_class);
  if not public._edu_is_owner(v_scope) then
    raise exception 'class owner required' using errcode = '42501';
  end if;

  v_code := v_scope.settings->>'join_code';

  if p_action = 'disable' then
    update context.scopes
       set settings = coalesce(settings, '{}'::jsonb) - 'join_code',
           updated_at = now(), updated_by = v_uid
     where id = v_scope.id;
    return jsonb_build_object('code', null);
  end if;

  if p_action = 'rotate' or v_code is null then
    v_code := public._edu_generate_join_code();
    update context.scopes
       set settings = jsonb_set(coalesce(settings, '{}'::jsonb), '{join_code}', to_jsonb(v_code)),
           updated_at = now(), updated_by = v_uid
     where id = v_scope.id;
  end if;

  return jsonb_build_object('code', v_code);
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.edu_class_join_code(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.edu_class_join_code(uuid, text) TO authenticated;

-- ============================================================================
-- 6. edu_class_by_code — signed-in preview of the class behind a code, so the
--    join page can show what you are joining before you commit (name, mode,
--    member count). SECURITY DEFINER because a closed class is not readable
--    by a non-member; holding the code is the authorization to see this much.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.edu_class_by_code(p_code text)
 RETURNS TABLE(class_id uuid, name text, description text, access_mode text, member_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  return query
  select s.id,
         s.name,
         s.description,
         public._edu_access_mode(s),
         (select count(*) from iam.memberships m
           where m.container_type = 'scope' and m.container_id = s.id
             and m.status = 'active' and m.deleted_at is null)
  from context.scopes s
  join context.scope_types st on st.id = s.scope_type_id
  where st.slug = 'class'
    and s.deleted_at is null
    and upper(coalesce(s.settings->>'join_code', '')) = upper(btrim(p_code))
  limit 1;
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.edu_class_by_code(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.edu_class_by_code(text) TO authenticated;

-- ============================================================================
-- 7. edu_class_join_by_code — the code IS the teacher's admission: joins open
--    and closed classes directly. Paid classes still require the purchase (or
--    an existing entitled grant) — a code never bypasses money.
--    Returns the same jsonb envelope as edu_class_join.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.edu_class_join_by_code(p_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_uid uuid := (select auth.uid());
  v_scope context.scopes;
  v_mode text;
  v_row iam.memberships;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;

  select s.* into v_scope
  from context.scopes s
  join context.scope_types st on st.id = s.scope_type_id
  where st.slug = 'class'
    and s.deleted_at is null
    and upper(coalesce(s.settings->>'join_code', '')) = upper(btrim(p_code))
  limit 1;
  if v_scope.id is null then
    raise exception 'invalid join code' using errcode = 'P0002';
  end if;

  v_mode := public._edu_access_mode(v_scope);

  if public._edu_is_owner(v_scope) then
    perform public._edu_ensure_owner_membership(v_scope);
    return jsonb_build_object('status', 'already_member', 'role', 'owner', 'access_mode', v_mode, 'class_id', v_scope.id);
  end if;

  select * into v_row from iam.memberships
  where container_type = 'scope' and container_id = v_scope.id
    and user_id = v_uid and deleted_at is null
  order by (status = 'active') desc limit 1;

  if v_row.id is not null and v_row.status = 'active' then
    return jsonb_build_object('status', 'already_member', 'role', v_row.role, 'access_mode', v_mode, 'class_id', v_scope.id);
  end if;

  if v_mode = 'paid' and (v_row.id is null or v_row.status <> 'entitled') then
    return jsonb_build_object('status', 'needs_purchase', 'access_mode', v_mode, 'class_id', v_scope.id);
  end if;

  if v_row.id is not null then
    update iam.memberships
       set status = 'active', role = 'member', updated_at = now(), updated_by = v_uid
     where id = v_row.id;
  else
    insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status, created_by)
    values (v_scope.organization_id, 'scope', v_scope.id, v_uid, 'member', 'active', v_uid);
  end if;

  return jsonb_build_object('status', 'joined', 'role', 'member', 'access_mode', v_mode, 'class_id', v_scope.id);
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.edu_class_join_by_code(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.edu_class_join_by_code(text) TO authenticated;
