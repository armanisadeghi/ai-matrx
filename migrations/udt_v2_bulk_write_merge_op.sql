-- ============================================================================
-- udt_v2_bulk_write_merge_op — add `op:'merge'` to udt_bulk_write
-- ============================================================================
--
-- WHY
-- ---
-- The existing `op:'update'` REPLACES the row's data column wholesale. That's
-- correct for full-row updates (e.g. the in-app EditRowModal sends the whole
-- record), but it's the wrong primitive for partial-row writes that touch a
-- subset of keys: any key not in the payload would silently disappear.
--
-- The legacy `update_data_row_in_user_table` RPC supports partial updates
-- because its body uses `data = data || p_data` (jsonb concat = merge). Two
-- ai-matrx call sites still depend on that semantic:
--   - UserTableViewer bulk HTML-cleanup loop (each entry has multiple changed
--     fields per row).
--   - Future agent / extension flows that send partial row payloads.
--
-- This migration adds an `op:'merge'` branch to udt_bulk_write so those sites
-- can migrate off the legacy RPC. The semantic of merge is exactly the
-- jsonb_concat operator: keys present in the op payload overwrite, keys absent
-- from the payload are preserved.
--
-- SAFETY
-- ------
-- Pure-additive — existing op kinds (insert / update / cell / delete) are
-- untouched. CREATE OR REPLACE on a SECURITY DEFINER function is atomic.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.udt_bulk_write(p_table_id UUID, p_operations JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_caller UUID := auth.uid(); v_dataset udt_datasets%ROWTYPE;
  v_op JSONB; v_op_kind TEXT; v_row_id UUID;
  v_result JSONB; v_results JSONB := '[]'::jsonb;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'udt_bulk_write: not authenticated'; END IF;
  SELECT * INTO v_dataset FROM udt_datasets WHERE id = p_table_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'udt_bulk_write: table % not found', p_table_id; END IF;
  IF v_dataset.user_id <> v_caller AND NOT has_permission('udt_datasets', p_table_id, 'editor'::permission_level) THEN
    RAISE EXCEPTION 'udt_bulk_write: caller lacks editor permission';
  END IF;
  IF jsonb_typeof(p_operations) <> 'array' THEN
    RAISE EXCEPTION 'udt_bulk_write: p_operations must be a JSON array';
  END IF;

  FOR v_op IN SELECT * FROM jsonb_array_elements(p_operations) LOOP
    v_op_kind := v_op ->> 'op';
    v_row_id  := NULLIF(v_op ->> 'row_id', '')::uuid;

    IF v_op_kind = 'insert' THEN
      INSERT INTO udt_dataset_rows(table_id, data, user_id)
      VALUES (p_table_id, v_op -> 'data', v_caller)
      RETURNING to_jsonb(udt_dataset_rows.*) INTO v_result;
      v_results := v_results || jsonb_build_array(v_result);

    ELSIF v_op_kind = 'update' THEN
      -- Wholesale replace.
      UPDATE udt_dataset_rows
         SET data = v_op -> 'data', updated_at = now()
       WHERE id = v_row_id AND table_id = p_table_id
       RETURNING to_jsonb(udt_dataset_rows.*) INTO v_result;
      v_results := v_results || jsonb_build_array(
        COALESCE(v_result, jsonb_build_object('error', 'row_not_found', 'row_id', v_row_id))
      );

    ELSIF v_op_kind = 'merge' THEN
      -- Partial update: jsonb_concat. Keys in v_op->'data' overwrite the
      -- existing row's matching keys; absent keys are preserved.
      UPDATE udt_dataset_rows
         SET data = COALESCE(data, '{}'::jsonb) || (v_op -> 'data'),
             updated_at = now()
       WHERE id = v_row_id AND table_id = p_table_id
       RETURNING to_jsonb(udt_dataset_rows.*) INTO v_result;
      v_results := v_results || jsonb_build_array(
        COALESCE(v_result, jsonb_build_object('error', 'row_not_found', 'row_id', v_row_id))
      );

    ELSIF v_op_kind = 'cell' THEN
      -- Reject undeclared fields (mirrors udt_upsert_cell — bulk callers
      -- cannot pollute rows with keys that aren't columns of this dataset).
      IF NOT EXISTS (
        SELECT 1 FROM udt_dataset_fields
         WHERE table_id = p_table_id AND field_name = v_op ->> 'field_name'
      ) THEN
        RAISE EXCEPTION 'udt_bulk_write: cell op references undeclared field % on table %',
          v_op ->> 'field_name', p_table_id;
      END IF;
      UPDATE udt_dataset_rows
         SET data = jsonb_set(COALESCE(data, '{}'::jsonb), ARRAY[v_op ->> 'field_name'], v_op -> 'value', true),
             updated_at = now()
       WHERE id = v_row_id AND table_id = p_table_id
       RETURNING to_jsonb(udt_dataset_rows.*) INTO v_result;
      v_results := v_results || jsonb_build_array(
        COALESCE(v_result, jsonb_build_object('error', 'row_not_found', 'row_id', v_row_id))
      );

    ELSIF v_op_kind = 'delete' THEN
      DELETE FROM udt_dataset_rows
       WHERE id = v_row_id AND table_id = p_table_id
       RETURNING to_jsonb(udt_dataset_rows.*) INTO v_result;
      v_results := v_results || jsonb_build_array(
        COALESCE(v_result, jsonb_build_object('error', 'row_not_found', 'row_id', v_row_id))
      );

    ELSE
      RAISE EXCEPTION 'udt_bulk_write: unknown op kind %', v_op_kind;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('table_id', p_table_id, 'count', jsonb_array_length(v_results), 'results', v_results);
END;
$$;
