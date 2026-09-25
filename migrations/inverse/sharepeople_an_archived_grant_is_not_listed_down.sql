-- INVERSE of migrations/campaign/sharepeople_an_archived_grant_is_not_listed.sql: the body byte-for-byte as it was.
set local lock_timeout = '30s';

CREATE OR REPLACE FUNCTION public.get_resource_permissions(p_resource_type text, p_resource_id uuid)
 RETURNS TABLE(id uuid, resource_type text, resource_id uuid, granted_to_user_id uuid, granted_to_organization_id uuid, is_public boolean, permission_level text, created_at timestamp with time zone, granted_to_user jsonb, granted_to_organization jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_resolved record;
BEGIN
  BEGIN
    SELECT * INTO STRICT v_resolved FROM public.resolve_shareable_resource(p_resource_type);
  EXCEPTION WHEN OTHERS THEN RETURN; END;

  IF NOT public.may_manage_sharing(v_resolved.resource_type, p_resource_id) THEN RETURN; END IF;

  RETURN QUERY
  SELECT
    perm.id,
    perm.resource_type::text,
    perm.resource_id,
    perm.granted_to_user_id,
    perm.granted_to_organization_id,
    perm.is_public,
    perm.permission_level::text,
    perm.created_at,
    CASE WHEN perm.granted_to_user_id IS NOT NULL THEN
      jsonb_build_object(
        'id', u.id::text,
        'email', u.email,
        'displayName', COALESCE(
          u.raw_user_meta_data->>'display_name',
          u.raw_user_meta_data->>'full_name',
          split_part(u.email, '@', 1)
        )
      )
    END AS granted_to_user,
    CASE WHEN perm.granted_to_organization_id IS NOT NULL THEN
      jsonb_build_object(
        'id', o.id::text,
        'name', COALESCE(o.name, 'Unknown Organization'),
        'slug', COALESCE(o.slug, 'unknown'),
        'logoUrl', o.logo_url
      )
    END AS granted_to_organization
  FROM iam.permissions perm
  LEFT JOIN auth.users        u ON u.id = perm.granted_to_user_id
  LEFT JOIN iam.organizations o ON o.id = perm.granted_to_organization_id
  WHERE perm.resource_type = v_resolved.resource_type
    AND perm.resource_id   = p_resource_id
  ORDER BY perm.created_at DESC;
END;
$function$;
