-- based-on: public.delete_data_row_from_user_table(uuid) 5a83e81dd7b2615b121fef2b0ae5879d138a0a243af67376a2f4d3d8bb78bd49
-- based-on: public.udt_bulk_write(uuid, jsonb) 9474e71d1bf1c548e413fe5b453109d56ea03d9ffd5e453967bd577ffb4bf1c5
-- based-on: public.udt_delete_field(uuid, uuid) 6e520133a70d63beca9b3ed90bab5da455aed376fc56d8a1f24cc33ff4e84c17
-- based-on: public.add_column_to_user_table(uuid, text, text, text, integer, boolean, jsonb, jsonb) ab6ecd621b6541348a31e20e5dacefabce9b26656aa57937eb214483652aa9c5
-- based-on: custom.table_list_everywhere(uuid) 528f7aa5248a1dbb458ef55423313321e11f203451d850e2536874eb4f549a82
-- based-on: public.get_user_tables() 22bb0a044c611f75361c0826bea2fc6f8131a4ad911beab41fa040f190baabe7
-- based-on: public.udt_list_example_tables() 6b7dfb5ef6685b5950bf4b38cacf15c36276d126d20ffd6baffdfb27b6d11848
-- based-on: public._d31_impl_get_user_table_complete(uuid, text, text) e0aab26e0ca685099fe8b0f1dfffd2ae0e8d8980a8c41443ae8cd974bdeba8fe
-- based-on: public.export_user_table_as_csv(uuid) adfded6b8be12bd09c099f343f8da006da6cbaef9c9a152640e9806a8270f6ee
-- based-on: public.export_user_table_as_csv(uuid, text, text) 73e3300d7002bd80cb785492adb1b717d537a5827042f437621ddf84bc48ac54
-- based-on: public.get_full_table(jsonb) e0b2a564f2ef39cfcbb3cfe8efc4914f1aca285e9e7bcc2fa39c582bf3f2ec20
-- based-on: public.get_table_cell(jsonb) f0089225ecadfd518dd4eb54f4c4938780c05020f49077a361da33f2258ed781
-- based-on: public.get_table_row(jsonb) b0975e06062f3da28f41146d01397b0c47498fe8edc8da1c403cd2c6fdb9c803
-- based-on: public.get_table_column(jsonb) ba589ce88e569c35f4a1c540e59ba3ba8f41342e250242fbab4ad2b6234a5c54
-- based-on: public.list_table_columns(jsonb) 587dc2b7ee964b350a68f7d803bcbcde8d671f7f749130fdc9ffed2bd5ec0c5b
-- based-on: public.list_table_rows(jsonb, integer, integer, text, text) 901fdfaa131d806b0e52581129ad05daaf69531e8dfd0f4760bf18b305176b69
-- based-on: public.get_user_table_data_paginated(uuid, integer, integer, text, text, text) 9e6fffcc5aeb22b4808fc149531c8f6ee31dc97716eb0fc16d6a14a91928c55a
-- based-on: public.get_user_table_data_paginated_v2(uuid, integer, integer, text, text, text) 62f94f7b879d68143b37d3c2cd1aa6154487111ca05061f7317928eba52e02d6
-- based-on: public.udt_column_facets(uuid, text, integer, text) b2af38f3423ac55304dd9fba5586ab439b8955b42683606e0cfc0c959de4cccc
-- based-on: public.udt_table_profile(uuid, integer) c3f81849ee9598959b475a82cec841844a5502e3a9f0b07f7a25cc2e28ce9876
-- based-on: public.udt_upsert_cell(uuid, uuid, text, jsonb) 5e3509af0071494f0365eb82ff9ce5664738daf468a4fea0d82a6b191694b076
-- based-on: public.udt_upsert_row(uuid, uuid, jsonb) d46c5f7365bd65793002b2969302ff4182bea96e02155d8c2aca68ac57dbbd23
-- based-on: public.update_data_row_in_user_table(uuid, jsonb) fd4fbbcaf69e381c693dc81337987085fcb7a1cc8d33aa397a008a13e4dcafdf
-- based-on: public.append_rows_to_user_table(uuid, jsonb) 8367bb8e95db587d30c7650b2fa793aaab4c08937678d1e35b1f2902bf0ff711
-- based-on: public.udt_validate_row(uuid, jsonb, jsonb) ae0cb0d9214a005897f24013278d44540c237b6cc147c9e380d404fcf24fd3f2
-- based-on: public._d31_impl_update_user_table_config(uuid, jsonb, jsonb) e8d824cc1102a0233f1bb19d266b76eae39c3b0170af81825838f6162a937102
-- based-on: public.udt_set_field_format(uuid, uuid, jsonb) f8fb47b2b829edfcb84ca57b47601c8ed62461d5af035709c31d2e96754ed443
-- based-on: public.update_user_table_row_ordering(uuid, boolean, jsonb, text) 7fe543de17f4f5f93bbf27d5306c8ccdbf36662e97e70a5099112eaadfb3bbd1
-- based-on: public.udt_change_field_type(uuid, uuid, field_data_type, text) fcc669918e4ce9e6fc46a395847d8767fd95c35d14119d1d52394e71f64fc92e
-- Delete means archive (Arman, 2026-09-27): the older Data tables store removed
-- rows (delete_data_row_from_user_table, udt_bulk_write 'delete') and columns
-- (udt_delete_field) for good. They now archive: deleted_at is set, nothing is
-- removed, and a column's values stay in its rows so restoring it brings them
-- back. Every reader and writer of live rows/columns skips archived ones:
-- listing, paging, counts, export, cell/row/column reads, facets, profile,
-- validation, config and format edits, cell/row upserts. add_column_to_user_table
-- revives an archived column of the same name (the (table_id, field_name) index
-- is full). The Data tables switch machinery already reads deleted_at as removed
-- (platform.cutover_older_removal_rows). Autonumber max and the type-change
-- rewrite still span archived rows on purpose (no reused numbers; a restored
-- row keeps a value of the column's current type).
-- Bodies are the live pg_get_functiondef read immediately before writing.

CREATE OR REPLACE FUNCTION public.delete_data_row_from_user_table(p_row_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_result JSONB;
    v_deleted BOOLEAN;
BEGIN
    -- Delete means archive (2026-09-27): the row is archived, never removed.
    UPDATE workbench.udt_dataset_rows
       SET deleted_at = now(), updated_at = now()
     WHERE id = p_row_id AND deleted_at IS NULL
    RETURNING true INTO v_deleted;

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
$function$
;

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
      UPDATE workbench.udt_dataset_rows
         SET data = v_op -> 'data', updated_at = now()
       WHERE id = v_row_id AND table_id = p_table_id AND deleted_at IS NULL
       RETURNING to_jsonb(workbench.udt_dataset_rows.*) INTO v_result;
      v_results := v_results || jsonb_build_array(
        COALESCE(v_result, jsonb_build_object('error', 'row_not_found', 'row_id', v_row_id))
      );

    ELSIF v_op_kind = 'merge' THEN
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
         WHERE table_id = p_table_id AND field_name = v_op ->> 'field_name' AND deleted_at IS NULL
      ) THEN
        RAISE EXCEPTION 'udt_bulk_write: cell op references undeclared field % on table %',
          v_op ->> 'field_name', p_table_id;
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
      -- Delete means archive (2026-09-27): the row is archived, never removed.
      UPDATE workbench.udt_dataset_rows
         SET deleted_at = now(), updated_at = now()
       WHERE id = v_row_id AND table_id = p_table_id AND deleted_at IS NULL
       RETURNING to_jsonb(workbench.udt_dataset_rows.*) INTO v_result;
      v_results := v_results || jsonb_build_array(
        COALESCE(v_result, jsonb_build_object('error', 'row_not_found', 'row_id', v_row_id))
      );

    ELSE
      RAISE EXCEPTION 'udt_bulk_write: unknown op kind %', v_op_kind;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('table_id', p_table_id, 'count', jsonb_array_length(v_results), 'results', v_results);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.udt_delete_field(p_table_id uuid, p_field_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_field_name text;
  v_display_name text;
  v_remaining int;
  v_rows_cleared int := 0;
begin
  if (
    workbench.udt_dataset_access(p_table_id, 'editor')
  ) is not true then
    raise exception 'editor access required for dataset %', p_table_id using errcode = '42501';
  end if;

  select field_name, display_name into v_field_name, v_display_name
  from workbench.udt_dataset_fields
  where id = p_field_id and table_id = p_table_id and deleted_at is null;

  if v_field_name is null then
    return jsonb_build_object('success', false, 'error', 'Column not found in this table');
  end if;

  select count(*) into v_remaining
  from workbench.udt_dataset_fields
  where table_id = p_table_id and deleted_at is null;

  if v_remaining <= 1 then
    return jsonb_build_object(
      'success', false,
      'error', 'A table must keep at least one column. Add another column before removing this one.'
    );
  end if;

  -- Delete means archive (2026-09-27): the column is archived, never removed,
  -- and its values stay in the rows so restoring the column brings them back
  -- (every reader lists live columns only). rows_cleared stays 0.
  update workbench.udt_dataset_fields
     set deleted_at = now(), updated_at = now()
   where id = p_field_id and table_id = p_table_id and deleted_at is null;

  -- Close the gap in field_order so the remaining columns stay 1..n.
  with ordered as (
    select id, row_number() over (order by field_order, created_at) as rn
    from workbench.udt_dataset_fields
    where table_id = p_table_id and deleted_at is null
  )
  update workbench.udt_dataset_fields f
  set field_order = ordered.rn
  from ordered
  where f.id = ordered.id and f.field_order is distinct from ordered.rn;

  -- Never leave the table pointing at a column that no longer exists.
  update workbench.udt_datasets
  set row_ordering_config = case
        when row_ordering_config->'default_sort'->>'field' = v_field_name
          then row_ordering_config - 'default_sort'
        else row_ordering_config
      end,
      version = version + 1,
      updated_at = now()
  where id = p_table_id;

  update workbench.udt_datasets
  set row_ordering_config = row_ordering_config - 'label_field'
  where id = p_table_id
    and row_ordering_config->>'label_field' = v_field_name;

  return jsonb_build_object(
    'success', true,
    'table_id', p_table_id,
    'field_id', p_field_id,
    'field_name', v_field_name,
    'display_name', v_display_name,
    'rows_cleared', v_rows_cleared
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.add_column_to_user_table(p_table_id uuid, p_field_name text, p_display_name text, p_data_type text, p_field_order integer DEFAULT NULL::integer, p_is_required boolean DEFAULT false, p_default_value jsonb DEFAULT NULL::jsonb, p_validation_rules jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_result JSONB;
    v_field_id UUID;
    v_max_order INT;
    v_actual_order INT;
    v_data_type public.field_data_type;
    v_field_name TEXT;
    v_display_name TEXT;
BEGIN
    v_field_name := public.to_snake_case(p_field_name);
    v_display_name := COALESCE(NULLIF(p_display_name, ''), p_field_name);
    EXECUTE format('SELECT %L::public.field_data_type', p_data_type) INTO v_data_type;

    IF p_field_order IS NULL THEN
        SELECT COALESCE(MAX(field_order), 0) + 1 INTO v_max_order
        FROM workbench.udt_dataset_fields
        WHERE table_id = p_table_id AND deleted_at IS NULL;
        v_actual_order := v_max_order;
    ELSE
        v_actual_order := p_field_order;
    END IF;

    -- Delete means archive: a column with this name that was archived comes
    -- back (udt_dataset_fields_dataset_id_field_name_unique is a full index),
    -- with the new definition and the values its rows kept.
    UPDATE workbench.udt_dataset_fields SET
        display_name = v_display_name, data_type = v_data_type, field_order = v_actual_order,
        is_required = p_is_required, default_value = p_default_value,
        validation_rules = p_validation_rules, deleted_at = NULL, updated_at = NOW()
     WHERE table_id = p_table_id AND field_name = v_field_name AND deleted_at IS NOT NULL
    RETURNING id INTO v_field_id;

    IF v_field_id IS NULL THEN
    INSERT INTO workbench.udt_dataset_fields (
        table_id, field_name, display_name, data_type, field_order,
        is_required, default_value, validation_rules, user_id
    )
    SELECT
        p_table_id, v_field_name, v_display_name, v_data_type, v_actual_order,
        p_is_required, p_default_value, p_validation_rules, user_id
    FROM workbench.udt_datasets
    WHERE id = p_table_id
    RETURNING id INTO v_field_id;
    END IF;

    IF v_field_id IS NOT NULL THEN
        UPDATE workbench.udt_datasets
        SET version = version + 1, updated_at = NOW()
        WHERE id = p_table_id;

        UPDATE workbench.udt_dataset_rows
        -- A value the row already holds (a restored column's) wins over the default.
        SET data = jsonb_build_object(v_field_name, COALESCE(p_default_value, 'null'::jsonb)) || COALESCE(data, '{}'::jsonb),
            updated_at = NOW()
        WHERE table_id = p_table_id AND deleted_at IS NULL;

        v_result := jsonb_build_object(
            'success', true, 'field_id', v_field_id,
            'field_name', v_field_name, 'display_name', v_display_name,
            'data_type', p_data_type, 'field_order', v_actual_order
        );
    ELSE
        v_result := jsonb_build_object('success', false, 'error', 'Failed to create new field');
    END IF;

    RETURN v_result;
END;
$function$
;

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
                                   (select max(r.updated_at) from workbench.udt_dataset_rows r where r.table_id = ut.id and r.deleted_at is null),
                                   (select max(f.updated_at) from workbench.udt_dataset_fields f where f.table_id = ut.id and f.deleted_at is null)),
             'row_count', (select count(*) from workbench.udt_dataset_rows where table_id = ut.id and deleted_at is null),
             'field_count', (select count(*) from workbench.udt_dataset_fields where table_id = ut.id and deleted_at is null),
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
$function$
;

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
               (select count(*) from workbench.udt_dataset_fields where table_id = ut.id and deleted_at is null) as field_count,
               greatest(
                   ut.updated_at,
                   ut.created_at,
                   (select max(r.updated_at) from workbench.udt_dataset_rows r where r.table_id = ut.id and r.deleted_at is null),
                   (select max(f.updated_at) from workbench.udt_dataset_fields f where f.table_id = ut.id and f.deleted_at is null)
               ) as last_activity_at
        from workbench.udt_datasets ut
        where ut.user_id = (select auth.uid())
          and ut.deleted_at is null
    ) t;
    return jsonb_build_object('success', true, 'tables', coalesce(v_result, '[]'::jsonb));
end;
$function$
;

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
        'field_count', (select count(*) from workbench.udt_dataset_fields f where f.table_id = d.id and f.deleted_at is null)
      ) order by d.table_name)
      from workbench.udt_datasets d
      where d.deleted_at is null
        and d.organization_id = (select s.organization_id from iam.system_orgs s where s.key = 'system')
    ), '[]'::jsonb)
  );
$function$
;

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
    into v_fields from workbench.udt_dataset_fields where table_id = p_table_id and deleted_at is null;

    if p_sort_field is not null then
        select field_name into v_valid_sort_field
        from workbench.udt_dataset_fields
        where table_id = p_table_id and deleted_at is null
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
$function$
;

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
    WHERE table_id = p_table_id AND deleted_at IS NULL;

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
        WHERE table_id = p_table_id AND deleted_at IS NULL
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
$function$
;

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
    WHERE table_id = p_table_id AND deleted_at IS NULL;

    IF v_fields IS NULL OR jsonb_array_length(v_fields) = 0 THEN
        RETURN '';
    END IF;

    IF p_sort_field IS NOT NULL THEN
        SELECT field_name INTO v_valid_sort_field
        FROM workbench.udt_dataset_fields
        WHERE table_id = p_table_id AND deleted_at IS NULL
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
$function$
;

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
      WHERE tf.table_id = v_table_id AND tf.deleted_at IS NULL
    ),
    -- COUNT(*), not the length of a materialized row array. This is the whole
    -- reason to call this instead of get_user_table_complete.
    'row_count',
    (
      SELECT COUNT(*)::int
      FROM workbench.udt_dataset_rows d
      WHERE d.table_id = v_table_id AND d.deleted_at IS NULL
    ),
    -- lane OLDER-DOORS-AFTER-SWITCH: a table that moved with its organization's Data tables
    -- switch answers with the same rows, marked moved (null for every live table).
    'moved_to',
    workbench.older_table_moved_to(v_table_id)
  );

  RETURN j;
END;
$function$
;

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
    WHERE tf.table_id = v_table_id AND tf.deleted_at IS NULL
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
$function$
;

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
$function$
;

CREATE OR REPLACE FUNCTION public.get_table_column(ref jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
  v_table_id uuid := (ref->>'table_id')::uuid;
  v_table_name text := ref->>'table_name';
  v_field_name text := ref->>'column_name';
  v_display_name text := ref->>'column_display_name';
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

  SELECT to_jsonb(tf)
  INTO j
  FROM workbench.udt_dataset_fields tf
  WHERE tf.table_id = v_table_id AND tf.deleted_at IS NULL
    AND (
      (v_field_name IS NOT NULL AND tf.field_name = v_field_name)
      OR (v_field_name IS NULL AND v_display_name IS NOT NULL AND tf.display_name = v_display_name)
    )
  LIMIT 1;

  IF j IS NULL THEN
    RAISE EXCEPTION 'Column not found';
  END IF;

  -- lane LISTS-AFTER-SWITCH: marked when the table moved with its organization's switch.
  v_moved := workbench.older_table_moved_to(v_table_id);
  IF v_moved IS NOT NULL THEN
    j := j || jsonb_build_object('moved_to', v_moved);
  END IF;

  RETURN j;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.list_table_columns(ref jsonb)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
  -- lane LISTS-AFTER-SWITCH: each column carries moved_to when the table moved with its switch.
  SELECT COALESCE(
    jsonb_agg((to_jsonb(tf) - 'validation_rules' - 'default_value')
              || case when m.moved_to is null then '{}'::jsonb else jsonb_build_object('moved_to', m.moved_to) end
              ORDER BY tf.field_order, tf.created_at),
    '[]'::jsonb
  )
  FROM workbench.udt_dataset_fields tf
  CROSS JOIN (SELECT workbench.older_table_moved_to((ref->>'table_id')::uuid) AS moved_to) m
  WHERE tf.table_id = (ref->>'table_id')::uuid AND tf.deleted_at IS NULL;
$function$
;

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
      WHERE d.table_id = v_table_id AND d.deleted_at IS NULL
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
$function$
;

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
        WHERE table_id = p_table_id AND deleted_at IS NULL
          AND (field_name = p_sort_field OR display_name = p_sort_field)
        LIMIT 1;
    END IF;

    IF p_search_term IS NOT NULL THEN
        SELECT COUNT(*) INTO v_total_count
        FROM workbench.udt_dataset_rows
        WHERE table_id = p_table_id AND deleted_at IS NULL
          AND (data::text ILIKE '%' || p_search_term || '%');
    ELSE
        SELECT COUNT(*) INTO v_total_count
        FROM workbench.udt_dataset_rows
        WHERE table_id = p_table_id AND deleted_at IS NULL;
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
$function$
;

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
        WHERE tf.table_id = p_table_id AND tf.deleted_at IS NULL
          AND (tf.field_name = p_sort_field OR tf.display_name = p_sort_field)
        LIMIT 1;
    END IF;

    IF p_search_term IS NOT NULL THEN
        SELECT COUNT(*) INTO v_total_count
        FROM workbench.udt_dataset_rows
        WHERE table_id = p_table_id AND deleted_at IS NULL
          AND data::text ILIKE '%' || p_search_term || '%';
    ELSE
        SELECT COUNT(*) INTO v_total_count
        FROM workbench.udt_dataset_rows
        WHERE table_id = p_table_id AND deleted_at IS NULL;
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
$function$
;

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
        WHERE table_id = p_table_id AND field_name = p_field_name AND deleted_at IS NULL
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
        WHERE r.table_id = p_table_id AND r.deleted_at IS NULL
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
$function$
;

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
                WHERE r.table_id = p_table_id AND r.deleted_at IS NULL
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
        WHERE f.table_id = p_table_id AND f.deleted_at IS NULL
    ) cols;

    RETURN v_result;
END;
$function$
;

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
$function$
;

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
    UPDATE workbench.udt_dataset_rows SET data = COALESCE(data, '{}'::jsonb) || p_data, updated_at = now()
     WHERE id = p_row_id AND table_id = p_table_id AND deleted_at IS NULL RETURNING * INTO v_row;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'udt_upsert_row: row % not found in table %', p_row_id, p_table_id;
    END IF;
  END IF;
  RETURN to_jsonb(v_row);
END;
$function$
;

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
    UPDATE workbench.udt_dataset_rows
    SET data = COALESCE(data, '{}'::jsonb) || p_data, updated_at = NOW()
    WHERE id = p_row_id AND deleted_at IS NULL
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
$function$
;

CREATE OR REPLACE FUNCTION public.append_rows_to_user_table(p_table_id uuid, p_rows jsonb)
 RETURNS integer
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_inserted int;
  v_allowed  text[];
  v_row      jsonb;
  v_clean    jsonb;
  v_key      text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM workbench.udt_datasets
    WHERE id = p_table_id AND user_id = (select auth.uid())
  ) THEN
    perform platform.refuse_not_found(format('dataset %s is not available to this account — it may not exist, or your access may not reach it', p_table_id));
  END IF;

  SELECT array_agg(field_name) INTO v_allowed
  FROM workbench.udt_dataset_fields
  WHERE table_id = p_table_id AND deleted_at IS NULL;

  v_inserted := 0;
  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows)
  LOOP
    v_clean := '{}'::jsonb;
    FOR v_key IN SELECT jsonb_object_keys(v_row)
    LOOP
      IF v_allowed IS NULL OR v_key = ANY(v_allowed) THEN
        v_clean := v_clean || jsonb_build_object(v_key, v_row -> v_key);
      END IF;
    END LOOP;

    INSERT INTO workbench.udt_dataset_rows (table_id, user_id, data)
    VALUES (p_table_id, (select auth.uid()), v_clean);
    v_inserted := v_inserted + 1;
  END LOOP;

  RETURN v_inserted;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.udt_validate_row(p_table_id uuid, p_data jsonb, p_prior jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_field RECORD; v_value JSONB; v_old_value JSONB; v_mode TEXT;
  v_is_insert BOOLEAN := p_prior IS NULL; v_had BOOLEAN; v_has BOOLEAN;
  v_reason TEXT;
BEGIN
  SELECT validation_mode INTO v_mode FROM workbench.udt_datasets WHERE id = p_table_id;
  IF v_mode IS NULL THEN
    perform platform.refuse_not_found(format('dataset %s is not available to this account — it may not exist, or your access may not reach it', p_table_id));
  END IF;

  -- permissive (default for every pre-existing dataset) enforces NOTHING.
  IF v_mode <> 'strict' THEN
    RETURN p_data;
  END IF;

  FOR v_field IN
    SELECT field_name, data_type, is_required, validation_rules FROM workbench.udt_dataset_fields WHERE table_id = p_table_id AND deleted_at IS NULL
  LOOP
    v_value := p_data -> v_field.field_name;
    v_old_value := p_prior -> v_field.field_name;
    v_has := v_value IS NOT NULL AND jsonb_typeof(v_value) <> 'null';
    v_had := v_old_value IS NOT NULL AND jsonb_typeof(v_old_value) <> 'null';

    IF v_field.is_required AND NOT v_has THEN
      IF v_is_insert THEN
        RAISE EXCEPTION 'udt_validate_row: required field % missing on insert into table %', v_field.field_name, p_table_id;
      ELSIF v_had THEN
        RAISE EXCEPTION 'udt_validate_row: required field % cannot be dropped on table %', v_field.field_name, p_table_id;
      END IF;
      CONTINUE;
    END IF;

    IF v_has THEN
      CASE v_field.data_type::text
        WHEN 'string' THEN
          IF jsonb_typeof(v_value) NOT IN ('string','number') THEN
            RAISE EXCEPTION 'udt_validate_row: field % expects string, got %', v_field.field_name, jsonb_typeof(v_value);
          END IF;
        WHEN 'number' THEN
          IF jsonb_typeof(v_value) NOT IN ('number','string') THEN
            RAISE EXCEPTION 'udt_validate_row: field % expects number, got %', v_field.field_name, jsonb_typeof(v_value);
          END IF;
          IF jsonb_typeof(v_value) = 'string' THEN
            BEGIN PERFORM (v_value #>> '{}')::numeric;
            EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'udt_validate_row: field % value is not numeric', v_field.field_name; END;
          END IF;
        WHEN 'integer' THEN
          IF jsonb_typeof(v_value) NOT IN ('number','string') THEN
            RAISE EXCEPTION 'udt_validate_row: field % expects integer, got %', v_field.field_name, jsonb_typeof(v_value);
          END IF;
          BEGIN PERFORM (v_value #>> '{}')::bigint;
          EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'udt_validate_row: field % value is not an integer', v_field.field_name; END;
        WHEN 'boolean' THEN
          IF jsonb_typeof(v_value) NOT IN ('boolean','string') THEN
            RAISE EXCEPTION 'udt_validate_row: field % expects boolean, got %', v_field.field_name, jsonb_typeof(v_value);
          END IF;
        WHEN 'date','datetime' THEN
          IF jsonb_typeof(v_value) <> 'string' THEN
            RAISE EXCEPTION 'udt_validate_row: field % expects ISO date string, got %', v_field.field_name, jsonb_typeof(v_value);
          END IF;
          BEGIN PERFORM (v_value #>> '{}')::timestamptz;
          EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'udt_validate_row: field % value is not parseable as date', v_field.field_name; END;
        WHEN 'json' THEN NULL;
        WHEN 'array' THEN
          IF jsonb_typeof(v_value) <> 'array' THEN
            RAISE EXCEPTION 'udt_validate_row: field % expects array, got %', v_field.field_name, jsonb_typeof(v_value);
          END IF;
        ELSE NULL;
      END CASE;

      -- Column validation rules. Type first, then the rule: a value that is not
      -- even the right type must hear about THAT, not about a range it could
      -- never have satisfied.
      v_reason := public.udt_validate_cell_rules(
        v_field.validation_rules, v_value, v_field.data_type::text);
      IF v_reason IS NOT NULL THEN
        RAISE EXCEPTION 'udt_validate_row: field %: %', v_field.field_name, v_reason;
      END IF;
    END IF;
  END LOOP;
  RETURN p_data;
END;
$function$
;

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
             WHERE id = v_field_id AND table_id = p_table_id AND deleted_at IS NULL;
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
            WHERE id = v_field_id AND table_id = p_table_id AND deleted_at IS NULL;

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
$function$
;

CREATE OR REPLACE FUNCTION public.udt_set_field_format(p_table_id uuid, p_field_id uuid, p_format jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_metadata jsonb;
begin
  if (
    workbench.udt_dataset_access(p_table_id, 'editor')
  ) is not true then
    raise exception 'editor access required for dataset %', p_table_id using errcode = '42501';
  end if;

  -- p_format null clears the format; the column then renders with its storage
  -- type's identity format, exactly as it did before formats existed.
  update workbench.udt_dataset_fields
  set metadata = case
        when p_format is null or p_format = 'null'::jsonb
          then coalesce(metadata, '{}'::jsonb) - 'format'
        else coalesce(metadata, '{}'::jsonb) || jsonb_build_object('format', p_format)
      end,
      updated_at = now()
  where id = p_field_id and table_id = p_table_id and deleted_at is null
  returning metadata into v_metadata;

  if v_metadata is null then
    return jsonb_build_object('success', false, 'error', 'Column not found in this table');
  end if;

  return jsonb_build_object(
    'success', true,
    'field_id', p_field_id,
    'metadata', v_metadata
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.update_user_table_row_ordering(p_table_id uuid, p_enabled boolean, p_order jsonb DEFAULT NULL::jsonb, p_label_field text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_config JSONB;
BEGIN
    IF (
      workbench.udt_dataset_access(p_table_id, 'editor')
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
            WHERE table_id = p_table_id AND field_name = p_label_field AND deleted_at IS NULL
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
$function$
;

CREATE OR REPLACE FUNCTION public.udt_change_field_type(p_table_id uuid, p_field_id uuid, p_new_type field_data_type, p_strategy text DEFAULT 'cast_or_null'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller UUID := auth.uid(); v_dataset workbench.udt_datasets%ROWTYPE; v_field workbench.udt_dataset_fields%ROWTYPE;
  v_changed INTEGER := 0; v_total INTEGER := 0;
  v_unfit INTEGER := 0; v_preserved INTEGER := 0;
  v_reason TEXT;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'udt_change_field_type: not authenticated'; END IF;
  IF p_strategy NOT IN ('cast_or_null','cast_or_skip') THEN
    RAISE EXCEPTION 'udt_change_field_type: unknown strategy %', p_strategy;
  END IF;
  SELECT * INTO v_dataset FROM workbench.udt_datasets WHERE id = p_table_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'udt_change_field_type: table % not found', p_table_id; END IF;
  IF NOT workbench.udt_dataset_access(p_table_id, 'editor') THEN
    RAISE EXCEPTION 'udt_change_field_type: caller lacks editor permission';
  END IF;
  SELECT * INTO v_field FROM workbench.udt_dataset_fields WHERE id = p_field_id AND table_id = p_table_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'udt_change_field_type: field % not in table %', p_field_id, p_table_id; END IF;

  -- DD-260. The from-type is read from the stored definition, so a caller that has
  -- ALREADY flipped it has destroyed the only record of what the values used to be.
  -- Refuse rather than stamp `<new>→<new>` on the row history — a screen never lies.
  IF v_field.data_type = p_new_type THEN
    RAISE EXCEPTION
      'udt_change_field_type: field "%" is already declared % — there is no "from" type left to record, so this call would stamp row history with "type_change:%→%" and tell the user nothing about what their value used to be. Nothing was changed.',
      v_field.field_name, p_new_type, p_new_type, p_new_type
      USING errcode = 'P0001',
            hint = 'Call udt_change_field_type FIRST and let it flip the declared type: it updates workbench.udt_dataset_fields.data_type itself, in the same transaction as the row rewrite and the history proof. Do NOT send data_type in update_user_table_config''s p_field_updates for a type change (that was the Table settings dialog''s bug, DD-260). If the type genuinely did not change, do not call this at all.';
  END IF;

  SELECT COUNT(*) INTO v_total FROM workbench.udt_dataset_rows WHERE table_id = p_table_id;

  -- Data Doctrine Rule 3. Values that do NOT fit the new type: count them BEFORE
  -- anything is rewritten, so the proof below has a number to hold the history to.
  SELECT COUNT(*) INTO v_unfit
    FROM workbench.udt_dataset_rows r
   WHERE r.table_id = p_table_id
     AND r.data ? v_field.field_name
     AND jsonb_typeof(r.data -> v_field.field_name) <> 'null'
     AND public.udt_cast_jsonb_value(r.data -> v_field.field_name, p_new_type) IS NULL;

  v_reason := 'type_change:' || v_field.data_type::text || '→' || p_new_type::text;
  -- The ONE versioning path (udt_log_row_version) stamps this on every version row
  -- the rewrite produces, in this same transaction. Transaction-local: it cannot
  -- leak into another statement's writes.
  PERFORM set_config('matrx.udt_version_reason', v_reason, true);

  WITH updated AS (
    UPDATE workbench.udt_dataset_rows r
       SET data = jsonb_set(r.data, ARRAY[v_field.field_name],
             COALESCE(
               public.udt_cast_jsonb_value(r.data -> v_field.field_name, p_new_type),
               CASE p_strategy WHEN 'cast_or_null' THEN 'null'::jsonb
                               ELSE r.data -> v_field.field_name END
             ), true),
           updated_at = now()
     -- Only touch rows that actually have this field. Absent==null semantically;
     -- nothing to cast, no audit row to write, no realtime event to emit.
     WHERE r.table_id = p_table_id
       AND r.data ? v_field.field_name
     RETURNING 1
  )
  SELECT COUNT(*) INTO v_changed FROM updated;

  PERFORM set_config('matrx.udt_version_reason', '', true);

  -- The proof. Every value this call is about to leave empty must be readable in
  -- the row's history, with the reason, in THIS transaction. `now()` is the
  -- transaction timestamp and the version row's default, so this counts only what
  -- this call wrote. Under 'cast_or_skip' nothing is emptied, so nothing is owed.
  IF p_strategy = 'cast_or_null' AND v_unfit > 0 THEN
    SELECT COUNT(*) INTO v_preserved
      FROM workbench.udt_dataset_row_versions v
     WHERE v.table_id = p_table_id
       AND v.reason = v_reason
       AND v.changed_at = now()
       AND v.prior_data ? v_field.field_name
       AND jsonb_typeof(v.prior_data -> v_field.field_name) <> 'null'
       AND public.udt_cast_jsonb_value(v.prior_data -> v_field.field_name, p_new_type) IS NULL;

    IF v_preserved < v_unfit THEN
      RAISE EXCEPTION
        'udt_change_field_type: % value(s) in "%" cannot become % and only % reached row history — refusing to empty a cell whose only copy would be lost. Nothing was changed.',
        v_unfit, v_field.field_name, p_new_type, v_preserved
        USING errcode = 'P0001',
              hint = 'The row-version trigger udt_dataset_rows_version_update on workbench.udt_dataset_rows is what preserves these values. Restore it (migrations/udt_v2_backbone.sql), or run the change with strategy ''cast_or_skip'', which leaves un-castable values in place.';
    END IF;
  END IF;

  UPDATE workbench.udt_dataset_fields SET data_type = p_new_type, updated_at = now() WHERE id = p_field_id;

  RETURN jsonb_build_object(
    'field_id',                 p_field_id,
    'new_type',                 p_new_type,
    'strategy',                 p_strategy,
    'rows_rewritten',           v_changed,
    'rows_skipped',             v_total - v_changed,
    'rows_total',               v_total,
    -- What the screen must say. Rule 3 + "a screen never lies": the caller emptied
    -- this many cells, and every one of them is in that row's history under
    -- `history_reason`, restorable from the row's history.
    'values_moved_to_history',  CASE WHEN p_strategy = 'cast_or_null' THEN v_unfit ELSE 0 END,
    'history_reason',           v_reason
  );
END;
$function$
;

-- The two _d31_impl_* bodies are server-only implementations (no client EXECUTE since
-- D31, 2026-07-15), reached only through their public wrappers. Declare that in data.
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   signed_in_callers, anonymous_callers, anonymous_purpose, non_client_lane)
select 'public', p.proname, pg_get_function_identity_arguments(p.oid), platform.door_argtypes(p.proargtypes),
       case p.proname
         when '_d31_impl_get_user_table_complete' then 'Implementation of public.get_user_table_complete: returns one older Data table (live columns and rows) to the wrapper, which decides access.'
         else 'Implementation of public.update_user_table_config: edits one older Data table''s settings and live columns for the wrapper, which decides access.'
       end,
       'delete_is_archive_udt_rows_and_columns', false, false, null,
       case p.proname
         when '_d31_impl_get_user_table_complete' then 'server_only: an implementation body with no client grant since D31 (2026-07-15); its only caller is public.get_user_table_complete.'
         else 'server_only: an implementation body with no client grant since D31 (2026-07-15); its only caller is public.update_user_table_config.'
       end
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname in ('_d31_impl_get_user_table_complete', '_d31_impl_update_user_table_config')
   and not exists (select 1 from platform.client_callable_door d
                    where d.schema_name = 'public' and d.function_name = p.proname
                      and d.identity_argtypes = platform.door_argtypes(p.proargtypes));
