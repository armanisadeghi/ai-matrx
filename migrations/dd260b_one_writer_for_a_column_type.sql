-- DD-260 / F1, second half — a column's declared type gets exactly ONE writer.
--
-- Found while fixing the row-history badge (migrations/dd260_udt_type_change_names_the_real_from_type.sql):
-- `update_user_table_config` did not merely "flip the declared type and leave rows
-- mis-shapen", as the Table settings dialog's comment claimed. Its implementation
-- carried a SECOND, undeclared type-conversion path — a per-row loop with
-- `EXCEPTION WHEN OTHERS THEN v_conversion_success := FALSE` around every cell. A
-- value that would not convert was left exactly as it was, under a column now
-- declared to be a different type, with NO row-history entry, NO reason, and
-- nothing on any screen. That is the very class DD-244 closed on
-- `udt_change_field_type` and never looked for here.
--
-- WHAT THIS FILE CHANGES:
--
--   1. `_d31_impl_update_user_table_config` REFUSES a `data_type` change in
--      `p_field_updates`, before ANY write, naming the column, both types, and the
--      RPC that does it properly. An echoed-but-unchanged `data_type` is still
--      accepted — that is not a type change. Every other field property still
--      rides this RPC exactly as before.
--   2. The silent converter loop is deleted. It is unreachable after (1), and it
--      was a data path nobody declared.
--
-- WHY IT MUST BE THIS DOOR, not just the dialog: with only the dialog fixed, the
-- declared type still had two writers, and the deployed (pre-fix) bundle would have
-- written `data_type` here and THEN been refused by `udt_change_field_type` —
-- leaving the table declared one type over rows of another, in two separate
-- transactions. Refusing at the first door makes that window atomic: the old bundle
-- now fails before anything is written, loudly, with the remedy.
--
-- Callers censused 2026-09-15: `TableConfigModal` (no longer sends `data_type`) and
-- `features/data-tables/service.ts`'s field_order reorder. No aidream/server caller.
--
-- Guard: `pnpm check:udt-history` — the "flipping the declared type first is
-- refused" check drives this exact door through the real RPC.
--
-- based-on: public._d31_impl_update_user_table_config(uuid, jsonb, jsonb) f923d2dce8ee8855dbbdf9fb2fd63ae30b7ad56ba3a35476897beab610afe498

CREATE OR REPLACE FUNCTION public._d31_impl_update_user_table_config(p_table_id uuid, p_table_updates jsonb DEFAULT NULL::jsonb, p_field_updates jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_table_exists BOOLEAN := FALSE;
    v_field_update JSONB;
    v_field_id UUID;
    v_old_data_type public.field_data_type;
    v_new_data_type public.field_data_type;
    v_data_row RECORD;
    v_field_name TEXT;
    v_converted_value JSONB;
    v_conversion_success BOOLEAN;
    v_updated_fields INT := 0;
    v_updated_rows INT := 0;
BEGIN
    SELECT EXISTS(SELECT 1 FROM workbench.udt_datasets WHERE id = p_table_id) INTO v_table_exists;
    IF NOT v_table_exists THEN
        RETURN jsonb_build_object('success', false, 'error', 'Table not found or access denied');
    END IF;

    -- DD-260. A column's declared type has exactly ONE writer:
    -- public.udt_change_field_type. Refuse here BEFORE anything is written, so a
    -- caller that asks for a type change through this door leaves nothing
    -- half-applied. Two reasons, both live:
    --   * The loop below was a SECOND, undeclared type-conversion path with
    --     `EXCEPTION WHEN OTHERS THEN v_conversion_success := FALSE` around every
    --     cell — a value that would not convert was left in place, silently, with
    --     no history row, no reason, and nothing on any screen. That is the exact
    --     class DD-244 closed on udt_change_field_type and missed here.
    --   * Flipping `data_type` here destroys the from-type udt_change_field_type
    --     needs to stamp on row history; it is what made the production badge read
    --     `type_change:integer→integer` (DD-260 / V-113 finding F1).
    -- An echoed data_type that is UNCHANGED is fine — that is not a type change.
    IF p_field_updates IS NOT NULL AND jsonb_array_length(p_field_updates) > 0 THEN
        FOR v_field_update IN SELECT * FROM jsonb_array_elements(p_field_updates) LOOP
            IF NOT (v_field_update ? 'data_type') THEN CONTINUE; END IF;
            v_field_id := (v_field_update->>'id')::UUID;
            IF v_field_id IS NULL THEN CONTINUE; END IF;
            SELECT data_type, field_name INTO v_old_data_type, v_field_name
              FROM workbench.udt_dataset_fields
             WHERE id = v_field_id AND table_id = p_table_id;
            IF v_old_data_type IS NULL THEN CONTINUE; END IF;
            IF (v_field_update->>'data_type')::public.field_data_type IS DISTINCT FROM v_old_data_type THEN
                RAISE EXCEPTION
                  'update_user_table_config: refusing to change column "%" from % to % — this RPC is not the type-change path, and its own converter silently left un-convertible values in place with nothing in row history to say so. Nothing was changed.',
                  v_field_name, v_old_data_type, (v_field_update->>'data_type')
                  USING errcode = 'P0001',
                        hint = 'Call public.udt_change_field_type(p_table_id, p_field_id, p_new_type, ''cast_or_null'') instead. It rewrites every row, flips the declared type ITSELF, stamps type_change:<from>→<to> on the row history, and refuses to empty a cell whose only copy would be lost (DD-244/DD-260). Send every OTHER field property through this RPC as usual, just not data_type.';
            END IF;
        END LOOP;
    END IF;

    IF p_table_updates IS NOT NULL THEN
        UPDATE workbench.udt_datasets SET
            table_name = COALESCE(p_table_updates->>'table_name', table_name),
            description = COALESCE(p_table_updates->>'description', description),
            is_public = COALESCE((p_table_updates->>'is_public')::BOOLEAN, is_public),
            version = version + 1, updated_at = NOW()
        WHERE id = p_table_id;
    END IF;

    IF p_field_updates IS NOT NULL AND jsonb_array_length(p_field_updates) > 0 THEN
        FOR v_field_update IN SELECT * FROM jsonb_array_elements(p_field_updates) LOOP
            v_field_id := (v_field_update->>'id')::UUID;
            IF v_field_id IS NULL THEN CONTINUE; END IF;

            SELECT data_type, field_name INTO v_old_data_type, v_field_name
            FROM workbench.udt_dataset_fields
            WHERE id = v_field_id AND table_id = p_table_id;

            IF v_old_data_type IS NULL THEN CONTINUE; END IF;

            -- The legacy in-place converter that used to live here is GONE (DD-260):
            -- it was unreachable after the refusal above, and it was a silent
            -- data path — `EXCEPTION WHEN OTHERS` per cell, un-convertible values
            -- left as they were, nothing recorded. public.udt_change_field_type is
            -- the one type-change path and it writes row history.

            UPDATE workbench.udt_dataset_fields SET
                field_name = COALESCE(v_field_update->>'field_name', field_name),
                display_name = COALESCE(v_field_update->>'display_name', display_name),
                data_type = COALESCE((v_field_update->>'data_type')::public.field_data_type, data_type),
                field_order = COALESCE((v_field_update->>'field_order')::INTEGER, field_order),
                is_required = COALESCE((v_field_update->>'is_required')::BOOLEAN, is_required),
                default_value = COALESCE(v_field_update->'default_value', default_value),
                validation_rules = COALESCE(v_field_update->'validation_rules', validation_rules),
                is_public = COALESCE((v_field_update->>'is_public')::BOOLEAN, is_public),
                updated_at = NOW()
            WHERE id = v_field_id AND table_id = p_table_id;
            v_updated_fields := v_updated_fields + 1;
        END LOOP;
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'table_id', p_table_id,
        'updated_fields', v_updated_fields,
        'updated_data_rows', v_updated_rows,
        'message', 'Table configuration updated successfully'
    );
END;
$function$;

COMMENT ON FUNCTION public._d31_impl_update_user_table_config(uuid, jsonb, jsonb) IS
  'Updates a user-defined table''s metadata and its fields'' properties. It does NOT '
  'change a column''s declared type: that is public.udt_change_field_type, the one '
  'writer, which rewrites the rows and records the row history. A data_type change '
  'sent here is refused before anything is written (DD-260).';
