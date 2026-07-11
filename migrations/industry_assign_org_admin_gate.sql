-- Allow org owner/admin (or Matrx super_admin) to assign/unassign industries.
-- Auth is always against auth.uid() — never trust p_actor for authorization.
-- Taxonomy writes (industry_upsert) stay super-admin only.

CREATE OR REPLACE FUNCTION public.industry_assign_org(
  p_organization_id uuid,
  p_industry_id uuid,
  p_is_primary boolean DEFAULT false,
  p_actor uuid DEFAULT NULL
)
RETURNS iam.org_industries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_actor uuid;
  v_row iam.org_industries;
BEGIN
  v_actor := auth.uid();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF NOT public.is_super_admin() AND NOT public.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'not authorized: org admin or super admin required';
  END IF;

  IF p_is_primary THEN
    UPDATE iam.org_industries SET is_primary = false
     WHERE organization_id = p_organization_id AND is_primary;
  END IF;

  INSERT INTO iam.org_industries(organization_id, industry_id, is_primary, assigned_by)
  VALUES (p_organization_id, p_industry_id, p_is_primary, v_actor)
  ON CONFLICT (organization_id, industry_id) DO UPDATE SET is_primary = EXCLUDED.is_primary
  RETURNING * INTO v_row;

  INSERT INTO public.library_audit_log(actor_user_id, action, industry_id, organization_id, detail)
  VALUES (v_actor, 'industry_assign', p_industry_id, p_organization_id, jsonb_build_object('is_primary', p_is_primary));

  RETURN v_row;
END;
$function$;

CREATE OR REPLACE FUNCTION public.industry_unassign_org(
  p_organization_id uuid,
  p_industry_id uuid,
  p_actor uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_actor uuid;
BEGIN
  v_actor := auth.uid();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF NOT public.is_super_admin() AND NOT public.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'not authorized: org admin or super admin required';
  END IF;

  DELETE FROM iam.org_industries
   WHERE organization_id = p_organization_id AND industry_id = p_industry_id;

  INSERT INTO public.library_audit_log(actor_user_id, action, industry_id, organization_id, detail)
  VALUES (v_actor, 'industry_unassign', p_industry_id, p_organization_id, '{}'::jsonb);
END;
$function$;

REVOKE ALL ON FUNCTION public.industry_assign_org(uuid, uuid, boolean, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.industry_unassign_org(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.industry_assign_org(uuid, uuid, boolean, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.industry_unassign_org(uuid, uuid, uuid) TO authenticated;
