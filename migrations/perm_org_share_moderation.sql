-- Org-share moderation: org owners/admins can reject (or hold) resources that
-- members contribute to the org. Additive + default-safe: every existing grant
-- is 'active', so behavior is unchanged until something is explicitly rejected.
--
-- Applied to Matrx Main (txzxabzwovsujtloxrus) via apply_migration on 2026-06-05.

ALTER TABLE public.permissions
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS review_note text;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'permissions_status_check') THEN
    ALTER TABLE public.permissions
      ADD CONSTRAINT permissions_status_check CHECK (status IN ('active','pending','rejected'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS permissions_org_status_idx
  ON public.permissions (granted_to_organization_id, status)
  WHERE granted_to_organization_id IS NOT NULL;

-- has_permission: a rejected grant no longer confers access. The ONLY change
-- from the prior definition is the COALESCE(status) <> 'rejected' filter.
CREATE OR REPLACE FUNCTION public.has_permission(p_resource_type text, p_resource_id uuid, p_required_permission permission_level)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM permissions p
    WHERE p.resource_type = p_resource_type
      AND p.resource_id = p_resource_id
      AND COALESCE(p.status, 'active') <> 'rejected'
      AND (
        p.granted_to_user_id = auth.uid()
        OR (
          p.granted_to_organization_id IS NOT NULL
          AND p.granted_to_organization_id IN (
            SELECT om.organization_id FROM organization_members om WHERE om.user_id = auth.uid()
          )
        )
      )
      AND CASE p_required_permission
        WHEN 'viewer' THEN p.permission_level IN ('viewer', 'editor', 'admin')
        WHEN 'editor' THEN p.permission_level IN ('editor', 'admin')
        WHEN 'admin'  THEN p.permission_level = 'admin'
      END
    LIMIT 1
  );
$function$;

-- check_resource_access: same single additive change on the permissions branch.
CREATE OR REPLACE FUNCTION public.check_resource_access(p_resource_type text, p_resource_id uuid, p_required_level permission_level, p_owner_id uuid DEFAULT NULL::uuid, p_assignee_id uuid DEFAULT NULL::uuid, p_project_id uuid DEFAULT NULL::uuid, p_organization_id uuid DEFAULT NULL::uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RETURN false; END IF;
  IF p_owner_id IS NOT NULL AND p_owner_id = v_uid THEN RETURN true; END IF;
  IF p_assignee_id IS NOT NULL AND p_assignee_id = v_uid AND p_required_level IN ('viewer', 'editor') THEN RETURN true; END IF;
  RETURN EXISTS (
    WITH user_orgs AS (SELECT organization_id, role FROM organization_members WHERE user_id = v_uid),
    access_check AS (
      SELECT 1 FROM permissions p WHERE p.resource_type = p_resource_type AND p.resource_id = p_resource_id
        AND COALESCE(p.status, 'active') <> 'rejected'
        AND (p.granted_to_user_id = v_uid OR p.granted_to_organization_id IN (SELECT organization_id FROM user_orgs))
        AND CASE p_required_level WHEN 'viewer' THEN p.permission_level IN ('viewer','editor','admin') WHEN 'editor' THEN p.permission_level IN ('editor','admin') WHEN 'admin' THEN p.permission_level = 'admin' END
      UNION ALL
      SELECT 1 FROM ctx_project_members pm WHERE p_project_id IS NOT NULL AND pm.project_id = p_project_id AND pm.user_id = v_uid
        AND (p_required_level = 'viewer' OR pm.role IN ('owner','admin'))
      UNION ALL
      SELECT 1 FROM user_orgs uo WHERE p_organization_id IS NOT NULL AND uo.organization_id = p_organization_id
        AND (p_required_level = 'viewer' OR uo.role IN ('owner','admin'))
    )
    SELECT 1 FROM access_check LIMIT 1
  );
END;
$function$;

-- Moderation action: only an org owner/admin may set the status of a grant
-- targeting their org. SECURITY DEFINER bypasses RLS for the controlled update.
CREATE OR REPLACE FUNCTION public.review_org_share(p_permission_id uuid, p_status text, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_org uuid;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Not authenticated'); END IF;
  IF p_status NOT IN ('active','pending','rejected') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid status');
  END IF;
  SELECT granted_to_organization_id INTO v_org FROM public.permissions WHERE id = p_permission_id;
  IF v_org IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Not an organization share'); END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = v_org AND user_id = v_uid AND role IN ('owner','admin')
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only org owners or admins can review shares');
  END IF;
  UPDATE public.permissions
     SET status = p_status, reviewed_by = v_uid, reviewed_at = now(), review_note = p_note
   WHERE id = p_permission_id;
  RETURN jsonb_build_object('success', true, 'message', 'Share ' || p_status, 'status', p_status);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.review_org_share(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_org_share(uuid, text, text) TO authenticated;
