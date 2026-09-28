-- based-on: public.udt_upsert_row(uuid, uuid, jsonb) 0898cf6049b7d3ee3bf3d754c09b201f95de322ddccc29ee94cf96143e2ba848
-- based-on: public.udt_upsert_cell(uuid, uuid, text, jsonb) 646342582fdb62626b02b630a057c922e64abf8012ae0bc87e146c06d4a0b902
--
-- udt_upsert_row / udt_upsert_cell raised the in-Trash refusal with SQLSTATE 55000, which
-- PostgREST has no mapping for, so a correct refusal of a stale edit reached the browser as
-- HTTP 500 — a server fault in the network panel for the system working as designed.
--
-- PostgREST 14.5 (read from this project's /rest/v1/ OpenAPI root, 2026-09-28) honours
-- RAISE SQLSTATE 'PGRST' with a JSON MESSAGE and a JSON DETAIL {status, headers}. The platform
-- already refuses that way: platform.refuse_not_found (404). workbench.udt_refuse_row_in_trash()
-- is its twin for this refusal: inside a PostgREST request it raises
--   409 Conflict, body {"code":"row_in_trash","message":"This row is in Trash. Restore it from Trash to edit it.","hint":…}
-- and anywhere else (psql, a server lane, a trigger) the same sentence with SQLSTATE 55000 and the
-- hint, exactly as before, so no non-HTTP caller sees a JSON string where a sentence was.
--
-- Changed: udt_upsert_row, udt_upsert_cell — the two writers that RAISE. Each body is the live
-- pg_get_functiondef of 2026-09-28 with its one RAISE line replaced by the call.
-- Not changed: update_data_row_in_user_table (answers {success:false, error:<sentence>} in its own
-- envelope, HTTP 200) and udt_bulk_write (a per-op {error:'row_in_trash'} slot, HTTP 200; the
-- rest of the batch continues). Neither raises, so neither was ever a 500.
-- The client recognises both shapes (features/data-tables/rowInTrash.ts).

-- ── workbench.udt_refuse_row_in_trash — THE in-Trash refusal (new; the twin of platform.refuse_not_found)
CREATE OR REPLACE FUNCTION workbench.udt_refuse_row_in_trash()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if coalesce(current_setting('request.method', true), '') <> '' then
    raise sqlstate 'PGRST' using
      message = json_build_object(
        'code', 'row_in_trash',
        'message', 'This row is in Trash. Restore it from Trash to edit it.',
        'details', null,
        'hint', 'Open Trash, restore the row, then edit it.')::text,
      detail = json_build_object('status', 409, 'headers', json_build_object())::text;
  end if;
  raise exception using
    errcode = '55000',
    message = 'This row is in Trash. Restore it from Trash to edit it.',
    hint = 'Open Trash, restore the row, then edit it.';
end;
$function$;

COMMENT ON FUNCTION workbench.udt_refuse_row_in_trash() IS
  'Raise the Data table "row is in Trash" refusal: HTTP 409 {code:row_in_trash} inside a PostgREST request, SQLSTATE 55000 with the same sentence elsewhere. Called by the row writers; never granted to a client.';

-- ── public.udt_upsert_row — the in-Trash refusal through workbench.udt_refuse_row_in_trash (409, not 500)
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
      PERFORM workbench.udt_refuse_row_in_trash();
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

-- ── public.udt_upsert_cell — the in-Trash refusal through workbench.udt_refuse_row_in_trash (409, not 500)
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
    PERFORM workbench.udt_refuse_row_in_trash();
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
