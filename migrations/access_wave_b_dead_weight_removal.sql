-- Wave B: access-architecture dead-weight removal (audit gaps G4/G6/G7/G16 partial)
-- All targets verified zero-live-caller 2026-07-15 (code grep both repos + pg_proc sweep).
-- Idempotent. See common-docs/access-architecture/FEATURE.md §7.

-- B1: has_permission_for — remove the hardcoded structured_list alias CTE.
-- 0 rows in iam.permissions use any alias spelling; registry-driven spelling
-- resolution (resource_type / table_name / schema.table) is preserved verbatim.
CREATE OR REPLACE FUNCTION public.has_permission_for(p_user_id uuid, p_resource_type text, p_resource_id uuid, p_required_permission permission_level)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with registry_forms as (
    select array_remove(array[
      r.resource_type,
      r.table_name,
      concat_ws('.', r.schema_name, r.table_name)
    ], null) as spellings
    from platform.shareable_resource_registry r
    where r.is_active
      and (r.resource_type = p_resource_type
        or r.table_name = p_resource_type
        or concat_ws('.', r.schema_name, r.table_name) = p_resource_type)
    limit 1
  ),
  forms as (
    select coalesce(
      (
        select array(
          select distinct spelling
          from unnest(rf.spellings || array[p_resource_type]) as spelling
        )
        from registry_forms rf
      ),
      array[p_resource_type]
    ) as spellings
  )
  select exists (
    select 1
    from iam.permissions p, forms f
    where p.resource_type = any(f.spellings)
      and p.resource_id = p_resource_id
      and coalesce(p.status, 'active') <> 'rejected'
      and (p.expires_at is null or p.expires_at > now())
      and (
        p.granted_to_user_id = p_user_id
        or (
          p.granted_to_organization_id is not null
          and p.granted_to_organization_id in (
            select om.organization_id
            from iam.organization_member om
            where om.user_id = p_user_id
          )
        )
      )
      and case p_required_permission
        when 'viewer' then p.permission_level in ('viewer', 'editor', 'admin')
        when 'editor' then p.permission_level in ('editor', 'admin')
        when 'admin' then p.permission_level = 'admin'
      end
    limit 1
  );
$function$;

-- B2: legacy invitation RPC twins (superseded by inv_* family; zero callers).
DROP FUNCTION IF EXISTS public.invite_to_organization(org_id uuid, email_address text, member_role org_role, invited_by_user_id uuid);
DROP FUNCTION IF EXISTS public.accept_organization_invitation(invitation_token text, accepting_user_id uuid);
DROP FUNCTION IF EXISTS public.get_org_invitation_by_token(p_token text);

-- B3: graveyard-only project predicates + the 6 graveyard policies referencing them.
DROP POLICY IF EXISTS project_invitations_delete_policy ON graveyard.ctx_project_invitations;
DROP POLICY IF EXISTS project_invitations_insert_policy ON graveyard.ctx_project_invitations;
DROP POLICY IF EXISTS project_invitations_select_policy ON graveyard.ctx_project_invitations;
DROP POLICY IF EXISTS project_invitations_update_policy ON graveyard.ctx_project_invitations;
DROP POLICY IF EXISTS project_members_delete_policy ON graveyard.ctx_project_members;
DROP POLICY IF EXISTS project_members_update_policy ON graveyard.ctx_project_members;
DROP FUNCTION IF EXISTS public.auth_is_project_admin(p_project_id uuid);
DROP FUNCTION IF EXISTS public.auth_is_project_member(p_project_id uuid);
DROP FUNCTION IF EXISTS public.auth_is_project_owner(p_project_id uuid);

-- B4: zero-caller shared-with-me readers.
DROP FUNCTION IF EXISTS public.get_prompts_shared_with_me();
DROP FUNCTION IF EXISTS iam.shared_with_me();
DROP FUNCTION IF EXISTS iam.shared_by_me();

-- B5a: admin_promote — fix stale comment only (admins_user_id_fkey DOES exist;
-- the existence check stays as belt-and-suspenders). Body otherwise unchanged.
CREATE OR REPLACE FUNCTION public.admin_promote(target_user_id uuid, target_level admin_level DEFAULT 'developer'::admin_level, target_permissions jsonb DEFAULT '{}'::jsonb, target_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS admin.admins
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  inserted admin.admins;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Forbidden: Super Admin required' USING ERRCODE = '42501';
  END IF;

  -- Verify the target user exists in auth.users for a clean 23503 error
  -- (admins_user_id_fkey also enforces this at the constraint level).
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = target_user_id) THEN
    RAISE EXCEPTION 'User % does not exist', target_user_id USING ERRCODE = '23503';
  END IF;

  INSERT INTO admin.admins (user_id, level, permissions, metadata)
  VALUES (target_user_id, target_level, target_permissions, target_metadata)
  RETURNING * INTO inserted;

  RETURN inserted;
END;
$function$;

-- B5b: delete the single legacy is_public grant row — its resource
-- (conversation 26c06267-e3dd-47bb-8acc-3c1dba0ab57e) no longer exists; orphan.
DELETE FROM iam.permissions
 WHERE id = 'f153afbf-db75-4ab1-8254-93c85030c4ae'
   AND is_public = true
   AND NOT EXISTS (SELECT 1 FROM chat.conversation c WHERE c.id = resource_id);
