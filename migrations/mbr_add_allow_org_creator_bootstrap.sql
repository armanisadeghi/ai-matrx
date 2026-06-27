-- Widen public.mbr_add's org-access guard so the org's CREATOR can bootstrap the
-- first membership of an org they just created (e.g. add themselves as owner).
--
-- Before: mbr_add gated solely on iam.has_org_access(p_organization_id), which
-- checks for an existing active membership. A just-created org has none, so the
-- creator could never become its first owner once public.organization_members
-- was dropped (raised 42501). This mirrors public.organizations.org_select_policy,
-- which already grants the creator access via `created_by = auth.uid()`.
--
-- This is NOT a general weakening: it only lets the verified creator of an org
-- (organizations.created_by = auth.uid()) seed memberships into that same org;
-- everyone else still requires has_org_access. Idempotent (CREATE OR REPLACE).

CREATE OR REPLACE FUNCTION public.mbr_add(
  p_container_type text,
  p_container_id uuid,
  p_user_id uuid,
  p_organization_id uuid,
  p_role text DEFAULT 'member'::text,
  p_status text DEFAULT 'active'::text,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare v_id uuid;
begin
  if p_organization_id is null
     or not (
       iam.has_org_access(p_organization_id)
       or exists (
         select 1 from public.organizations o
         where o.id = p_organization_id and o.created_by = (select auth.uid())
       )
     ) then
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
end $function$;
