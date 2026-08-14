-- get_user_table_complete was omitting two field columns the UI depends on:
--   * metadata  — where a column's display format now lives
--   * is_public — TableConfigModal renders a "Pub" checkbox bound to it, so
--                 without it every column read back as NOT public and a save
--                 from that modal silently cleared the flag.
-- Only the field payload changes; every other key is byte-identical.

create or replace function public._d31_impl_get_user_table_complete(
  p_table_id uuid,
  p_sort_field text default null::text,
  p_sort_direction text default 'asc'::text
)
returns jsonb
language plpgsql
security definer
as $function$
DECLARE
    v_table_info JSONB;
    v_fields JSONB;
    v_data JSONB;
    v_valid_sort_field TEXT;
    v_query TEXT;
BEGIN
    SELECT jsonb_build_object(
        'id', id, 'table_name', table_name, 'description', description, 'version', version,
        'user_id', user_id, 'is_public', is_public, 'row_ordering_config', row_ordering_config,
        'created_at', created_at, 'updated_at', updated_at
    ) INTO v_table_info
    FROM workbench.udt_datasets WHERE id = p_table_id;

    IF v_table_info IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Table not found or access denied');
    END IF;

    SELECT jsonb_agg(jsonb_build_object(
        'id', id, 'field_name', field_name, 'display_name', display_name,
        'data_type', data_type, 'field_order', field_order, 'is_required', is_required,
        'is_public', is_public,
        'default_value', default_value, 'validation_rules', validation_rules,
        'metadata', COALESCE(metadata, '{}'::jsonb)
    ) ORDER BY field_order)
    INTO v_fields FROM workbench.udt_dataset_fields WHERE table_id = p_table_id;

    IF p_sort_field IS NOT NULL THEN
        SELECT field_name INTO v_valid_sort_field
        FROM workbench.udt_dataset_fields
        WHERE table_id = p_table_id
          AND (field_name = p_sort_field OR display_name = p_sort_field)
        LIMIT 1;
    END IF;

    v_query := 'SELECT jsonb_agg(jsonb_build_object(''id'', id, ''data'', data, ''created_at'', created_at, ''updated_at'', updated_at)';
    IF v_valid_sort_field IS NOT NULL THEN
        v_query := v_query || ' ORDER BY (data->>''' || v_valid_sort_field || ''')';
        IF p_sort_direction = 'desc' THEN
            v_query := v_query || ' DESC';
        ELSE
            v_query := v_query || ' ASC';
        END IF;
    ELSE
        v_query := v_query || ' ORDER BY created_at';
    END IF;
    v_query := v_query || ') FROM workbench.udt_dataset_rows WHERE table_id = $1';

    EXECUTE v_query USING p_table_id INTO v_data;

    RETURN jsonb_build_object(
        'success', true,
        'table', v_table_info,
        'fields', COALESCE(v_fields, '[]'::jsonb),
        'data', COALESCE(v_data, '[]'::jsonb),
        'row_count', jsonb_array_length(COALESCE(v_data, '[]'::jsonb)),
        'field_count', jsonb_array_length(COALESCE(v_fields, '[]'::jsonb))
    );
END;
$function$;

notify pgrst, 'reload schema';
