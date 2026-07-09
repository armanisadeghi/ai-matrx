-- Extend inv_get_by_token with target_name so invitees can render the accept
-- page without a direct SELECT on iam.organizations / workspace.projects
-- (those tables are RLS-gated to members; invitees are not members yet).
--
-- DROP + recreate required: Postgres cannot ADD an OUT column to RETURNS TABLE.

DROP FUNCTION IF EXISTS public.inv_get_by_token(text);

CREATE FUNCTION public.inv_get_by_token(p_token text)
RETURNS TABLE(
  id uuid,
  organization_id uuid,
  target_type text,
  target_id uuid,
  email text,
  invited_user_id uuid,
  role text,
  status text,
  expires_at timestamp with time zone,
  accepted_at timestamp with time zone,
  created_at timestamp with time zone,
  created_by uuid,
  target_name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
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

REVOKE ALL ON FUNCTION public.inv_get_by_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.inv_get_by_token(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.inv_get_by_token(text) TO service_role;
