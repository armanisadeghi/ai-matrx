-- Applied live to Matrx Main on 2026-08-12.
-- Registration can now show the physical table columns before the registry row
-- exists, so admins select anonymous-share fields instead of typing names.

DROP FUNCTION IF EXISTS public.admin_shareable_registry_defaults(text);

CREATE FUNCTION public.admin_shareable_registry_defaults(p_token text)
RETURNS TABLE (
  resource_type text,
  schema_name text,
  table_name text,
  display_label text,
  already_registered boolean,
  all_columns text[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT
    e.token,
    e.schema_name,
    e.table_name,
    e.label,
    EXISTS (
      SELECT 1
      FROM platform.shareable_resource_registry s
      WHERE s.resource_type = e.token
    ),
    ARRAY(
      SELECT c.column_name::text
      FROM information_schema.columns c
      WHERE c.table_schema = e.schema_name
        AND c.table_name = e.table_name
      ORDER BY c.ordinal_position
    )
  FROM platform.entity_types e
  WHERE public.is_super_admin()
    AND e.token = p_token;
$function$;

REVOKE ALL ON FUNCTION public.admin_shareable_registry_defaults(text)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.admin_shareable_registry_defaults(text)
TO authenticated, service_role;

COMMENT ON FUNCTION public.admin_shareable_registry_defaults(text) IS
  'Super-admin registration defaults from platform.entity_types, including the live physical column list used by the share-field picker.';

-- Repair the fabricated values the old required-input form forced into the
-- first web_page registration. Generic no-login shares use /s/[token], so a
-- resource-specific in-app destination may honestly be absent.
UPDATE platform.shareable_resource_registry
SET url_path_template = '',
    is_public_column = NULL,
    updated_at = now()
WHERE resource_type = 'web_page'
  AND url_path_template = '/fake/{id}'
  AND is_public_column = 'visibility';
