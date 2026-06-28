-- Expand get_org_invitation_by_token to return the org display fields the accept
-- page renders (logo, description, website, etc.) — the invitee can't read
-- iam.organizations directly (RLS), so this SECURITY DEFINER RPC must provide them.
-- Applied via Supabase MCP 2026-06-28.
DROP FUNCTION IF EXISTS public.get_org_invitation_by_token(text);
CREATE FUNCTION public.get_org_invitation_by_token(p_token text)
RETURNS TABLE (
  id uuid, organization_id uuid, email text, role text, token text,
  expires_at timestamptz, status text,
  org_name text, org_slug text, org_description text, org_logo_url text,
  org_logo_file_id uuid, org_website text, org_is_personal boolean,
  org_settings jsonb, org_created_at timestamptz, org_updated_at timestamptz, org_created_by uuid
)
LANGUAGE sql SECURITY DEFINER STABLE AS $function$
  SELECT i.id, i.organization_id, i.email, i.role, i.token, i.expires_at, i.status,
         o.name, o.slug, o.description, o.logo_url, o.logo_file_id, o.website, o.is_personal,
         o.settings, o.created_at, o.updated_at, o.created_by
  FROM iam.invitations i
  LEFT JOIN iam.organizations o ON o.id = i.organization_id
  WHERE i.token = p_token AND i.deleted_at IS NULL
  LIMIT 1;
$function$;
GRANT EXECUTE ON FUNCTION public.get_org_invitation_by_token(text) TO authenticated, anon;
