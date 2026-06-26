-- permissions_expires_at_and_file_token.sql
-- Applied during the canonical-model cutover (via Supabase MCP apply_migration).
--
-- Two canonical hardening changes surfaced by the cld_ cutover:
--
-- B) Grant expiry on public.permissions (architecture EXPANSION — an improvement).
--    public.permissions had no expiry, so file grants (and any grant) could not be
--    time-boxed. Add a nullable `expires_at`. EXPLICIT RULE:
--      * expires_at IS NULL  → the grant NEVER expires (the default; permanent).
--      * expires_at > now()  → grant is active.
--      * expires_at <= now() → grant is inert (treated as if absent).
--    Grants that don't need expiry simply leave it NULL — no other change required.
--    Both grant resolvers (has_permission, check_resource_access) now enforce this,
--    so expiry is honored everywhere a grant is read.
--
-- C) File token reconciliation (align the registry to the architecture, don't bend
--    the architecture). The canonical entity token is `file` (platform.entity_types
--    `file` -> public.cld_files; iam.has_access('file',…) works), and the app writes
--    permissions with resource_type='file'. But shareable_resource_registry — which
--    public.permissions' owner-side RLS reaches via is_resource_owner ->
--    resolve_shareable_resource — registered the file row under the physical token
--    `cld_files`, so resolve_shareable_resource('file') raised. Retoken the row to
--    the canonical `file`; table_name stays `cld_files`, and since resolve matches
--    on (resource_type OR table_name) the legacy `cld_files` lookup keeps working.
--    Safe: zero permissions rows use 'cld_files' today.
-- Idempotent.

-- ── B: expiry column + rule ──────────────────────────────────────────────
alter table public.permissions add column if not exists expires_at timestamptz;
comment on column public.permissions.expires_at is
  'Grant expiry. NULL = never expires (default). A grant is effective only while (expires_at IS NULL OR expires_at > now()); past that it is inert. Enforced in has_permission() and check_resource_access().';

create or replace function public.has_permission(p_resource_type text, p_resource_id uuid, p_required_permission permission_level)
returns boolean language sql stable security definer set search_path to 'public' as $fn$
  select exists (
    select 1
    from permissions p
    where p.resource_type = p_resource_type
      and p.resource_id = p_resource_id
      and coalesce(p.status, 'active') <> 'rejected'
      and (p.expires_at is null or p.expires_at > now())          -- expiry rule (NULL = never)
      and (
        p.granted_to_user_id = auth.uid()
        or (
          p.granted_to_organization_id is not null
          and p.granted_to_organization_id in (
            select om.organization_id from organization_members om where om.user_id = auth.uid()
          )
        )
      )
      and case p_required_permission
        when 'viewer' then p.permission_level in ('viewer', 'editor', 'admin')
        when 'editor' then p.permission_level in ('editor', 'admin')
        when 'admin'  then p.permission_level = 'admin'
      end
    limit 1
  );
$fn$;

-- check_resource_access also reads permissions directly — honor expiry there too.
create or replace function public.check_resource_access(
  p_resource_type text, p_resource_id uuid, p_required_level permission_level,
  p_owner_id uuid default null, p_assignee_id uuid default null,
  p_project_id uuid default null, p_organization_id uuid default null
) returns boolean
language plpgsql stable security definer set search_path to 'public' as $fn$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then return false; end if;
  if p_owner_id is not null and p_owner_id = v_uid then return true; end if;
  if p_assignee_id is not null and p_assignee_id = v_uid and p_required_level in ('viewer','editor') then return true; end if;
  return exists (
    with user_orgs as (select organization_id, role from organization_members where user_id = v_uid),
    access_check as (
      select 1 from permissions p where p.resource_type = p_resource_type and p.resource_id = p_resource_id
        and coalesce(p.status, 'active') <> 'rejected'
        and (p.expires_at is null or p.expires_at > now())        -- expiry rule (NULL = never)
        and (p.granted_to_user_id = v_uid or p.granted_to_organization_id in (select organization_id from user_orgs))
        and case p_required_level when 'viewer' then p.permission_level in ('viewer','editor','admin') when 'editor' then p.permission_level in ('editor','admin') when 'admin' then p.permission_level = 'admin' end
      union all
      select 1 from iam.memberships pm where p_project_id is not null and pm.container_type='project' and pm.container_id = p_project_id
        and pm.user_id = v_uid and pm.deleted_at is null
        and (p_required_level = 'viewer' or pm.role in ('owner','admin'))
      union all
      select 1 from user_orgs uo where p_organization_id is not null and uo.organization_id = p_organization_id
        and (p_required_level = 'viewer' or uo.role in ('owner','admin'))
    )
    select 1 from access_check limit 1
  );
end;
$fn$;

-- ── C: retoken the file row to the canonical `file` ──────────────────────
update public.shareable_resource_registry
   set resource_type = 'file'
 where resource_type = 'cld_files' and table_name = 'cld_files';
