-- dd191_container_authz_coalesce_fix1 — `coalesce` IS A CONSTRUCT, NOT A pg_catalog FUNCTION
-- (DD-191 fix 1. SECURITY P0 follow-on. Functions only.)
--
-- dd191_container_authz_refuses_non_members wrote `pg_catalog.coalesce(auth.role() = 'service_role',
-- false)` inside `iam._container_authz`. COALESCE is SQL syntax, not a schema-qualifiable function,
-- so every call raised
--
--   42883  function pg_catalog.coalesce(boolean, boolean) does not exist
--
-- and the whole invitation/membership family answered 404 for EVERY caller, member or not.
-- Measured live over HTTPS immediately after the apply, as test@test.com:
-- inv_list / inv_get_managed / inv_resend / inv_revoke all returned that 42883 — a refusal, but a
-- lying one: it says "no such function" when the truth is "this door is broken".
--
-- `coalesce` unqualified is safe under `search_path = ''` because pg_catalog is always implicitly
-- searched for functions and operators; the pre-existing bodies in this family already rely on that
-- (`coalesce(p_metadata, '{}'::jsonb)` in mbr_add).

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
  v_service boolean := coalesce(auth.role() = 'service_role', false);
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
