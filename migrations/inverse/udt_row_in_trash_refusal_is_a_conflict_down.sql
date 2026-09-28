-- chair-step: INVERSE of udt_row_in_trash_refusal_is_a_conflict.sql — the two writers raise the in-Trash sentence with SQLSTATE 55000 again (HTTP 500 through PostgREST) and workbench.udt_refuse_row_in_trash is dropped once nothing else calls it.
-- based-on: public.udt_upsert_row(uuid, uuid, jsonb) 386a199c4b29aa190edee6e329b53555d12a6c4c46f5f1f8a17869b9805bf54b
-- based-on: public.udt_upsert_cell(uuid, uuid, text, jsonb) 706fc824eb9fcf6ac24651ac53854cd607b1904116b399b79980d57219963589
--
-- The bodies below are the live pg_get_functiondef read before the up file, byte for byte. The writers
-- are restored FIRST so nothing calls the helper when it is dropped (inverses README rule 1).

-- ── restore public.udt_upsert_row
CREATE OR REPLACE FUNCTION public.udt_upsert_row(p_table_id uuid, p_row_id uuid DEFAULT NULL::uuid, p_data jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller  UUID := auth.uid();
  v_dataset workbench.udt_datasets%ROWTYPE;
  v_row     workbench.udt_dataset_rows%ROWTYPE;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'udt_upsert_row: not authenticated';
  END IF;
  IF p_data IS NULL THEN
    RAISE EXCEPTION 'udt_upsert_row: p_data is required';
  END IF;

  SELECT * INTO v_dataset FROM workbench.udt_datasets WHERE id = p_table_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'udt_upsert_row: table % not found', p_table_id;
  END IF;
  IF NOT workbench.udt_dataset_access(p_table_id, 'editor') THEN
    RAISE EXCEPTION 'udt_upsert_row: caller lacks editor permission on table %', p_table_id;
  END IF;

  IF p_row_id IS NULL THEN
    INSERT INTO workbench.udt_dataset_rows(table_id, data, user_id)
    VALUES (p_table_id, p_data, v_caller) RETURNING * INTO v_row;
  ELSE
    -- lane OLDER-DOORS-AFTER-SWITCH: an update MERGES p_data into the row (cells it does not name
    -- stay); it used to replace the whole row. A moved table refuses in the row guard.
    IF jsonb_typeof(p_data) <> 'object' THEN
      RAISE EXCEPTION 'udt_upsert_row: p_data must be an object' USING errcode = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM workbench.udt_dataset_rows
                WHERE id = p_row_id AND table_id = p_table_id AND deleted_at IS NOT NULL) THEN
      RAISE EXCEPTION 'This row is in Trash. Restore it from Trash to edit it.' USING errcode = '55000', hint = 'Open Trash, restore the row, then edit it.';
    END IF;
    UPDATE workbench.udt_dataset_rows SET data = COALESCE(data, '{}'::jsonb) || p_data, updated_at = now()
     WHERE id = p_row_id AND table_id = p_table_id AND deleted_at IS NULL RETURNING * INTO v_row;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'udt_upsert_row: row % not found in table %', p_row_id, p_table_id;
    END IF;
  END IF;
  RETURN to_jsonb(v_row);
END;
$function$;

-- ── restore public.udt_upsert_cell
CREATE OR REPLACE FUNCTION public.udt_upsert_cell(p_table_id uuid, p_row_id uuid, p_field_name text, p_value jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller UUID := auth.uid(); v_dataset workbench.udt_datasets%ROWTYPE; v_row workbench.udt_dataset_rows%ROWTYPE;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'udt_upsert_cell: not authenticated'; END IF;
  SELECT * INTO v_dataset FROM workbench.udt_datasets WHERE id = p_table_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'udt_upsert_cell: table % not found', p_table_id; END IF;
  IF NOT workbench.udt_dataset_access(p_table_id, 'editor') THEN
    RAISE EXCEPTION 'udt_upsert_cell: caller lacks editor permission';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM workbench.udt_dataset_fields WHERE table_id = p_table_id AND field_name = p_field_name AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'udt_upsert_cell: field % not in table %', p_field_name, p_table_id;
  END IF;
  IF EXISTS (SELECT 1 FROM workbench.udt_dataset_rows
              WHERE id = p_row_id AND table_id = p_table_id AND deleted_at IS NOT NULL) THEN
    RAISE EXCEPTION 'This row is in Trash. Restore it from Trash to edit it.' USING errcode = '55000', hint = 'Open Trash, restore the row, then edit it.';
  END IF;
  UPDATE workbench.udt_dataset_rows
     SET data = jsonb_set(
                  COALESCE(data, '{}'::jsonb),
                  ARRAY[p_field_name],
                  -- SQL NULL here would make jsonb_set return NULL for the
                  -- WHOLE document. Clearing a cell means this key becomes
                  -- JSON null; every other field is untouched.
                  COALESCE(p_value, 'null'::jsonb),
                  true
                ),
         updated_at = now()
   WHERE id = p_row_id AND table_id = p_table_id AND deleted_at IS NULL RETURNING * INTO v_row;
  IF NOT FOUND THEN RAISE EXCEPTION 'udt_upsert_cell: row % not found in table %', p_row_id, p_table_id; END IF;
  RETURN to_jsonb(v_row);
END;
$function$;

-- ── drop the helper, unless something adopted it after the up file (README rule 4)
DO $$
DECLARE v_callers text;
BEGIN
  SELECT string_agg(p.oid::regprocedure::text, ', ') INTO v_callers
    FROM pg_proc p
   WHERE p.prosrc ILIKE '%udt_refuse_row_in_trash%'
     AND p.oid <> 'workbench.udt_refuse_row_in_trash()'::regprocedure;
  IF v_callers IS NOT NULL THEN
    RAISE EXCEPTION 'workbench.udt_refuse_row_in_trash is still called by %; it was adopted after this file and is not this inverse''s to remove', v_callers;
  END IF;
END $$;
DROP FUNCTION workbench.udt_refuse_row_in_trash();
