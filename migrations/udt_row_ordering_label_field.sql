-- Row ordering: remember WHICH column labels each row, and stop clobbering the
-- rest of row_ordering_config.
--
-- Two defects fixed here, both visible in the Reorder Rows dialog:
--   1. There was nowhere to record the label column, so the dialog guessed one
--      per row from jsonb key order — which Postgres does not preserve. The
--      result looked like it picked a column at random, and could pick a
--      DIFFERENT one for different rows. `label_field` is now part of the
--      config, resolved once from the schema.
--   2. The function rebuilt row_ordering_config from scratch on every save,
--      silently discarding `default_sort` written by
--      update_user_table_default_sort. It now merges.
--
-- Access is also brought in line with every other udt_* write (owner OR editor
-- OR service_role). It was owner-only, so a user shared into a table as editor
-- could rearrange rows in the dialog and have the save silently refused.

drop function if exists public.update_user_table_row_ordering(uuid, boolean, jsonb);

create or replace function public.update_user_table_row_ordering(
  p_table_id uuid,
  p_enabled boolean,
  p_order jsonb default null::jsonb,
  p_label_field text default null::text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
DECLARE
    v_config JSONB;
BEGIN
    IF (
      auth.role() = 'service_role'
      OR EXISTS (SELECT 1 FROM workbench.udt_datasets d WHERE d.id = p_table_id AND d.user_id = auth.uid())
      OR COALESCE(public.has_permission('udt_datasets', p_table_id, 'editor'), false)
    ) IS NOT TRUE THEN
        RETURN jsonb_build_object('success', false, 'error', 'Table not found or access denied');
    END IF;

    SELECT COALESCE(row_ordering_config, '{}'::jsonb) INTO v_config
    FROM workbench.udt_datasets WHERE id = p_table_id;

    -- Merge, never replace: default_sort and any future key survives.
    v_config := v_config || jsonb_build_object(
        'enabled', p_enabled,
        'order', COALESCE(p_order, v_config->'order', '[]'::jsonb)
    );

    IF p_label_field IS NOT NULL THEN
        -- Only accept a column that actually exists, so the config can never
        -- point at a deleted or renamed column.
        IF EXISTS (
            SELECT 1 FROM workbench.udt_dataset_fields
            WHERE table_id = p_table_id AND field_name = p_label_field
        ) THEN
            v_config := v_config || jsonb_build_object('label_field', p_label_field);
        END IF;
    END IF;

    UPDATE workbench.udt_datasets
    SET row_ordering_config = v_config, updated_at = now()
    WHERE id = p_table_id;

    RETURN jsonb_build_object('success', true, 'row_ordering_config', v_config);

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$;

comment on function public.update_user_table_row_ordering(uuid, boolean, jsonb, text) is
  'Saves manual row order for a user data table. Merges into row_ordering_config (never replaces it) and records label_field — the column shown as each row''s label in the Reorder Rows dialog. Owner or editor.';

grant execute on function public.update_user_table_row_ordering(uuid, boolean, jsonb, text) to authenticated, service_role;

notify pgrst, 'reload schema';
