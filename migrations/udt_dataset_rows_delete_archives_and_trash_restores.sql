-- draft: udt-rows-soft-delete lane — Data table row deletes archive through deleted_at, every reader skips archived rows, and archived rows are listed and restored in /trash (needs rehearsal on the clone + an inverse before the draft line comes off)
-- chair-step: REVOKEs execute on the NEW invoker writer workbench.udt_archive_rows from public/anon (DD-197: a SECURITY INVOKER function that writes is never an anonymous door); nothing live loses a grant. Replaces 16 live bodies (based-on below) and sets user_artifact_kind on ONE existing registry row.
-- based-on: public.delete_data_row_from_user_table(uuid) 5a83e81dd7b2615b121fef2b0ae5879d138a0a243af67376a2f4d3d8bb78bd49
-- based-on: public.udt_bulk_write(uuid, jsonb) 9474e71d1bf1c548e413fe5b453109d56ea03d9ffd5e453967bd577ffb4bf1c5
-- based-on: public.udt_upsert_row(uuid, uuid, jsonb) d46c5f7365bd65793002b2969302ff4182bea96e02155d8c2aca68ac57dbbd23
-- based-on: public.udt_upsert_cell(uuid, uuid, text, jsonb) 5e3509af0071494f0365eb82ff9ce5664738daf468a4fea0d82a6b191694b076
-- based-on: public.update_data_row_in_user_table(uuid, jsonb) fd4fbbcaf69e381c693dc81337987085fcb7a1cc8d33aa397a008a13e4dcafdf
-- based-on: public._d31_impl_get_user_table_complete(uuid, text, text) e0aab26e0ca685099fe8b0f1dfffd2ae0e8d8980a8c41443ae8cd974bdeba8fe
-- based-on: public.get_full_table(jsonb) e0b2a564f2ef39cfcbb3cfe8efc4914f1aca285e9e7bcc2fa39c582bf3f2ec20
-- based-on: public.get_table_row(jsonb) b0975e06062f3da28f41146d01397b0c47498fe8edc8da1c403cd2c6fdb9c803
-- based-on: public.get_table_cell(jsonb) f0089225ecadfd518dd4eb54f4c4938780c05020f49077a361da33f2258ed781
-- based-on: public.list_table_rows(jsonb, integer, integer, text, text) 901fdfaa131d806b0e52581129ad05daaf69531e8dfd0f4760bf18b305176b69
-- based-on: public.get_user_table_data_paginated(uuid, integer, integer, text, text, text) 9e6fffcc5aeb22b4808fc149531c8f6ee31dc97716eb0fc16d6a14a91928c55a
-- based-on: public.get_user_table_data_paginated_v2(uuid, integer, integer, text, text, text) 62f94f7b879d68143b37d3c2cd1aa6154487111ca05061f7317928eba52e02d6
-- based-on: public.export_user_table_as_csv(uuid, text, text) 73e3300d7002bd80cb785492adb1b717d537a5827042f437621ddf84bc48ac54
-- based-on: public.export_user_table_as_csv(uuid) adfded6b8be12bd09c099f343f8da006da6cbaef9c9a152640e9806a8270f6ee
-- based-on: public.udt_column_facets(uuid, text, integer, text) b2af38f3423ac55304dd9fba5586ab439b8955b42683606e0cfc0c959de4cccc
-- based-on: public.udt_table_profile(uuid, integer) c3f81849ee9598959b475a82cec841844a5502e3a9f0b07f7a25cc2e28ce9876
-- based-on: public.get_user_tables() 22bb0a044c611f75361c0826bea2fc6f8131a4ad911beab41fa040f190baabe7
-- based-on: public.udt_list_example_tables() 6b7dfb5ef6685b5950bf4b38cacf15c36276d126d20ffd6baffdfb27b6d11848
-- based-on: custom.table_list_everywhere(uuid) 528f7aa5248a1dbb458ef55423313321e11f203451d850e2536874eb4f549a82
-- based-on: public._trash_kind_rows(uuid, uuid, uuid, text[], integer, integer) 1d84fc27f5f7f7c4a335520b2d3ec8db692cbd4a1d349fc8403ef8c1012b216b
--
-- THE LAW (Arman, via the chair, 2026-09-26): every delete archives through the table's
-- soft-delete column; readers skip archived rows; archived rows are restorable from /trash.
--
-- workbench.udt_dataset_rows has had deleted_at for a long time, but every door deleted for good:
-- the grid's single-row delete (public.delete_data_row_from_user_table), the grid's bulk delete op
-- (public.udt_bulk_write op 'delete') and the agent tool dataset:delete_row. The agent tool now
-- archives from Python (aidream matrx_ai/tools/implementations/datasets_tools.py, same day), and
-- the Python readers already skip archived rows (aidream f636452686). This file closes the DB half.
--
-- 1. ONE archive door: workbench.udt_archive_rows(table_id, row_ids) — SECURITY INVOKER, so the
--    caller's own row-level access still decides (the grid's single-row delete is an invoker
--    function; udt_bulk_write is a definer that checks editor itself). It stamps deleted_at and
--    updated_by (platform._stamp_actor stamps it too; this keeps the service lane honest) and
--    returns the ids it archived. Already-archived rows are left alone.
-- 2. Both grid delete doors route through it. Their envelopes are unchanged; the single-row
--    message now says "Row moved to Trash".
-- 3. Every DB reader of the rows skips archived ones: census of pg_proc.prosrc for
--    udt_dataset_rows on 2026-09-26. Each body below is the LIVE pg_get_functiondef read that day
--    plus only the deleted_at filter (declared with -- based-on so a newer body refuses this file).
--    Not changed, on purpose: the whole-table rewrites (udt_change_field_type, udt_delete_field,
--    add_column_to_user_table's backfill — an archived row keeps its shape so a restore is whole)
--    and the platform cutover copiers, which already read deleted_at themselves.
-- 3b. Every per-row WRITER refuses an archived row, in its own error shape, with one sentence:
--    "This row is in Trash. Restore it from Trash to edit it."
--      udt_upsert_row / udt_upsert_cell  RAISE, errcode 55000 (object not in prerequisite state)
--      update_data_row_in_user_table     its {success:false, error} envelope
--      udt_bulk_write update|merge|cell  a per-op {error:'row_in_trash', row_id, message}; the
--                                        rest of the batch continues, as row_not_found does
--    Each UPDATE also carries `deleted_at IS NULL`, so a row archived between the check and the
--    write answers not-found rather than being edited.
-- 4. /trash: THE trash registry is platform.entity_types.user_artifact_kind (public._trash_kind_rows
--    / _trash_kind_counts iterate it; public.entity_undelete restores through iam.has_access
--    'editor', which walks a row to its dataset). Registering the udt_dataset_rows token as
--    artifact kind 'dataset_row' lists archived rows in personal Trash (owner = created_by, which
--    platform.component_created_by_from_parent sets to the table's owner) and in Organization
--    Trash (organization_id). _trash_kind_rows gets ONE title rule for the kind: the row's words
--    "(in <table>)" — a row has no title column.
--
-- Owner: every replaced body here was last written by matrx-frontend migrations except
-- _d31_impl_get_user_table_complete (aidream 0457); none is on aidream's foreign-ownership list.
-- The file lives here because the grid and /trash are this repo's.

-- ── workbench.udt_archive_rows — THE archive door for Data table rows (new)
CREATE OR REPLACE FUNCTION workbench.udt_archive_rows(p_table_id uuid, p_row_ids uuid[])
 RETURNS SETOF uuid
 LANGUAGE sql
 SET search_path TO 'pg_catalog'
AS $function$
  -- p_table_id NULL = the rows wherever they sit (the single-row door knows only the row id).
  UPDATE workbench.udt_dataset_rows r
     SET deleted_at = now(),
         updated_by = coalesce((SELECT auth.uid()), r.updated_by)
   WHERE r.id = ANY (p_row_ids)
     AND (p_table_id IS NULL OR r.table_id = p_table_id)
     AND r.deleted_at IS NULL
  RETURNING r.id;
$function$;

REVOKE ALL ON FUNCTION workbench.udt_archive_rows(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION workbench.udt_archive_rows(uuid, uuid[]) TO authenticated, service_role;
COMMENT ON FUNCTION workbench.udt_archive_rows(uuid, uuid[]) IS
  'THE archive door for workbench.udt_dataset_rows: stamps deleted_at (restorable from /trash via entity_undelete). Invoker: the caller''s row access decides.';

-- ── public.delete_data_row_from_user_table — the grid's single-row delete: archives instead of DELETE
CREATE OR REPLACE FUNCTION public.delete_data_row_from_user_table(p_row_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_result JSONB;
    v_deleted BOOLEAN;
BEGIN
    -- Soft-delete law: a delete archives through deleted_at (restorable from /trash).
    SELECT true INTO v_deleted
    FROM workbench.udt_archive_rows(NULL, ARRAY[p_row_id])
    LIMIT 1;

    IF v_deleted THEN
        v_result := jsonb_build_object(
            'success', true,
            'row_id', p_row_id,
            'message', 'Row moved to Trash'
        );
    ELSE
        v_result := jsonb_build_object('success', false, 'error', 'Row not found or delete failed');
    END IF;

    RETURN v_result;
END;
$function$;

-- ── public.udt_bulk_write — the grid's bulk writer: delete archives; update/merge/cell refuse an archived row
CREATE OR REPLACE FUNCTION public.udt_bulk_write(p_table_id uuid, p_operations jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller UUID := auth.uid(); v_dataset workbench.udt_datasets%ROWTYPE;
  v_op JSONB; v_op_kind TEXT; v_row_id UUID;
  v_result JSONB; v_results JSONB := '[]'::jsonb;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'udt_bulk_write: not authenticated'; END IF;
  SELECT * INTO v_dataset FROM workbench.udt_datasets WHERE id = p_table_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'udt_bulk_write: table % not found', p_table_id; END IF;
  IF NOT workbench.udt_dataset_access(p_table_id, 'editor') THEN
    RAISE EXCEPTION 'udt_bulk_write: caller lacks editor permission';
  END IF;
  IF jsonb_typeof(p_operations) <> 'array' THEN
    RAISE EXCEPTION 'udt_bulk_write: p_operations must be a JSON array';
  END IF;

  FOR v_op IN SELECT * FROM jsonb_array_elements(p_operations) LOOP
    v_op_kind := v_op ->> 'op';
    v_row_id  := NULLIF(v_op ->> 'row_id', '')::uuid;

    IF v_op_kind = 'insert' THEN
      -- An op with no "data" is an empty row, never a NULL row body.
      INSERT INTO workbench.udt_dataset_rows(table_id, data, user_id)
      VALUES (p_table_id, COALESCE(v_op -> 'data', '{}'::jsonb), v_caller)
      RETURNING to_jsonb(workbench.udt_dataset_rows.*) INTO v_result;
      v_results := v_results || jsonb_build_array(v_result);

    ELSIF v_op_kind = 'update' THEN
      -- Refuse rather than silently blanking the row: "update with no data" is
      -- a caller mistake, and quietly emptying every field is the worst
      -- possible reading of it.
      IF v_op -> 'data' IS NULL OR jsonb_typeof(v_op -> 'data') <> 'object' THEN
        RAISE EXCEPTION 'udt_bulk_write: update op for row % needs a "data" object', v_row_id;
      END IF;
      IF EXISTS (SELECT 1 FROM workbench.udt_dataset_rows
                  WHERE id = v_row_id AND table_id = p_table_id AND deleted_at IS NOT NULL) THEN
        -- An archived row is not edited: it says so, and the rest of the batch continues.
        v_results := v_results || jsonb_build_array(jsonb_build_object(
          'error', 'row_in_trash', 'row_id', v_row_id, 'message', 'This row is in Trash. Restore it from Trash to edit it.'));
        CONTINUE;
      END IF;
      UPDATE workbench.udt_dataset_rows
         SET data = v_op -> 'data', updated_at = now()
       WHERE id = v_row_id AND table_id = p_table_id AND deleted_at IS NULL
       RETURNING to_jsonb(workbench.udt_dataset_rows.*) INTO v_result;
      v_results := v_results || jsonb_build_array(
        COALESCE(v_result, jsonb_build_object('error', 'row_not_found', 'row_id', v_row_id))
      );

    ELSIF v_op_kind = 'merge' THEN
      IF EXISTS (SELECT 1 FROM workbench.udt_dataset_rows
                  WHERE id = v_row_id AND table_id = p_table_id AND deleted_at IS NOT NULL) THEN
        -- An archived row is not edited: it says so, and the rest of the batch continues.
        v_results := v_results || jsonb_build_array(jsonb_build_object(
          'error', 'row_in_trash', 'row_id', v_row_id, 'message', 'This row is in Trash. Restore it from Trash to edit it.'));
        CONTINUE;
      END IF;
      UPDATE workbench.udt_dataset_rows
         SET data = COALESCE(data, '{}'::jsonb) || COALESCE(v_op -> 'data', '{}'::jsonb),
             updated_at = now()
       WHERE id = v_row_id AND table_id = p_table_id AND deleted_at IS NULL
       RETURNING to_jsonb(workbench.udt_dataset_rows.*) INTO v_result;
      v_results := v_results || jsonb_build_array(
        COALESCE(v_result, jsonb_build_object('error', 'row_not_found', 'row_id', v_row_id))
      );

    ELSIF v_op_kind = 'cell' THEN
      IF NOT EXISTS (
        SELECT 1 FROM workbench.udt_dataset_fields
         WHERE table_id = p_table_id AND field_name = v_op ->> 'field_name'
      ) THEN
        RAISE EXCEPTION 'udt_bulk_write: cell op references undeclared field % on table %',
          v_op ->> 'field_name', p_table_id;
      END IF;
      IF EXISTS (SELECT 1 FROM workbench.udt_dataset_rows
                  WHERE id = v_row_id AND table_id = p_table_id AND deleted_at IS NOT NULL) THEN
        -- An archived row is not edited: it says so, and the rest of the batch continues.
        v_results := v_results || jsonb_build_array(jsonb_build_object(
          'error', 'row_in_trash', 'row_id', v_row_id, 'message', 'This row is in Trash. Restore it from Trash to edit it.'));
        CONTINUE;
      END IF;
      UPDATE workbench.udt_dataset_rows
         SET data = jsonb_set(
                      COALESCE(data, '{}'::jsonb),
                      ARRAY[v_op ->> 'field_name'],
                      -- SQL NULL would null the WHOLE document, not the key.
                      COALESCE(v_op -> 'value', 'null'::jsonb),
                      true
                    ),
             updated_at = now()
       WHERE id = v_row_id AND table_id = p_table_id AND deleted_at IS NULL
       RETURNING to_jsonb(workbench.udt_dataset_rows.*) INTO v_result;
      v_results := v_results || jsonb_build_array(
        COALESCE(v_result, jsonb_build_object('error', 'row_not_found', 'row_id', v_row_id))
      );

    ELSIF v_op_kind = 'delete' THEN
      -- Soft-delete law: archive through deleted_at (restorable from /trash). An already
      -- archived row answers row_not_found, exactly as a missing one did.
      v_result := NULL;
      PERFORM 1 FROM workbench.udt_archive_rows(p_table_id, ARRAY[v_row_id]);
      IF FOUND THEN
        SELECT to_jsonb(r.*) INTO v_result FROM workbench.udt_dataset_rows r WHERE r.id = v_row_id;
      END IF;
      v_results := v_results || jsonb_build_array(
        COALESCE(v_result, jsonb_build_object('error', 'row_not_found', 'row_id', v_row_id))
      );

    ELSE
      RAISE EXCEPTION 'udt_bulk_write: unknown op kind %', v_op_kind;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('table_id', p_table_id, 'count', jsonb_array_length(v_results), 'results', v_results);
END;
$function$;

-- ── public.udt_upsert_row — writer: refuses to edit an archived row
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

-- ── public.udt_upsert_cell — writer: refuses to edit an archived row
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
  IF NOT EXISTS (SELECT 1 FROM workbench.udt_dataset_fields WHERE table_id = p_table_id AND field_name = p_field_name) THEN
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

-- ── public.update_data_row_in_user_table — writer: refuses to edit an archived row (its own envelope)
CREATE OR REPLACE FUNCTION public.update_data_row_in_user_table(p_row_id uuid, p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_result JSONB;
    v_updated BOOLEAN;
    v_data JSONB;
BEGIN
    -- lane OLDER-DOORS-AFTER-SWITCH: the patch MERGES into the row (the cells it names change,
    -- every other cell stays). It used to REPLACE the whole row, so a one-cell patch wiped the
    -- rest (VERIFIER-26, 2026-09-26). A table that moved with its organization's switch refuses
    -- the write in the row guard (workbench._moved_older_table_takes_no_writes) — never a
    -- success line over a table nothing reads.
    IF p_data IS NULL OR jsonb_typeof(p_data) <> 'object' THEN
        RAISE EXCEPTION 'update_data_row_in_user_table: p_data must be an object of the cells to change'
          USING errcode = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM workbench.udt_dataset_rows WHERE id = p_row_id AND deleted_at IS NOT NULL) THEN
        RETURN jsonb_build_object('success', false, 'row_id', p_row_id, 'error', 'This row is in Trash. Restore it from Trash to edit it.');
    END IF;
    UPDATE workbench.udt_dataset_rows
    SET data = COALESCE(data, '{}'::jsonb) || p_data, updated_at = NOW()
    WHERE id = p_row_id
      AND deleted_at IS NULL
    RETURNING true, data INTO v_updated, v_data;

    IF v_updated THEN
        v_result := jsonb_build_object(
            'success', true,
            'row_id', p_row_id,
            'data', v_data,
            'updated_at', NOW()
        );
    ELSE
        v_result := jsonb_build_object('success', false, 'error', 'Row not found or update failed');
    END IF;

    RETURN v_result;
END;
$function$;

-- ── public._d31_impl_get_user_table_complete — reader: skips archived rows
CREATE OR REPLACE FUNCTION public._d31_impl_get_user_table_complete(p_table_id uuid, p_sort_field text DEFAULT NULL::text, p_sort_direction text DEFAULT 'asc'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
    v_table_info jsonb;
    v_fields jsonb;
    v_data jsonb;
    v_valid_sort_field text;
    v_query text;
begin
    select jsonb_build_object(
        'id', id, 'table_name', table_name, 'description', description, 'version', version,
        'user_id', user_id, 'is_public', is_public, 'row_ordering_config', row_ordering_config,
        'created_at', created_at, 'updated_at', updated_at
    ) into v_table_info
    from workbench.udt_datasets
    where id = p_table_id
      and deleted_at is null;

    if v_table_info is null then
        return jsonb_build_object('success', false, 'error', 'Table not found or access denied');
    end if;

    select jsonb_agg(jsonb_build_object(
        'id', id, 'field_name', field_name, 'display_name', display_name,
        'data_type', data_type, 'field_order', field_order, 'is_required', is_required,
        'is_public', is_public,
        'default_value', default_value, 'validation_rules', validation_rules,
        'metadata', coalesce(metadata, '{}'::jsonb)
    ) order by field_order)
    into v_fields from workbench.udt_dataset_fields where table_id = p_table_id;

    if p_sort_field is not null then
        select field_name into v_valid_sort_field
        from workbench.udt_dataset_fields
        where table_id = p_table_id
          and (field_name = p_sort_field or display_name = p_sort_field)
        limit 1;
    end if;

    v_query := 'SELECT jsonb_agg(jsonb_build_object(''id'', id, ''data'', data, ''created_at'', created_at, ''updated_at'', updated_at)';
    if v_valid_sort_field is not null then
        v_query := v_query || ' ORDER BY (data->>''' || v_valid_sort_field || ''')';
        if p_sort_direction = 'desc' then
            v_query := v_query || ' DESC';
        else
            v_query := v_query || ' ASC';
        end if;
    else
        v_query := v_query || ' ORDER BY created_at';
    end if;
    v_query := v_query || ') FROM workbench.udt_dataset_rows WHERE table_id = $1 AND deleted_at IS NULL';

    execute v_query using p_table_id into v_data;

    return jsonb_build_object(
        'success', true,
        'table', v_table_info,
        'fields', coalesce(v_fields, '[]'::jsonb),
        'data', coalesce(v_data, '[]'::jsonb),
        'row_count', jsonb_array_length(coalesce(v_data, '[]'::jsonb)),
        'field_count', jsonb_array_length(coalesce(v_fields, '[]'::jsonb))
    );
end;
$function$;

-- ── public.get_full_table — reader: row_count skips archived rows
CREATE OR REPLACE FUNCTION public.get_full_table(ref jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
  v_table_id uuid;
  v_table_name text;
  j jsonb;
BEGIN
  v_table_id := (ref->>'table_id')::uuid;
  v_table_name := ref->>'table_name';

  IF NOT EXISTS (
    SELECT 1 FROM workbench.udt_datasets t
    WHERE t.id = v_table_id
      AND (v_table_name IS NULL OR t.table_name = v_table_name)
  ) THEN
    perform platform.refuse_not_found(format('dataset %s is not available to this account — it may not exist, the table_name may not match, or your access may not reach it', v_table_id));
  END IF;

  j := jsonb_build_object(
    -- Full row. row_ordering_config in particular is load-bearing: it carries
    -- default_sort, which the dataset viewer applies on first load.
    'table',
    (
      SELECT to_jsonb(t)
      FROM workbench.udt_datasets t
      WHERE t.id = v_table_id
    ),
    -- Full field rows, in field_order. validation_rules and default_value are
    -- needed by export and by any column-editing surface.
    'columns',
    (
      SELECT COALESCE(
               jsonb_agg(to_jsonb(tf) ORDER BY tf.field_order, tf.created_at),
               '[]'::jsonb)
      FROM workbench.udt_dataset_fields tf
      WHERE tf.table_id = v_table_id
    ),
    -- COUNT(*), not the length of a materialized row array. This is the whole
    -- reason to call this instead of get_user_table_complete.
    'row_count',
    (
      SELECT COUNT(*)::int
      FROM workbench.udt_dataset_rows d
      WHERE d.table_id = v_table_id
        AND d.deleted_at IS NULL
    ),
    -- lane OLDER-DOORS-AFTER-SWITCH: a table that moved with its organization's Data tables
    -- switch answers with the same rows, marked moved (null for every live table).
    'moved_to',
    workbench.older_table_moved_to(v_table_id)
  );

  RETURN j;
END;
$function$;

-- ── public.get_table_row — reader: an archived row is not found
CREATE OR REPLACE FUNCTION public.get_table_row(ref jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
  v_table_id uuid := (ref->>'table_id')::uuid;
  v_table_name text := ref->>'table_name';
  v_row_id uuid := (ref->>'row_id')::uuid;
  j jsonb;
  v_moved jsonb;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM workbench.udt_datasets t
    WHERE t.id = v_table_id
      AND (v_table_name IS NULL OR t.table_name = v_table_name)
  ) THEN
    perform platform.refuse_not_found(format('dataset %s is not available to this account — it may not exist, the table_name may not match, or your access may not reach it', v_table_id));
  END IF;

  j := (
    SELECT to_jsonb(d)
    FROM workbench.udt_dataset_rows d
    WHERE d.table_id = v_table_id
      AND d.id = v_row_id
      AND d.deleted_at IS NULL
  );

  IF j IS NULL THEN
    RAISE EXCEPTION 'Row not found';
  END IF;

  -- lane LISTS-AFTER-SWITCH: marked when the table moved with its organization's switch.
  v_moved := workbench.older_table_moved_to(v_table_id);
  IF v_moved IS NOT NULL THEN
    j := j || jsonb_build_object('moved_to', v_moved);
  END IF;

  RETURN j;
END;
$function$;

-- ── public.get_table_cell — reader: an archived row's cell is not read
CREATE OR REPLACE FUNCTION public.get_table_cell(ref jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
  v_table_id uuid := (ref->>'table_id')::uuid;
  v_table_name text := ref->>'table_name';
  v_row_id uuid := (ref->>'row_id')::uuid;
  v_field_name text := ref->>'column_name';
  v_display_name text := ref->>'column_display_name';
  v_resolved_field text;
  v_value jsonb;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM workbench.udt_datasets t
    WHERE t.id = v_table_id
      AND (v_table_name IS NULL OR t.table_name = v_table_name)
  ) THEN
    perform platform.refuse_not_found(format('dataset %s is not available to this account — it may not exist, the table_name may not match, or your access may not reach it', v_table_id));
  END IF;

  IF v_field_name IS NULL THEN
    SELECT tf.field_name INTO v_resolved_field
    FROM workbench.udt_dataset_fields tf
    WHERE tf.table_id = v_table_id
      AND tf.display_name = v_display_name
    LIMIT 1;
  ELSE
    v_resolved_field := v_field_name;
  END IF;

  IF v_resolved_field IS NULL THEN
    RAISE EXCEPTION 'Column not found';
  END IF;

  SELECT d.data -> v_resolved_field
  INTO v_value
  FROM workbench.udt_dataset_rows d
  WHERE d.table_id = v_table_id
    AND d.id = v_row_id
    AND d.deleted_at IS NULL;

  -- lane LISTS-AFTER-SWITCH: moved_to (null for a live table).
  IF v_value IS NULL THEN
    RETURN jsonb_build_object('value', null, 'field', v_resolved_field, 'moved_to', workbench.older_table_moved_to(v_table_id));
  END IF;

  RETURN jsonb_build_object('value', v_value, 'field', v_resolved_field, 'moved_to', workbench.older_table_moved_to(v_table_id));
END;
$function$;

-- ── public.list_table_rows — reader: rows and total skip archived rows
CREATE OR REPLACE FUNCTION public.list_table_rows(ref jsonb, limit_rows integer DEFAULT 100, offset_rows integer DEFAULT 0, order_by text DEFAULT 'created_at'::text, order_dir text DEFAULT 'desc'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
  v_table_id uuid := (ref->>'table_id')::uuid;
  v_table_name text := ref->>'table_name';
  j jsonb;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM workbench.udt_datasets t
    WHERE t.id = v_table_id
      AND (v_table_name IS NULL OR t.table_name = v_table_name)
  ) THEN
    perform platform.refuse_not_found(format('dataset %s is not available to this account — it may not exist, the table_name may not match, or your access may not reach it', v_table_id));
  END IF;

  IF order_by NOT IN ('created_at','updated_at','id') THEN
    order_by := 'created_at';
  END IF;
  IF lower(order_dir) NOT IN ('asc','desc') THEN
    order_dir := 'desc';
  END IF;

  j := (
    SELECT jsonb_build_object(
      'rows', jsonb_agg(to_jsonb(d)),
      'total', (SELECT COUNT(*)::int FROM workbench.udt_dataset_rows dd WHERE dd.table_id = v_table_id AND dd.deleted_at IS NULL)
    )
    FROM (
      SELECT d.*
      FROM workbench.udt_dataset_rows d
      WHERE d.table_id = v_table_id
        AND d.deleted_at IS NULL
      ORDER BY
        CASE WHEN order_by = 'created_at' AND lower(order_dir) = 'asc' THEN d.created_at END ASC,
        CASE WHEN order_by = 'created_at' AND lower(order_dir) = 'desc' THEN d.created_at END DESC,
        CASE WHEN order_by = 'updated_at' AND lower(order_dir) = 'asc' THEN d.updated_at END ASC,
        CASE WHEN order_by = 'updated_at' AND lower(order_dir) = 'desc' THEN d.updated_at END DESC,
        CASE WHEN order_by = 'id' AND lower(order_dir) = 'asc' THEN d.id END ASC,
        CASE WHEN order_by = 'id' AND lower(order_dir) = 'desc' THEN d.id END DESC,
        -- `d.id` is the unique tiebreaker that makes this a TOTAL order. Do not remove it.
        d.id DESC
      LIMIT limit_rows OFFSET offset_rows
    ) d
  );

  -- lane LISTS-AFTER-SWITCH: moved_to (null for a live table).
  RETURN COALESCE(j, jsonb_build_object('rows','[]'::jsonb,'total',0))
         || jsonb_build_object('moved_to', workbench.older_table_moved_to(v_table_id));
END;
$function$;

-- ── public.get_user_table_data_paginated — reader: rows and count skip archived rows
CREATE OR REPLACE FUNCTION public.get_user_table_data_paginated(p_table_id uuid, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0, p_sort_field text DEFAULT NULL::text, p_sort_direction text DEFAULT 'asc'::text, p_search_term text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_result JSONB;
    v_data JSONB;
    v_total_count INT;
    v_field_name TEXT;
    v_query TEXT;
BEGIN
    IF p_sort_field IS NOT NULL THEN
        SELECT field_name INTO v_field_name
        FROM workbench.udt_dataset_fields
        WHERE table_id = p_table_id
          AND (field_name = p_sort_field OR display_name = p_sort_field)
        LIMIT 1;
    END IF;

    IF p_search_term IS NOT NULL THEN
        SELECT COUNT(*) INTO v_total_count
        FROM workbench.udt_dataset_rows
        WHERE table_id = p_table_id
          AND deleted_at IS NULL
          AND (data::text ILIKE '%' || p_search_term || '%');
    ELSE
        SELECT COUNT(*) INTO v_total_count
        FROM workbench.udt_dataset_rows
        WHERE table_id = p_table_id
          AND deleted_at IS NULL;
    END IF;

    v_query := 'SELECT id, data, created_at, updated_at FROM workbench.udt_dataset_rows WHERE table_id = $1 AND deleted_at IS NULL';

    IF p_search_term IS NOT NULL THEN
        v_query := v_query || ' AND (data::text ILIKE ''%'' || $4 || ''%'')';
    END IF;

    IF v_field_name IS NOT NULL THEN
        v_query := v_query || format(' ORDER BY (data->>%L)', v_field_name);
        IF p_sort_direction = 'desc' THEN
            v_query := v_query || ' DESC';
        ELSE
            v_query := v_query || ' ASC';
        END IF;
        -- `id` is the unique tiebreaker that makes this a TOTAL order. Do not remove it.
        v_query := v_query || ', id';
    ELSE
        -- `id` is the unique tiebreaker that makes this a TOTAL order. Do not remove it.
        v_query := v_query || ' ORDER BY created_at DESC, id';
    END IF;

    v_query := v_query || ' LIMIT $2 OFFSET $3';

    EXECUTE 'SELECT jsonb_agg(t) FROM (' || v_query || ') t'
    USING p_table_id, p_limit, p_offset, p_search_term
    INTO v_data;

    v_result := jsonb_build_object(
        'success', true,
        'data', COALESCE(v_data, '[]'::jsonb),
        'pagination', jsonb_build_object(
            'total_count', v_total_count,
            'page_count', CEIL(v_total_count::float / p_limit),
            'current_page', (p_offset / p_limit) + 1,
            'limit', p_limit,
            'offset', p_offset
        ),
        -- lane OLDER-DOORS-AFTER-SWITCH: the same rows, marked moved when the table moved with
        -- its organization's Data tables switch (null for every live table).
        'moved_to', workbench.older_table_moved_to(p_table_id)
    );

    RETURN v_result;
END;
$function$;

-- ── public.get_user_table_data_paginated_v2 — reader: rows and count skip archived rows
CREATE OR REPLACE FUNCTION public.get_user_table_data_paginated_v2(p_table_id uuid, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0, p_sort_field text DEFAULT NULL::text, p_sort_direction text DEFAULT 'asc'::text, p_search_term text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_result JSONB;
    v_data JSONB;
    v_total_count INT;
    v_field_name TEXT;
    v_field_data_type TEXT;
    v_query TEXT;
    v_sort_expr TEXT;
BEGIN
    IF p_sort_field IS NOT NULL THEN
        SELECT tf.field_name, tf.data_type::text
        INTO v_field_name, v_field_data_type
        FROM workbench.udt_dataset_fields tf
        WHERE tf.table_id = p_table_id
          AND (tf.field_name = p_sort_field OR tf.display_name = p_sort_field)
        LIMIT 1;
    END IF;

    IF p_search_term IS NOT NULL THEN
        SELECT COUNT(*) INTO v_total_count
        FROM workbench.udt_dataset_rows
        WHERE table_id = p_table_id
          AND deleted_at IS NULL
          AND data::text ILIKE '%' || p_search_term || '%';
    ELSE
        SELECT COUNT(*) INTO v_total_count
        FROM workbench.udt_dataset_rows
        WHERE table_id = p_table_id
          AND deleted_at IS NULL;
    END IF;

    v_query := 'SELECT id, data, created_at, updated_at FROM workbench.udt_dataset_rows WHERE table_id = $1 AND deleted_at IS NULL';

    IF p_search_term IS NOT NULL THEN
        v_query := v_query || ' AND (data::text ILIKE ''%' || replace(p_search_term, '''', '''''') || '%'')';
    END IF;

    IF v_field_name IS NOT NULL THEN
        v_field_name := replace(v_field_name, '''', '''''');

        IF v_field_data_type IN ('integer', 'number') THEN
            v_sort_expr := format(
                'CASE WHEN data->>''%s'' ~ ''^-?[0-9]+\.?[0-9]*$'' THEN (data->>''%s'')::numeric ELSE NULL END',
                v_field_name, v_field_name
            );
        ELSIF v_field_data_type IN ('date', 'datetime') THEN
            v_sort_expr := format(
                'CASE WHEN data->>''%s'' IS NOT NULL AND data->>''%s'' <> '''' THEN (data->>''%s'')::timestamptz ELSE NULL END',
                v_field_name, v_field_name, v_field_name
            );
        ELSE
            v_sort_expr := format('LOWER(data->>''%s'')', v_field_name);
        END IF;

        v_query := v_query || ' ORDER BY ' || v_sort_expr;

        IF p_sort_direction = 'desc' THEN
            v_query := v_query || ' DESC NULLS LAST';
        ELSE
            v_query := v_query || ' ASC NULLS LAST';
        END IF;
        -- `id` is the unique tiebreaker that makes this a TOTAL order. Do not remove it.
        v_query := v_query || ', id';
    ELSE
        -- `id` is the unique tiebreaker that makes this a TOTAL order. Do not remove it.
        v_query := v_query || ' ORDER BY created_at DESC, id';
    END IF;

    v_query := v_query || ' LIMIT $2 OFFSET $3';

    EXECUTE 'SELECT jsonb_agg(t) FROM (' || v_query || ') t'
    USING p_table_id, p_limit, p_offset
    INTO v_data;

    v_result := jsonb_build_object(
        'success', true,
        'data', COALESCE(v_data, '[]'::jsonb),
        'pagination', jsonb_build_object(
            'total_count', v_total_count,
            'page_count', CEIL(v_total_count::float / p_limit),
            'current_page', (p_offset / p_limit) + 1,
            'limit', p_limit,
            'offset', p_offset
        ),
        -- lane OLDER-DOORS-AFTER-SWITCH: the same rows, marked moved when the table moved with
        -- its organization's Data tables switch (null for every live table).
        'moved_to', workbench.older_table_moved_to(p_table_id)
    );

    RETURN v_result;
END;
$function$;

-- ── public.export_user_table_as_csv — reader: the CSV export skips archived rows
CREATE OR REPLACE FUNCTION public.export_user_table_as_csv(p_table_id uuid, p_sort_field text DEFAULT NULL::text, p_sort_direction text DEFAULT 'asc'::text)
 RETURNS text
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_csv TEXT := '';
    v_header TEXT := '';
    v_fields JSONB;
    v_field JSONB;
    v_field_name TEXT;
    v_valid_sort_field TEXT;
    v_row RECORD;
    v_value TEXT;
    v_query TEXT;
    v_moved JSONB := workbench.older_table_moved_to(p_table_id);
BEGIN
    SELECT jsonb_agg(ROW_TO_JSON(f)::jsonb ORDER BY field_order)
    INTO v_fields
    FROM workbench.udt_dataset_fields f
    WHERE table_id = p_table_id;

    IF v_fields IS NULL OR jsonb_array_length(v_fields) = 0 THEN
        RETURN '';
    END IF;

    IF p_sort_field IS NOT NULL THEN
        SELECT field_name INTO v_valid_sort_field
        FROM workbench.udt_dataset_fields
        WHERE table_id = p_table_id
        AND (field_name = p_sort_field OR display_name = p_sort_field)
        LIMIT 1;
    END IF;

    FOR v_index IN 0..jsonb_array_length(v_fields)-1 LOOP
        v_field := v_fields->v_index;
        IF v_header != '' THEN
            v_header := v_header || ',';
        END IF;
        v_header := v_header || '"' || REPLACE(v_field->>'display_name', '"', '""') || '"';
    END LOOP;

    v_csv := v_header || E'\n';

    v_query := 'SELECT id, data FROM workbench.udt_dataset_rows WHERE table_id = $1 AND deleted_at IS NULL';

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

    FOR v_row IN EXECUTE v_query USING p_table_id
    LOOP
        v_header := '';
        FOR v_index IN 0..jsonb_array_length(v_fields)-1 LOOP
            v_field := v_fields->v_index;
            v_field_name := v_field->>'field_name';
            IF v_header != '' THEN
                v_header := v_header || ',';
            END IF;
            v_value := v_row.data->>v_field_name;
            IF v_value IS NOT NULL THEN
                v_header := v_header || '"' || REPLACE(v_value, '"', '""') || '"';
            ELSE
                v_header := v_header || '""';
            END IF;
        END LOOP;
        v_csv := v_csv || v_header || E'\n';
    END LOOP;

    -- lane LISTS-AFTER-SWITCH: a moved table's export says so on its first line.
    IF v_moved IS NOT NULL THEN
        v_csv := '"' || REPLACE(v_moved->>'says', '"', '""') || '"' || E'\n' || v_csv;
    END IF;

    RETURN v_csv;
END;
$function$;

-- ── public.export_user_table_as_csv — reader: the CSV export skips archived rows
CREATE OR REPLACE FUNCTION public.export_user_table_as_csv(p_table_id uuid)
 RETURNS text
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_csv TEXT := '';
    v_header TEXT := '';
    v_fields JSONB;
    v_field JSONB;
    v_field_name TEXT;
    v_row RECORD;
    v_value TEXT;
    v_moved JSONB := workbench.older_table_moved_to(p_table_id);
BEGIN
    SELECT jsonb_agg(ROW_TO_JSON(f)::jsonb ORDER BY field_order)
    INTO v_fields
    FROM workbench.udt_dataset_fields f
    WHERE table_id = p_table_id;

    IF v_fields IS NULL OR jsonb_array_length(v_fields) = 0 THEN
        RETURN '';
    END IF;

    FOR v_index IN 0..jsonb_array_length(v_fields)-1 LOOP
        v_field := v_fields->v_index;

        IF v_header != '' THEN
            v_header := v_header || ',';
        END IF;

        v_header := v_header || '"' || REPLACE(v_field->>'display_name', '"', '""') || '"';
    END LOOP;

    v_csv := v_header || E'\n';

    FOR v_row IN
        SELECT id, data
        FROM workbench.udt_dataset_rows
        WHERE table_id = p_table_id
          AND deleted_at IS NULL
        ORDER BY created_at
    LOOP
        v_header := '';

        FOR v_index IN 0..jsonb_array_length(v_fields)-1 LOOP
            v_field := v_fields->v_index;
            v_field_name := v_field->>'field_name';

            IF v_header != '' THEN
                v_header := v_header || ',';
            END IF;

            v_value := v_row.data->>v_field_name;

            IF v_value IS NOT NULL THEN
                v_header := v_header || '"' || REPLACE(v_value, '"', '""') || '"';
            ELSE
                v_header := v_header || '""';
            END IF;
        END LOOP;

        v_csv := v_csv || v_header || E'\n';
    END LOOP;

    -- lane LISTS-AFTER-SWITCH: a moved table's export says so on its first line.
    IF v_moved IS NOT NULL THEN
        v_csv := '"' || REPLACE(v_moved->>'says', '"', '""') || '"' || E'\n' || v_csv;
    END IF;

    RETURN v_csv;
END;
$function$;

-- ── public.udt_column_facets — reader: facets skip archived rows
CREATE OR REPLACE FUNCTION public.udt_column_facets(p_table_id uuid, p_field_name text, p_limit integer DEFAULT 50, p_search_term text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
    v_limit  INTEGER := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 500);
    v_result JSONB;
BEGIN
    IF p_field_name IS NULL OR btrim(p_field_name) = '' THEN
        RAISE EXCEPTION 'udt_column_facets: p_field_name is required';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM workbench.udt_dataset_fields
        WHERE table_id = p_table_id AND field_name = p_field_name
    ) THEN
        IF NOT EXISTS (SELECT 1 FROM workbench.udt_datasets WHERE id = p_table_id) THEN
            perform platform.refuse_not_found(format('dataset %s is not available to this account — it may not exist, or your access may not reach it', p_table_id));
        END IF;
        RAISE EXCEPTION 'udt_column_facets: field % is not a column of table %',
            p_field_name, p_table_id;
    END IF;

    WITH scoped AS (
        SELECT nullif(btrim(r.data ->> p_field_name), '') AS v
        FROM workbench.udt_dataset_rows r
        WHERE r.table_id = p_table_id
          AND r.deleted_at IS NULL
          AND (p_search_term IS NULL
               OR r.data::text ILIKE '%' || p_search_term || '%')
    ),
    totals AS (
        SELECT
            count(*)::int                                              AS total_rows,
            count(v)::int                                              AS filled,
            count(*) FILTER (WHERE v IS NULL)::int                     AS blank,
            count(DISTINCT v)::int                                     AS distinct_count,
            COALESCE(max(length(v)), 0)::int                           AS max_length,
            count(DISTINCT v) FILTER (WHERE length(v) > 300)::int      AS unlistable
        FROM scoped
    ),
    top_values AS (
        SELECT v, count(*)::int AS c
        FROM scoped
        WHERE v IS NOT NULL AND length(v) <= 300
        GROUP BY v
        ORDER BY count(*) DESC, v ASC
        LIMIT v_limit
    )
    SELECT jsonb_build_object(
        'success',        true,
        'table_id',       p_table_id,
        'field_name',     p_field_name,
        'total_rows',     t.total_rows,
        'filled',         t.filled,
        'blank',          t.blank,
        'distinct_count', t.distinct_count,
        'max_length',     t.max_length,
        'unlistable',     t.unlistable,
        'limit',          v_limit,
        'truncated',      (t.distinct_count - t.unlistable) > v_limit,
        -- lane LISTS-AFTER-SWITCH: moved_to (null for a live table).
        'moved_to',       workbench.older_table_moved_to(p_table_id),
        'values',         COALESCE((
            SELECT jsonb_agg(jsonb_build_object('value', tv.v, 'count', tv.c)
                             ORDER BY tv.c DESC, tv.v ASC)
            FROM top_values tv
        ), '[]'::jsonb)
    )
    INTO v_result
    FROM totals t;

    RETURN v_result;
END;
$function$;

-- ── public.udt_table_profile — reader: profile skips archived rows
CREATE OR REPLACE FUNCTION public.udt_table_profile(p_table_id uuid, p_preview_values integer DEFAULT 12)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
    v_preview INTEGER := LEAST(GREATEST(COALESCE(p_preview_values, 12), 1), 100);
    v_result  JSONB;
    v_rows    INTEGER;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM workbench.udt_datasets WHERE id = p_table_id) THEN
        perform platform.refuse_not_found(format('dataset %s is not available to this account — it may not exist, or your access may not reach it', p_table_id));
    END IF;

    SELECT count(*)::int INTO v_rows
    FROM workbench.udt_dataset_rows WHERE table_id = p_table_id AND deleted_at IS NULL;

    SELECT jsonb_build_object(
        'success',    true,
        'table_id',   p_table_id,
        'total_rows', v_rows,
        -- lane LISTS-AFTER-SWITCH: moved_to (null for a live table).
        'moved_to',   workbench.older_table_moved_to(p_table_id),
        'columns',    COALESCE(jsonb_agg(col ORDER BY col_order), '[]'::jsonb)
    )
    INTO v_result
    FROM (
        SELECT
            f.field_order AS col_order,
            jsonb_build_object(
                'field_name',     f.field_name,
                'display_name',   f.display_name,
                'data_type',      f.data_type::text,
                'is_required',    f.is_required,
                'format',         f.metadata -> 'format',
                'filled',         s.filled,
                'blank',          s.blank,
                'distinct_count', s.distinct_count,
                'max_length',     s.max_length,
                'looks_numeric',  s.looks_numeric,
                'looks_url',      s.looks_url,
                'looks_email',    s.looks_email,
                'looks_bool',     s.looks_bool,
                'top_values',     COALESCE(s.top_values, '[]'::jsonb)
            ) AS col
        FROM workbench.udt_dataset_fields f
        CROSS JOIN LATERAL (
            WITH scoped AS (
                SELECT nullif(btrim(r.data ->> f.field_name), '') AS v
                FROM workbench.udt_dataset_rows r
                WHERE r.table_id = p_table_id
                  AND r.deleted_at IS NULL
            )
            SELECT
                count(v)::int                          AS filled,
                count(*) FILTER (WHERE v IS NULL)::int  AS blank,
                count(DISTINCT v)::int                  AS distinct_count,
                COALESCE(max(length(v)), 0)::int        AS max_length,
                count(*) FILTER (
                    WHERE v ~ '^-?[0-9][0-9,]*(\.[0-9]+)?$')::int  AS looks_numeric,
                count(*) FILTER (
                    WHERE v ~* '^https?://\S+$')::int              AS looks_url,
                count(*) FILTER (
                    WHERE v ~* '^[^@\s]+@[^@\s]+\.[a-z]{2,}$')::int AS looks_email,
                count(*) FILTER (
                    WHERE lower(v) IN ('true','false','yes','no','y','n','1','0'))::int AS looks_bool,
                (
                    SELECT jsonb_agg(jsonb_build_object('value', t.v, 'count', t.c)
                                     ORDER BY t.c DESC, t.v ASC)
                    FROM (
                        SELECT v, count(*)::int AS c
                        FROM scoped
                        WHERE v IS NOT NULL AND length(v) <= 300
                        GROUP BY v
                        ORDER BY count(*) DESC, v ASC
                        LIMIT v_preview
                    ) t
                ) AS top_values
            FROM scoped
        ) s
        WHERE f.table_id = p_table_id
    ) cols;

    RETURN v_result;
END;
$function$;

-- ── public.get_user_tables — reader: row_count skips archived rows
CREATE OR REPLACE FUNCTION public.get_user_tables()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_result jsonb;
begin
    select jsonb_agg(jsonb_build_object(
        'id', t.id, 'table_name', t.table_name, 'description', t.description, 'version', t.version,
        'user_id', t.user_id, 'is_public', t.is_public, 'row_ordering_config', t.row_ordering_config,
        'visibility', t.visibility::text,
        'organization_id', t.organization_id,
        'created_at', t.created_at, 'updated_at', t.updated_at,
        'last_activity_at', t.last_activity_at,
        'row_count', t.row_count,
        'field_count', t.field_count
    ) order by t.last_activity_at desc, t.created_at desc) into v_result
    from (
        select ut.*,
               (select count(*) from workbench.udt_dataset_rows where table_id = ut.id and deleted_at is null) as row_count,
               (select count(*) from workbench.udt_dataset_fields where table_id = ut.id) as field_count,
               greatest(
                   ut.updated_at,
                   ut.created_at,
                   (select max(r.updated_at) from workbench.udt_dataset_rows r where r.table_id = ut.id),
                   (select max(f.updated_at) from workbench.udt_dataset_fields f where f.table_id = ut.id)
               ) as last_activity_at
        from workbench.udt_datasets ut
        where ut.user_id = (select auth.uid())
          and ut.deleted_at is null
    ) t;
    return jsonb_build_object('success', true, 'tables', coalesce(v_result, '[]'::jsonb));
end;
$function$;

-- ── public.udt_list_example_tables — reader: row_count skips archived rows
CREATE OR REPLACE FUNCTION public.udt_list_example_tables()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select jsonb_build_object(
    'success', true,
    'tables', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', d.id,
        'table_name', d.table_name,
        'description', d.description,
        'user_id', d.user_id,
        'organization_id', d.organization_id,
        'visibility', d.visibility::text,
        'created_at', d.created_at,
        'updated_at', d.updated_at,
        'row_count', (select count(*) from workbench.udt_dataset_rows r where r.table_id = d.id and r.deleted_at is null),
        'field_count', (select count(*) from workbench.udt_dataset_fields f where f.table_id = d.id)
      ) order by d.table_name)
      from workbench.udt_datasets d
      where d.deleted_at is null
        and d.organization_id = (select s.organization_id from iam.system_orgs s where s.key = 'system')
    ), '[]'::jsonb)
  );
$function$;

-- ── custom.table_list_everywhere — reader: an older table's row_count skips archived rows
CREATE OR REPLACE FUNCTION custom.table_list_everywhere(p_organization_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me     uuid := custom.query_principal();
  v_tables jsonb;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.table_list_everywhere');

  with visible as (
    select v as id from custom.query_visible_ids(p_organization_id, custom.table_kernel_id()) v
  ),
  store as (
    select jsonb_build_object(
             'id', t.id,
             'table_name', coalesce(nullif(t.data ->> 'name', ''), '(unnamed table)'),
             'description', t.data ->> 'description',
             'version', t.version,
             'user_id', t.created_by,
             'is_public', false,
             'visibility', t.visibility::text,
             'organization_id', t.organization_id,
             'created_at', t.created_at,
             'updated_at', t.updated_at,
             'last_activity_at', greatest(t.updated_at,
                                   (select max(r.updated_at) from custom.record r
                                     where r.organization_id = t.organization_id and r.table_id = t.id)),
             'row_count', (select count(*) from custom.record r
                            where r.organization_id = t.organization_id and r.table_id = t.id
                              and r.data_class = 'record' and r.deleted_at is null),
             'field_count', (select count(*) from custom.record f
                              where f.organization_id = t.organization_id and f.table_id = custom.field_kernel_id()
                                and f.data_class = 'field' and f.deleted_at is null
                                and f.data ->> 'entity_definition_id' = t.id::text),
             'store', 'records')
           -- SC-1 PLACEMENT: who keeps it, and whether the context picker offers it.
           || custom.table_placement(t.organization_id, t.id, t.data, false) as doc
      from custom.record t
      join visible v on v.id = t.id
     where t.organization_id = p_organization_id
       and t.table_id = custom.table_kernel_id()
       and t.data_class = 'table'
       and t.deleted_at is null
  ),
  older as (
    select jsonb_build_object(
             'id', ut.id, 'table_name', ut.table_name, 'description', ut.description,
             'version', ut.version, 'user_id', ut.user_id, 'is_public', ut.is_public,
             'row_ordering_config', ut.row_ordering_config, 'visibility', ut.visibility::text,
             'organization_id', ut.organization_id, 'created_at', ut.created_at,
             'updated_at', ut.updated_at,
             'last_activity_at', greatest(ut.updated_at, ut.created_at,
                                   (select max(r.updated_at) from workbench.udt_dataset_rows r where r.table_id = ut.id),
                                   (select max(f.updated_at) from workbench.udt_dataset_fields f where f.table_id = ut.id)),
             'row_count', (select count(*) from workbench.udt_dataset_rows where table_id = ut.id and deleted_at is null),
             'field_count', (select count(*) from workbench.udt_dataset_fields where table_id = ut.id),
             'store', 'older',
             -- An older table is always a person's own.
             'kept_by_the_app', false, 'kept_for', null, 'offered_as_context', false) as doc
      from workbench.udt_datasets ut
     where ut.user_id = v_me
       and ut.organization_id = p_organization_id
       and ut.deleted_at is null
  )
  select coalesce(jsonb_agg(x.doc order by (x.doc ->> 'last_activity_at') desc nulls last,
                                           (x.doc ->> 'created_at') desc), '[]'::jsonb)
    into v_tables
    from (select doc from store union all select doc from older) x;

  return jsonb_build_object('success', true, 'tables', v_tables);
end
$function$;

-- ── public._trash_kind_rows — Trash: an archived Data table row is titled by its words, in its table
CREATE OR REPLACE FUNCTION public._trash_kind_rows(p_uid uuid, p_org uuid, p_member uuid, p_kinds text[], p_limit integer, p_offset integer)
 RETURNS TABLE(artifact_kind text, entity_token text, label text, id uuid, title text, deleted_at timestamp with time zone, organization_id uuid, is_mine boolean, owner_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
-- lane TRASH-2. The person (personal mode) or the organization (organization mode, gated by the
-- caller) is the filter; there is no per-row access check and no organization-wide walk here.
-- lane TRASH-TABLES: the record store's Tables and Records, after the registry kinds.
-- lane TRASH-COVERAGE-2: a row whose parent is archived (platform.archived_parent_of) is titled
-- "<title> (in <parent>)" — it is listed, never hidden, and its restore brings the parent back first.
-- A scope type's Field (context_item) carries no organization_id; in organization mode its
-- organization is its scope type's.
-- lane TRASH-COVERAGE-2 (second file): the "(in <parent>)" suffix is computed AFTER the page is cut —
-- an outer select over the limited rows — so it costs one parent lookup per LISTED row, never one per
-- candidate row (org_trash_list file for AI Matrx measured 890.7 ms with it inside the sort; ceiling 300).
-- lane TRASH-COVERAGE-2 (third file): Organization Trash reads a table that carries visibility as TWO
-- bounded index walks — the organization's shared rows, and the caller's own personal rows — instead
-- of one walk that filters out every member's personal row (AI Matrx: 75,540 archived personal files,
-- 3 shared; the one walk read all of them to find three).
-- lane STORE-RESTORE-DOORS: five more record-store kinds — a Field, a Rule, a link between Records, a
-- document template and a dashboard, each removed on its own — read through public._trash_store_children
-- (one predicate with the counts) and titled by public._trash_store_title; restored through their own
-- store door (public._trash_store_restore).
declare
  rec record;
  v_rel regclass;
  v_title text;
  v_org text;
  v_cols text;
  v_limit int := least(greatest(coalesce(p_limit, 200), 1), 1000);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
  v_window int;
  v_title_expr text;
  v_parented boolean;
  v_q text;
  v_wrap text;
  v_kind text[];
begin
  if p_uid is null then return; end if;
  v_window := v_limit + v_offset;

  for rec in
    select e.token, e.user_artifact_kind as kind, e.label,
           e.schema_name as sch, e.table_name as tbl,
           coalesce(e.retention_owner_column, 'created_by') as owner_col,
           e.title_column, e.feature_owned_restore
      from platform.entity_types e
     where e.user_artifact_kind is not null
       and e.is_active
       and (p_kinds is null or e.user_artifact_kind = any(p_kinds))
     order by e.user_artifact_kind
  loop
    begin
      v_rel := to_regclass(format('%I.%I', rec.sch, rec.tbl));
      if v_rel is null then continue; end if;

      if rec.token = 'credential_item' and rec.feature_owned_restore then
        -- Vault credentials: the owner's own, only. Organization mode never lists them.
        if p_org is not null then continue; end if;
        return query execute format(
          'select %L::text, %L::text, %L::text, t.id, t.display_name::text,
                  t.deleted_at, t.organization_id, true, t.user_id
             from users.credential_items t
            where t.user_id = $1 and t.deleted_at is not null
            order by t.deleted_at desc, t.id
            limit %s offset %s',
          rec.kind, rec.token, rec.label, v_limit, v_offset)
          using p_uid;
        continue;
      end if;

      v_title := null;
      -- A scope type's own name is its plural label ("Service areas"); its title_column is the slug.
      select a.attname into v_title
        from pg_attribute a
       where a.attrelid = v_rel and a.attnum > 0 and not a.attisdropped
         and a.attname = any (array['label_plural', coalesce(rec.title_column, '')])
       order by (a.attname <> 'label_plural')
       limit 1;
      if v_title is null then
        select a.attname into v_title
          from pg_attribute a
         where a.attrelid = v_rel and a.attnum > 0 and not a.attisdropped
           and a.attname = any (array['name','title','label','display_name','file_name','folder_name','page_title','subject_value','target_domain','jurisdiction_key','path','code','label_plural','body','description'])
         order by array_position(array['name','title','label','display_name','file_name','folder_name','page_title','subject_value','target_domain','jurisdiction_key','path','code','label_plural','body','description'], a.attname::text)
         limit 1;
      end if;
      v_org := null;
      select a.attname into v_org
        from pg_attribute a
       where a.attrelid = v_rel and a.attnum > 0 and not a.attisdropped
         and a.attname = 'organization_id'
       limit 1;

      v_title_expr := case when v_title is null then 'null::text' else format('left(t.%I::text, 200)', v_title) end;
      -- The comment kind's title rule (a suggestion shows its replacement, a comment its body, else the quote).
      if rec.token = 'comment' then v_title_expr := 'left(platform.comment_trash_title(t), 200)'; end if;
      -- A Data table row has no title column: its own words, then the table it sits in.
      if rec.token = 'udt_dataset_rows' then
        v_title_expr := 'left(coalesce(nullif(btrim(coalesce(t.data ->> ''name'', t.data ->> ''title'', custom._first_words(t.data))), ''''), ''Untitled row'')'
          || ' || '' (in '' || coalesce((select nullif(btrim(d.table_name), '''') from workbench.udt_datasets d where d.id = t.table_id), ''a table'') || '')'', 200)';
      end if;
      v_parented := rec.token in ('folder', 'file', 'hr_employment', 'workflow_trigger', 'processed_document')
        or exists (select 1 from platform.soft_delete_edge s
                    where s.child_schema = rec.sch and s.child_table = rec.tbl and s.action = 'cascade');
      v_wrap := null;
      if v_parented then
        v_wrap := format(
          'select y.a, y.b, y.c, y.id, '
          || 'coalesce((select coalesce(nullif(btrim(y.t), ''''), ''Untitled'') || '' (in '' || '
          || 'coalesce(nullif(btrim(ap.parent_title), ''''), ''an archived item'') || '')'' '
          || 'from platform.archived_parent_of(%L, y.id) ap limit 1), y.t), '
          || 'y.d, y.o, y.m, y.w from (%%s) y(a, b, c, id, t, d, o, m, w) order by y.d desc, y.id',
          rec.token);
      end if;

      if rec.token = 'context_item' and p_org is not null then
        v_q := format(
          'select %L::text, %L::text, %L::text, t.id, %s, t.deleted_at, st.organization_id, (t.%I = $1), t.%I
             from context.context_items t
             join context.scope_types st on st.id = t.scope_type_id
            where st.organization_id = $2 and t.deleted_at is not null
              and ($3::uuid is null or t.%I = $3)
            order by t.deleted_at desc, t.id
            limit %s offset %s',
          rec.kind, rec.token, rec.label, v_title_expr, rec.owner_col, rec.owner_col, rec.owner_col,
          v_limit, v_offset);
        if v_wrap is not null then v_q := format(v_wrap, v_q); end if;
        return query execute v_q using p_uid, p_org, p_member;
        continue;
      end if;

      if p_org is not null and v_org is null then continue; end if;

      v_cols := format('%L::text, %L::text, %L::text, t.id, %s, t.deleted_at, %s, (t.%I = $1), t.%I',
        rec.kind, rec.token, rec.label,
        v_title_expr,
        case when v_org is null then 'null::uuid' else format('t.%I', v_org) end,
        rec.owner_col, rec.owner_col);

      if p_org is null then
        -- PERSONAL: what I own, plus what was named to me. Each branch is its own indexed read.
        v_q := format(
          'select * from (
             (select %1$s from %2$I.%3$I t
               where t.%4$I = $1 and t.deleted_at is not null
               order by t.deleted_at desc, t.id limit %5$s)
             union all
             (select %1$s from %2$I.%3$I t
               where t.deleted_at is not null
                 and t.%4$I is distinct from $1
                 and t.id in (select g.resource_id from iam.permissions g
                               where g.granted_to_user_id = $1
                                 and g.resource_type = %6$L
                                 and coalesce(g.status, ''active'') <> ''rejected''
                                 and (g.expires_at is null or g.expires_at > now()))
               order by t.deleted_at desc, t.id limit %5$s)
           ) x
           order by x.deleted_at desc, x.id
           limit %7$s offset %8$s',
          v_cols, rec.sch, rec.tbl, rec.owner_col, v_window, rec.token, v_limit, v_offset);
        if v_wrap is not null then v_q := format(v_wrap, v_q); end if;
        return query execute v_q using p_uid;
      else
        -- ORGANIZATION: this organization's archived rows, optionally one member's. The caller gated it.
        -- A PERSONAL row (visibility = personal) belongs to its owner alone — a member's private
        -- highlight or note never shows in the organization's Trash (verify RC-B11 round 3; access
        -- is personal, Arman 2026-09-23). Its owner still sees it in their own Trash.
        if iam.table_has_visibility(rec.sch, rec.tbl) then
          v_q := format(
            'select * from (
               (select %1$s from %2$I.%3$I t
                 where t.%4$I = $2 and t.deleted_at is not null
                   and ($3::uuid is null or t.%5$I = $3)
                   and t.visibility is distinct from ''personal''
                 order by t.deleted_at desc, t.id limit %8$s)
               union all
               (select %1$s from %2$I.%3$I t
                 where t.%5$I = $1 and t.deleted_at is not null
                   and t.%4$I = $2
                   and ($3::uuid is null or t.%5$I = $3)
                   and t.visibility = ''personal''
                 order by t.deleted_at desc, t.id limit %8$s)
             ) x
             order by x.deleted_at desc, x.id
             limit %6$s offset %7$s',
            v_cols, rec.sch, rec.tbl, v_org, rec.owner_col, v_limit, v_offset, v_window);
        else
          v_q := format(
            'select %1$s from %2$I.%3$I t
              where t.%4$I = $2 and t.deleted_at is not null
                and ($3::uuid is null or t.%5$I = $3)
              order by t.deleted_at desc, t.id
              limit %6$s offset %7$s',
            v_cols, rec.sch, rec.tbl, v_org, rec.owner_col, v_limit, v_offset);
        end if;
        if v_wrap is not null then v_q := format(v_wrap, v_q); end if;
        return query execute v_q using p_uid, p_org, p_member;
      end if;
    exception when undefined_table or undefined_column or insufficient_privilege then continue;
    end;
  end loop;

  -- ── THE RECORD STORE (lane TRASH-TABLES) ────────────────────────────────────────────────────
  -- One physical table (custom.record) holds every Table and Record, so the registry loop above
  -- cannot describe them. Same two modes, same person/organization filter, restored by
  -- custom.record_restore through entity_undelete / org_trash_restore (token `record`).
  -- ── PASSAGE LINKS (annotation trash) ─────────────────────────────────────────────────────────
  -- Only anchored_to associations the person made, removed on their own; personal Trash only (see
  -- the file header). The rest of platform.associations never reaches /trash.
  if p_kinds is null or 'passage_link' = any (p_kinds) then
    return query
    select 'passage_link'::text, 'passage_link'::text, 'Passage link'::text, a.id,
           left(platform.passage_link_trash_title(a), 200),
           a.deleted_at, a.organization_id, (a.created_by = p_uid), a.created_by
      from platform.associations a
     where a.role = 'anchored_to' and a.deleted_at is not null and a.deleted_via_type is null
       and p_org is null and a.created_by = p_uid
     order by a.deleted_at desc, a.id
     limit v_limit offset v_offset;
  end if;

  if to_regclass('custom.record') is null then return; end if;

  if p_kinds is null or 'table' = any (p_kinds) then
    if p_org is null then
      return query
      select 'table'::text, 'record'::text, 'Table'::text, x.id,
             coalesce(nullif(btrim(x.data ->> 'name'), ''), 'Untitled table'),
             x.deleted_at, x.organization_id, (x.created_by = p_uid), x.created_by
        from (
          (select t.id, t.data, t.deleted_at, t.organization_id, t.created_by
             from custom.record t
            where t.created_by = p_uid and t.data_class = 'table' and t.deleted_at is not null
            order by t.deleted_at desc, t.id limit v_window)
          union all
          (select t.id, t.data, t.deleted_at, t.organization_id, t.created_by
             from custom.record t
            where t.data_class = 'table' and t.deleted_at is not null
              and t.created_by is distinct from p_uid
              and t.id in (select g.resource_id from iam.permissions g
                            where g.granted_to_user_id = p_uid
                              and g.resource_type = 'record'
                              and coalesce(g.status, 'active') <> 'rejected'
                              and (g.expires_at is null or g.expires_at > now()))
            order by t.deleted_at desc, t.id limit v_window)
        ) x
       order by x.deleted_at desc, x.id
       limit v_limit offset v_offset;
    else
      return query
      select 'table'::text, 'record'::text, 'Table'::text, t.id,
             coalesce(nullif(btrim(t.data ->> 'name'), ''), 'Untitled table'),
             t.deleted_at, t.organization_id, (t.created_by = p_uid), t.created_by
        from custom.record t
       where t.organization_id = p_org and t.data_class = 'table' and t.deleted_at is not null
         and (p_member is null or t.created_by = p_member)
       order by t.deleted_at desc, t.id
       limit v_limit offset v_offset;
    end if;
  end if;

  if p_kinds is null or 'record' = any (p_kinds) then
    -- A Record archived on its own, while its Table is live. One inside an archived Table comes
    -- back with the Table, so it is not a second Trash row.
    return query
    select 'record'::text, 'record'::text, 'Record'::text, y.id,
           format('%s (in %s)',
                  coalesce(nullif(btrim(custom.record_words(y.organization_id, y.id)), ''), 'Untitled record'),
                  coalesce(nullif(btrim(y.table_name), ''), 'a table')),
           y.deleted_at, y.organization_id, (y.created_by = p_uid), y.created_by
      from (
        select x.id, x.deleted_at, x.organization_id, x.created_by, x.table_name
          from (
            (select r.id, r.deleted_at, r.organization_id, r.created_by, t.data ->> 'name' as table_name
               from custom.record r
               join custom.record t
                 on t.organization_id = r.organization_id and t.id = r.table_id
                and t.data_class = 'table' and t.deleted_at is null
              where p_org is null
                and r.created_by = p_uid and r.data_class = 'record' and r.deleted_at is not null
              order by r.deleted_at desc, r.id limit v_window)
            union all
            (select r.id, r.deleted_at, r.organization_id, r.created_by, t.data ->> 'name'
               from custom.record r
               join custom.record t
                 on t.organization_id = r.organization_id and t.id = r.table_id
                and t.data_class = 'table' and t.deleted_at is null
              where p_org is null
                and r.data_class = 'record' and r.deleted_at is not null
                and r.created_by is distinct from p_uid
                and r.id in (select g.resource_id from iam.permissions g
                              where g.granted_to_user_id = p_uid
                                and g.resource_type = 'record'
                                and coalesce(g.status, 'active') <> 'rejected'
                                and (g.expires_at is null or g.expires_at > now()))
              order by r.deleted_at desc, r.id limit v_window)
            union all
            (select r.id, r.deleted_at, r.organization_id, r.created_by, t.data ->> 'name'
               from custom.record r
               join custom.record t
                 on t.organization_id = r.organization_id and t.id = r.table_id
                and t.data_class = 'table' and t.deleted_at is null
              where p_org is not null
                and r.organization_id = p_org and r.data_class = 'record' and r.deleted_at is not null
                and (p_member is null or r.created_by = p_member)
              order by r.deleted_at desc, r.id limit v_window)
          ) x
         order by x.deleted_at desc, x.id
         limit v_limit offset v_offset
      ) y
     order by y.deleted_at desc, y.id;
  end if;

  -- ── THE STORE'S OWN THINGS, removed on their own (lane STORE-RESTORE-DOORS) ──────────────────
  foreach v_kind slice 1 in array array[['field','Field'],['rule','Rule'],['relation','Link'],['doc_template','Document template'],['dashboard','Dashboard']] loop
    continue when p_kinds is not null and not (v_kind[1] = any (p_kinds));
    return query
    select v_kind[1], 'record'::text, v_kind[2], y.id,
           coalesce(public._trash_store_title(y.organization_id, y.id), 'Untitled'),
           y.deleted_at, y.organization_id, (y.created_by = p_uid), y.created_by
      from (select c.id, c.organization_id, c.deleted_at, c.created_by
              from public._trash_store_children(p_uid, p_org, p_member, v_kind[1], v_window) c
             order by c.deleted_at desc, c.id
             limit v_limit offset v_offset) y
     order by y.deleted_at desc, y.id;
  end loop;
end;
$function$;

-- ── /trash: register archived Data table rows with THE trash registry
UPDATE platform.entity_types
   SET user_artifact_kind = 'dataset_row'
 WHERE token = 'udt_dataset_rows'
   AND user_artifact_kind IS NULL;
