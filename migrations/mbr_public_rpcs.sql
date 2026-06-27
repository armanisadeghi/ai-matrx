-- mbr_public_rpcs.sql
--
-- The frontend data path to iam.memberships. `authenticated` has NO direct
-- grant on the iam schema, so all client reads/writes go through these PUBLIC
-- SECURITY-DEFINER RPCs, org-gated via iam.has_org_access, granted to
-- authenticated only. Consumed exclusively by
-- features/organizations/service/membershipsService.ts.
--
-- Soft-delete aware: reads filter `deleted_at is null`; mbr_remove sets
-- `deleted_at = now()` rather than hard-deleting. Idempotent.
--
-- NOTE: an earlier cutover (2026-06-25) already shipped a mbr_* family
-- (mbr_list / mbr_add / mbr_set_role / mbr_remove / mbr_for_user / mbr_count /
-- mbr_list_with_users) that is live and consumed by membershipsService.ts +
-- features/projects + features/tasks. This migration RECONCILES that family
-- onto the canonical Part-0a surface ADDITIVELY:
--   * mbr_list           — superset return (adds updated_at, metadata; keeps created_by)
--   * mbr_list_for_user  — NEW (explicit p_user_id; distinct from auth.uid()-only mbr_for_user)
--   * mbr_add            — upgraded canonical signature (explicit p_organization_id + p_metadata)
--   * mbr_update_role    — canonical name (replaces mbr_set_role)
--   * mbr_remove         — unchanged soft delete
-- mbr_for_user / mbr_count / mbr_list_with_users are preserved untouched.
--
-- Conflict handling for mbr_add relies on the existing unique constraint
-- iam.memberships_container_type_container_id_user_id_key
-- UNIQUE (container_type, container_id, user_id).

-- Drop the functions whose return-type / signature changes (can't create-or-replace).
-- Idempotent — safe to re-run.
drop function if exists public.mbr_list(text, uuid);
drop function if exists public.mbr_list_for_user(uuid, text);
drop function if exists public.mbr_add(text, uuid, uuid, text, uuid, text);
drop function if exists public.mbr_add(text, uuid, uuid, uuid, text, text, jsonb);
drop function if exists public.mbr_update_role(text, uuid, uuid, text);
drop function if exists public.mbr_set_role(text, uuid, uuid, text);

-- READ: all live memberships for one container, org-filtered. Superset columns.
create or replace function public.mbr_list(p_container_type text, p_container_id uuid)
returns table (
  id uuid, organization_id uuid, container_type text, container_id uuid,
  user_id uuid, role text, status text, created_at timestamptz,
  updated_at timestamptz, created_by uuid, metadata jsonb
)
language sql stable security definer set search_path to 'public' as $fn$
  select m.id, m.organization_id, m.container_type, m.container_id,
         m.user_id, m.role, m.status, m.created_at, m.updated_at, m.created_by, m.metadata
    from iam.memberships m
   where m.container_type = p_container_type
     and m.container_id = p_container_id
     and m.deleted_at is null
     and iam.has_org_access(m.organization_id);
$fn$;

-- READ: all live memberships for an explicit user, optional container_type filter, org-filtered.
create or replace function public.mbr_list_for_user(p_user_id uuid, p_container_type text default null)
returns table (
  id uuid, organization_id uuid, container_type text, container_id uuid,
  user_id uuid, role text, status text, created_at timestamptz,
  updated_at timestamptz, created_by uuid, metadata jsonb
)
language sql stable security definer set search_path to 'public' as $fn$
  select m.id, m.organization_id, m.container_type, m.container_id,
         m.user_id, m.role, m.status, m.created_at, m.updated_at, m.created_by, m.metadata
    from iam.memberships m
   where m.user_id = p_user_id
     and m.deleted_at is null
     and (p_container_type is null or m.container_type = p_container_type)
     and iam.has_org_access(m.organization_id);
$fn$;

-- WRITE: add one membership (idempotent), verifying org access.
create or replace function public.mbr_add(
  p_container_type text, p_container_id uuid, p_user_id uuid, p_organization_id uuid,
  p_role text default 'member', p_status text default 'active', p_metadata jsonb default '{}'::jsonb
) returns uuid
language plpgsql security definer set search_path to 'public' as $fn$
declare v_id uuid;
begin
  if p_organization_id is null or not iam.has_org_access(p_organization_id) then
    raise exception 'mbr_add: no org access (org=%, %/% user=%)', p_organization_id, p_container_type, p_container_id, p_user_id
      using errcode = '42501';
  end if;
  insert into iam.memberships (container_type, container_id, user_id, organization_id, role, status, metadata, created_by)
  values (p_container_type, p_container_id, p_user_id, p_organization_id,
          coalesce(p_role, 'member'), coalesce(p_status, 'active'), coalesce(p_metadata, '{}'::jsonb), auth.uid())
  on conflict (container_type, container_id, user_id)
  do update set
    role = coalesce(excluded.role, iam.memberships.role),
    status = coalesce(excluded.status, iam.memberships.status),
    metadata = excluded.metadata,
    deleted_at = null,
    updated_by = auth.uid(),
    updated_at = now()
  returning id into v_id;
  return v_id;
end $fn$;

-- WRITE: change a member's role (org-checked). Canonical name (replaces mbr_set_role).
create or replace function public.mbr_update_role(
  p_container_type text, p_container_id uuid, p_user_id uuid, p_role text
) returns void
language plpgsql security definer set search_path to 'public' as $fn$
begin
  update iam.memberships
     set role = p_role, updated_by = auth.uid(), updated_at = now()
   where container_type = p_container_type
     and container_id = p_container_id
     and user_id = p_user_id
     and deleted_at is null
     and iam.has_org_access(organization_id);
end $fn$;

-- WRITE: soft-delete one membership (org-checked).
create or replace function public.mbr_remove(
  p_container_type text, p_container_id uuid, p_user_id uuid
) returns void
language plpgsql security definer set search_path to 'public' as $fn$
begin
  update iam.memberships
     set deleted_at = now(), updated_by = auth.uid(), updated_at = now()
   where container_type = p_container_type
     and container_id = p_container_id
     and user_id = p_user_id
     and deleted_at is null
     and iam.has_org_access(organization_id);
end $fn$;

revoke all on function public.mbr_list(text,uuid) from public;
revoke all on function public.mbr_list_for_user(uuid,text) from public;
revoke all on function public.mbr_add(text,uuid,uuid,uuid,text,text,jsonb) from public;
revoke all on function public.mbr_update_role(text,uuid,uuid,text) from public;
revoke all on function public.mbr_remove(text,uuid,uuid) from public;
grant execute on function public.mbr_list(text,uuid) to authenticated;
grant execute on function public.mbr_list_for_user(uuid,text) to authenticated;
grant execute on function public.mbr_add(text,uuid,uuid,uuid,text,text,jsonb) to authenticated;
grant execute on function public.mbr_update_role(text,uuid,uuid,text) to authenticated;
grant execute on function public.mbr_remove(text,uuid,uuid) to authenticated;
