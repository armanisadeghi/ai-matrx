-- iam.access_level — cast RETURN literals to permission_level
--
-- plpgsql_check (audit.broken_functions) flagged 5 warnings: the function
-- RETURNS permission_level but bare text literals ('admin', 'editor', 'viewer')
-- were returned without casts (SQLSTATE 42804 at each RETURN).
--
-- Idempotent: CREATE OR REPLACE.

CREATE OR REPLACE FUNCTION iam.access_level(
  p_type text,
  p_id uuid,
  p_org uuid,
  p_owner uuid
)
RETURNS permission_level
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := (SELECT auth.uid());
BEGIN
  IF v_uid IS NOT NULL AND p_owner = v_uid THEN
    RETURN 'admin'::permission_level;
  END IF;

  IF v_uid IS NOT NULL
     AND p_org IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM iam.organization_member m
       WHERE m.organization_id = p_org
         AND m.user_id = v_uid
     )
  THEN
    RETURN 'editor'::permission_level;
  END IF;

  IF has_permission(p_type, p_id, 'admin'::permission_level) THEN
    RETURN 'admin'::permission_level;
  END IF;

  IF has_permission(p_type, p_id, 'editor'::permission_level) THEN
    RETURN 'editor'::permission_level;
  END IF;

  IF has_permission(p_type, p_id, 'viewer'::permission_level) THEN
    RETURN 'viewer'::permission_level;
  END IF;

  RETURN NULL;
END
$function$;
