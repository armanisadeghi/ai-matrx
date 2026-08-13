-- A NULL shareable_resource_registry.is_public_column has two meanings:
-- canonical enum visibility, or no public visibility at all. Return the
-- verified physical state column and storage kind explicitly so generic
-- clients never guess between boolean, visibility, card_visibility, and
-- unsupported storage.
CREATE OR REPLACE FUNCTION public.get_share_capabilities(p_resource_type text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_r record;
  v_visibility_column text;
  v_boolean_column text;
BEGIN
  SELECT *
  INTO v_r
  FROM platform.shareable_resource_registry
  WHERE (resource_type = p_resource_type OR table_name = p_resource_type)
    AND is_active
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'supports_public', false,
      'is_link_shareable', false,
      'public_state_column', NULL,
      'public_state_kind', NULL
    );
  END IF;

  SELECT c.column_name
  INTO v_visibility_column
  FROM information_schema.columns AS c
  WHERE c.table_schema = v_r.schema_name
    AND c.table_name = v_r.table_name
    AND c.column_name IN ('visibility', 'card_visibility')
  ORDER BY CASE c.column_name
    WHEN 'visibility' THEN 0
    WHEN 'card_visibility' THEN 1
    ELSE 2
  END
  LIMIT 1;

  SELECT c.column_name
  INTO v_boolean_column
  FROM information_schema.columns AS c
  WHERE c.table_schema = v_r.schema_name
    AND c.table_name = v_r.table_name
    AND c.column_name = v_r.is_public_column
    AND c.data_type = 'boolean'
  LIMIT 1;

  RETURN jsonb_build_object(
    'supports_public',
      v_visibility_column IS NOT NULL OR v_boolean_column IS NOT NULL,
    'is_link_shareable', COALESCE(v_r.is_link_shareable, false),
    'public_state_column', COALESCE(v_visibility_column, v_boolean_column),
    'public_state_kind', CASE
      WHEN v_visibility_column IS NOT NULL THEN 'enum'
      WHEN v_boolean_column IS NOT NULL THEN 'boolean'
      ELSE NULL
    END
  );
END;
$function$;

COMMENT ON FUNCTION public.get_share_capabilities(text) IS
  'Returns link-sharing support plus the verified physical public-state column and storage kind; NULL state means public visibility is unsupported.';

GRANT EXECUTE ON FUNCTION public.get_share_capabilities(text) TO authenticated;
