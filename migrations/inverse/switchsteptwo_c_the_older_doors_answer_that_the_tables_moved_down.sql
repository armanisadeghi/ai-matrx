-- INVERSE of migrations/campaign/switchsteptwo_c_the_older_doors_answer_that_the_tables_moved.sql (lane SWITCH-STEP-TWO): the 40
-- older doors exactly as they were.
-- based-on: public.add_column_to_user_table(uuid, text, text, text, integer, boolean, jsonb, jsonb) 410d2a27c39a5e0cd85fd72a5a3bf86097e7d05655ffa6b304f743f171a9cb86
-- based-on: public.add_data_row_to_user_table(uuid, jsonb) c477a566c2497220bf8580b8eb65e4659c7abcb20b5caf2ca33f2fd323d7bc34
-- based-on: public.append_rows_to_user_table(uuid, jsonb) b152cf58f7facff07f488c8d2e6e7485145a570987b8f03131b5202b325d71a7
-- based-on: public.create_new_user_table_dynamic(text, text, boolean, uuid, jsonb) 1f7fc1a992acdd881cefb4f7204aaaa9e65a5ad9976f7f31cd0dd1066420baa5
-- based-on: public.create_user_list(character varying, text, uuid, boolean, boolean, boolean, jsonb, uuid) 82c068182356a1a6ef8d4ac37dd74716132afbed48a9a53d3ca626ae37b7dff7
-- based-on: public.create_user_table_with_fields(text, text, boolean, uuid, uuid, uuid, jsonb) 70d881c8cc2f5e46df9aba9024674095cdb092dc89e691127b6eac1b3cd80ca0
-- based-on: public.delete_data_row_from_user_table(uuid) 3c9ab95d1a932dde1ce20001a78eda2673b0cfbe3920a6579873f97a6be844e8
-- based-on: public.delete_user_table(uuid) 2a9ad39e74453b2fcbd943574642b226db4e15933b614a70687035c1a0ca57df
-- based-on: public.export_user_table_as_csv(uuid, text, text) d3b619416526683eb7a6c4d8f9a5a9aed359c07f4fa9abc234dd8d95764ed06d
-- based-on: public.export_user_table_as_csv(uuid) cd30fe504b12bccd4ae38327cb50b4b3c498244f280e5482233ee863438d3a69
-- based-on: public.get_full_table(jsonb) 27a36824921c2e802a00d5bfb7a88b5fb8bb65907c33832a18d73a20221c9fc8
-- based-on: public.get_table_cell(jsonb) 193cc749f6b9f4c0026e7bdac0e2a80564f4c4e4baa247945b62b155d490fc90
-- based-on: public.get_table_column(jsonb) 991be1e821f037807fe1e1986d0250dad623c97b4522dbf74bd50bde5dffd46b
-- based-on: public.get_table_row(jsonb) b30eca60685ed6eb27e51174e9a34b1a11928b68114e80457eb030a8dd57f61e
-- based-on: public.get_user_table_complete(uuid, text, text) 96e2d41db26f1427a02d02bfda152d3acdcfeecacabc9f7e33bcc9b4f94e1df7
-- based-on: public.get_user_table_data_paginated_v2(uuid, integer, integer, text, text, text) 5829887a82a993d304742380fdb7750d8cf1be03671a63719d5fe8bd32ddfbe5
-- based-on: public.get_user_table_data_paginated(uuid, integer, integer, text, text, text) 5aadd97c8f62d9bf251e4ab3f898c681191db0eff296622348ccc8a3c67b4625
-- based-on: public.get_user_tables() 1d62d0f786c88b8679d32f9827fca8140e58f48f019d3cad7365cd282a2e354e
-- based-on: public.list_table_columns(jsonb) bc4e7f72796630b6cedd3ac0a1bd326e2276879e27130cbf98df6487a9602f13
-- based-on: public.list_table_rows(jsonb, integer, integer, text, text) 98f931589cb412fd8799ff48e76a5451d87076ddb42f6e6ce8059ea0d0aee691
-- based-on: public.udt_backfill_autonumber(uuid, uuid) 3ef3ad5363bc7f47d0e03331c85ee8067d5ae5cbcf5615044048086ff622b7af
-- based-on: public.udt_bulk_write(uuid, jsonb) 777e4efb4cb388f89075d5711b05adcfc5b2d5573fb022bd3ab59c340fec5391
-- based-on: public.udt_change_field_type(uuid, uuid, field_data_type, text) 789eef3f361192fd3f1671f4246d970c0f6a2dd1a8de2950baf98c0be129c8fb
-- based-on: public.udt_column_facets(uuid, text, integer, text) fa96295ddc03cbdad4d452a80569bbe78c71c17dacf8d068dc3c1970ae0bdb01
-- based-on: public.udt_delete_field(uuid, uuid) ec7a415afbdad1fd40ff2d3f320e7546bbaadbe63bf1ae3b576bdb9e26bec387
-- based-on: public.udt_list_example_tables() 0da1a9ed5029d4181ff9b372ddd159df98d29232eea1ad662252e0fffeb4e4ab
-- based-on: public.udt_set_field_format(uuid, uuid, jsonb) d56a5a88d54a74280c0ae0a91de59af7428abb08d5b041de9681db3a84d5fa05
-- based-on: public.udt_set_table_row_actions(uuid, jsonb) de6565412c89bc8afdf6123718152b9075f56e6b111531d8755ff72cbeb0f02e
-- based-on: public.udt_set_table_row_label(uuid, jsonb) 425bf7680b93ed621fd150a754b6b7d155ecb958f70ba53d2a3ddfdae27052cc
-- based-on: public.udt_set_table_style(uuid, text[], jsonb) b6f5b703b77054cb97f39290e490be577ccfec2d6f5884ce5e04a15d02b60b9c
-- based-on: public.udt_table_profile(uuid, integer) 8f136a401c768029d2303b74177479be50a3868a24826469faa35ca661e43e4d
-- based-on: public.udt_upsert_cell(uuid, uuid, text, jsonb) f19558810560b042914961ca4ff1e52eb732505831a74c08b99907be77ca3be1
-- based-on: public.udt_upsert_row(uuid, uuid, jsonb) 5c76ad71875b2f65f21860068c77ce5827933c4856711d45875f12a7b68af202
-- based-on: public.udt_validate_row(uuid, jsonb, jsonb) 42b6cd0a36e5cae6f267c99a103bdb641ed49e48b1fbd84f97457e9e9f9ccb10
-- based-on: public.update_data_row_in_user_table(uuid, jsonb) b50b812faacc4923b1fd1fb96eed206971348bca077d4c6817f584db523a724e
-- based-on: public.update_field_metadata(uuid, text, boolean, integer, jsonb) fff6c6f2e53e35665e0339f09a86b4e6fbf45150124871f98bf40b2cb958e17d
-- based-on: public.update_user_table_config(uuid, jsonb, jsonb) 0971b621cb2526751f2c2cc1228279a61d17568157e8a28e37199ec3fdc6c2dd
-- based-on: public.update_user_table_default_sort(uuid, text, text) 65a7c1bccc3a7c30cbf4030c256a1f4790111c4880ada5e1d0eefeb9b2e66fb9
-- based-on: public.update_user_table_metadata(uuid, text, text, boolean, boolean) 6910e5742c661bcc63e4459c5ec0a76119fe15df3ae3a524e4fdb71ea3aabbe8
-- based-on: public.update_user_table_row_ordering(uuid, boolean, jsonb, text) ea8349af5580cf298e146b0516627cb3a831d7319dfea26430ef6d5372c92479
-- lane: SWITCH-STEP-TWO

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
$function$;

CREATE OR REPLACE FUNCTION public.add_data_row_to_user_table(p_table_id uuid, p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if workbench.udt_dataset_access(p_table_id, 'editor') is not true then
    raise exception 'editor access required for this dataset' using errcode = '42501',
            detail = jsonb_build_object('table_id', p_table_id)::text;
  end if;
  return public._d31_impl_add_data_row_to_user_table(p_table_id, p_data);
end;
$function$;

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
$function$;

CREATE OR REPLACE FUNCTION public.create_new_user_table_dynamic(p_table_name text, p_description text, p_is_public boolean, p_organization_id uuid, p_initial_fields jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_table_id UUID;
    v_field_id UUID;
    v_field JSONB;
    v_data_type public.field_data_type;
    v_initial_row_id UUID;
    v_field_name TEXT;
    v_display_name TEXT;
    v_existing_count INT;
BEGIN
    -- The organization is REFUSED when absent, never derived. No personal org, no
    -- "active" org, no first membership: the caller holds one and says so, or is held.
    IF p_organization_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'Select an organization before creating a table.',
            'error_code', 'ORGANIZATION_REQUIRED'
        );
    END IF;

    -- A definer door that accepts an organization id from a browser asks whether the
    -- caller belongs to it BEFORE it writes anything.
    IF NOT iam.has_org_access(p_organization_id) THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'You are not a member of the selected organization.',
            'error_code', 'ORGANIZATION_FORBIDDEN'
        );
    END IF;

    IF p_table_name IS NULL OR TRIM(p_table_name) = '' THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'Table name cannot be empty.',
            'error_code', 'EMPTY_TABLE_NAME'
        );
    END IF;

    SELECT COUNT(*) INTO v_existing_count
    FROM workbench.udt_datasets
    WHERE user_id = (select auth.uid()) AND table_name = p_table_name;

    IF v_existing_count > 0 THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', format('A table named "%s" already exists.', p_table_name),
            'error_code', 'DUPLICATE_TABLE_NAME'
        );
    END IF;

    INSERT INTO workbench.udt_datasets (table_name, description, user_id, is_public, organization_id)
    VALUES (p_table_name, COALESCE(p_description, 'New table'), (select auth.uid()), p_is_public, p_organization_id)
    RETURNING id INTO v_table_id;

    -- The children say nothing about the organization on purpose: `_0_inherit_org`
    -- (platform.inherit_org_from_parent) copies the dataset's, which is structural
    -- identity rather than a guess, and is exactly what 0929 left standing.
    IF p_initial_fields IS NOT NULL AND jsonb_array_length(p_initial_fields) > 0 THEN
        FOR v_field IN SELECT * FROM jsonb_array_elements(p_initial_fields) LOOP
            EXECUTE format('SELECT %L::public.field_data_type', v_field->>'data_type') INTO v_data_type;
            v_display_name := COALESCE(NULLIF(v_field->>'display_name', ''), v_field->>'field_name');
            v_field_name := public.to_snake_case(v_field->>'field_name');

            IF NOT (v_field_name ~ '^[a-z][a-z0-9_]*$') THEN
                RETURN jsonb_build_object(
                    'success', FALSE,
                    'error', format('Invalid field name: "%s".', v_field_name),
                    'error_code', 'INVALID_FIELD_NAME'
                );
            END IF;

            INSERT INTO workbench.udt_dataset_fields (
                table_id, field_name, display_name, data_type, field_order,
                is_required, default_value, validation_rules, user_id
            )
            VALUES (
                v_table_id, v_field_name, v_display_name, v_data_type,
                COALESCE((v_field->>'field_order')::INT, 0),
                COALESCE((v_field->>'is_required')::BOOLEAN, FALSE),
                COALESCE(v_field->'default_value', 'null'::jsonb),
                COALESCE(v_field->'validation_rules', 'null'::jsonb),
                (select auth.uid())
            )
            RETURNING id INTO v_field_id;
        END LOOP;
        -- A table created WITH its columns is created from data (save a markdown
        -- table, import): its rows follow from the caller. A starter row here was
        -- the phantom blank row every "Save table as data" showed (RC-B6).
    ELSE
        EXECUTE format('SELECT %L::public.field_data_type', 'integer') INTO v_data_type;
        INSERT INTO workbench.udt_dataset_fields (
            table_id, field_name, display_name, data_type, field_order,
            is_required, default_value, validation_rules, user_id
        )
        VALUES (v_table_id, 'id', 'ID', v_data_type, 0, TRUE, 'null'::jsonb, 'null'::jsonb, (select auth.uid()))
        RETURNING id INTO v_field_id;

        -- A BLANK table keeps its one starter row to type into.
        INSERT INTO workbench.udt_dataset_rows (table_id, data, user_id)
        VALUES (v_table_id, '{}'::jsonb, (select auth.uid()))
        RETURNING id INTO v_initial_row_id;
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'table_id', v_table_id,
        'table_name', p_table_name,
        'message', 'Table created successfully'
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', FALSE,
        'error', format('Failed to create table: %s', SQLERRM),
        'error_code', 'UNEXPECTED_ERROR'
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_user_list(p_list_name character varying, p_description text, p_user_id uuid, p_is_public boolean, p_authenticated_read boolean DEFAULT false, p_public_read boolean DEFAULT false, p_items jsonb DEFAULT '[]'::jsonb, p_organization_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
    v_list_id uuid;
    v_item jsonb;
    v_result jsonb;
begin
    if p_organization_id is null then
      raise exception 'create_user_list requires the initiating organization_id'
        using errcode = '23502',
              hint = 'Pass the organization the person is working in. Never infer it.';
    end if;
    if not (auth.role() = 'service_role' or p_user_id = (select auth.uid())) then
      raise exception 'access denied: caller is not the target user' using errcode = '42501';
    end if;
    if auth.role() is distinct from 'service_role'
       and not iam.has_org_access(p_organization_id) then
      raise exception 'access denied: caller cannot file a list in this organization' using errcode = '42501',
            detail = jsonb_build_object('organization_id', p_organization_id)::text;
    end if;

    -- lane LISTS-AFTER-SWITCH: an organization whose Data tables moved to the new system makes
    -- its new lists there (a Table of choices), never in the older lists nothing reads.
    if platform.older_tables_switched(p_organization_id) then
      return platform._pick_list_born_in_store(p_organization_id, p_list_name, p_description, coalesce(p_items, '[]'::jsonb));
    end if;

    insert into workbench.udt_structured_lists (
        list_name, description, user_id, is_public, public_read, organization_id
    )
    values (
        p_list_name, p_description, p_user_id, p_is_public, p_public_read, p_organization_id
    )
    returning id into v_list_id;

    for v_item in select * from jsonb_array_elements(p_items) loop
        insert into workbench.udt_structured_list_items (
            label, description, help_text, group_name,
            user_id, is_public, public_read, list_id, organization_id
        )
        values (
            v_item->>'Label', v_item->>'Description', v_item->>'Help Text', v_item->>'Group',
            p_user_id, p_is_public, p_public_read, v_list_id, p_organization_id
        );
    end loop;

    select jsonb_build_object(
        'list_id', l.id, 'list_name', l.list_name, 'description', l.description,
        'lives_in', 'older',
        'items', (
            select jsonb_agg(jsonb_build_object(
                'id', i.id, 'label', i.label, 'description', i.description,
                'help_text', i.help_text, 'group_name', i.group_name
            ))
            from workbench.udt_structured_list_items i where i.list_id = l.id
        )
    )
    into v_result
    from workbench.udt_structured_lists l
    where l.id = v_list_id;

    return v_result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.create_user_table_with_fields(p_table_name text, p_description text DEFAULT NULL::text, p_is_public boolean DEFAULT false, p_organization_id uuid DEFAULT NULL::uuid, p_project_id uuid DEFAULT NULL::uuid, p_task_id uuid DEFAULT NULL::uuid, p_fields jsonb DEFAULT '[]'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_table_id uuid;
  v_field    jsonb;
BEGIN
  INSERT INTO workbench.udt_datasets (
    table_name, description, is_public,
    organization_id, project_id, task_id, user_id
  )
  VALUES (
    p_table_name, p_description, p_is_public,
    p_organization_id, p_project_id, p_task_id, (select auth.uid())
  )
  RETURNING id INTO v_table_id;

  FOR v_field IN SELECT * FROM jsonb_array_elements(p_fields)
  LOOP
    INSERT INTO workbench.udt_dataset_fields (
      table_id, user_id,
      field_name, display_name,
      data_type, field_order, is_required,
      default_value, validation_rules,
      metadata
    )
    VALUES (
      v_table_id,
      (select auth.uid()),
      v_field->>'field_name',
      COALESCE(v_field->>'display_name', v_field->>'field_name'),
      COALESCE((v_field->>'data_type')::public.field_data_type, 'string'::public.field_data_type),
      COALESCE((v_field->>'field_order')::int, 0),
      COALESCE((v_field->>'is_required')::boolean, false),
      v_field->'default_value',
      v_field->'validation_rules',
      COALESCE(v_field->'metadata', '{}'::jsonb)
    );
  END LOOP;

  RETURN v_table_id;
END;
$function$;

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
$function$;

CREATE OR REPLACE FUNCTION public.delete_user_table(p_table_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare
    v_result jsonb;
    v_table_name text;
begin
    select table_name into v_table_name
    from workbench.udt_datasets
    where id = p_table_id
      and deleted_at is null;

    if v_table_name is not null then
        update workbench.udt_datasets
           set deleted_at = now()
         where id = p_table_id
           and deleted_at is null;

        v_result := jsonb_build_object(
            'success', true,
            'table_id', p_table_id,
            'table_name', v_table_name,
            'message', 'Table deleted successfully'
        );
    else
        v_result := jsonb_build_object('success', false, 'error', 'Table not found');
    end if;

    return v_result;
end;
$function$;

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
$function$;

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
$function$;

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
$function$;

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
$function$;

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
$function$;

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

CREATE OR REPLACE FUNCTION public.get_user_table_complete(p_table_id uuid, p_sort_field text DEFAULT NULL::text, p_sort_direction text DEFAULT 'asc'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if workbench.udt_dataset_access(p_table_id, 'viewer') is not true then
    raise exception 'viewer access required for this dataset' using errcode = '42501',
            detail = jsonb_build_object('table_id', p_table_id)::text;
  end if;
  -- lane OLDER-DOORS-AFTER-SWITCH: the same answer, marked moved when the table moved with its
  -- organization's Data tables switch (null for every live table).
  return public._d31_impl_get_user_table_complete(p_table_id, p_sort_field, p_sort_direction)
         || jsonb_build_object('moved_to', workbench.older_table_moved_to(p_table_id));
end;
$function$;

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
$function$;

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
$function$;

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
$function$;

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
$function$;

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
$function$;

CREATE OR REPLACE FUNCTION public.udt_backfill_autonumber(p_table_id uuid, p_field_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_field_name text;
  v_start bigint;
  v_numbered integer;
begin
  if auth.uid() is null then
    raise exception 'sign-in required' using errcode = '42501';
  end if;
  if workbench.udt_dataset_access(p_table_id, 'editor') is not true then
    raise exception 'editor access required for this dataset' using errcode = '42501',
            detail = jsonb_build_object('table_id', p_table_id)::text;
  end if;

  select field_name into v_field_name
  from workbench.udt_dataset_fields
  where id = p_field_id
    and table_id = p_table_id
    and deleted_at is null
    and metadata->'format'->>'id' = 'autonumber';
  if v_field_name is null then
    return jsonb_build_object('success', false, 'error', 'That column is not an Autonumber column of this table.');
  end if;

  perform pg_advisory_xact_lock(hashtextextended('udt_autonumber:' || p_field_id::text, 0));

  select coalesce(max((r.data->>v_field_name)::bigint), 0)
    into v_start
    from workbench.udt_dataset_rows r
    where r.table_id = p_table_id
      and (r.data->>v_field_name) ~ '^[0-9]{1,18}$';

  with todo as (
    select r.id, row_number() over (order by r.created_at, r.id) as n
    from workbench.udt_dataset_rows r
    where r.table_id = p_table_id
      and r.deleted_at is null
      and not coalesce((r.data->>v_field_name) ~ '^[0-9]{1,18}$', false)
  ),
  done as (
    update workbench.udt_dataset_rows r
       set data = coalesce(r.data, '{}'::jsonb) || jsonb_build_object(v_field_name, v_start + todo.n)
      from todo
     where r.id = todo.id
    returning 1
  )
  select count(*) into v_numbered from done;

  return jsonb_build_object('success', true, 'numbered', v_numbered, 'highest', v_start + v_numbered);
end;
$function$;

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
  IF NOT FOUND THEN raise exception 'udt_bulk_write: table not found' using errcode = 'P0001', detail = jsonb_build_object('table_id', p_table_id)::text; END IF;
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
        raise exception 'udt_bulk_write: update op for row needs a "data" object' using errcode = 'P0001', detail = jsonb_build_object('row_id', v_row_id)::text;
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
         WHERE table_id = p_table_id AND field_name = v_op ->> 'field_name' AND deleted_at IS NULL
      ) THEN
        raise exception 'udt_bulk_write: cell op references undeclared field % on this table', v_op ->> 'field_name' using errcode = 'P0001', detail = jsonb_build_object('table_id', p_table_id)::text;
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
$function$;

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
  IF NOT FOUND THEN raise exception 'udt_change_field_type: table not found' using errcode = 'P0001', detail = jsonb_build_object('table_id', p_table_id)::text; END IF;
  IF NOT workbench.udt_dataset_access(p_table_id, 'editor') THEN
    RAISE EXCEPTION 'udt_change_field_type: caller lacks editor permission';
  END IF;
  SELECT * INTO v_field FROM workbench.udt_dataset_fields WHERE id = p_field_id AND table_id = p_table_id AND deleted_at IS NULL;
  IF NOT FOUND THEN raise exception 'udt_change_field_type: field not in this table' using errcode = 'P0001', detail = jsonb_build_object('field_id', p_field_id, 'table_id', p_table_id)::text; END IF;

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
$function$;

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
$function$;

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
    raise exception 'editor access required for this dataset' using errcode = '42501',
            detail = jsonb_build_object('table_id', p_table_id)::text;
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
$function$;

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
$function$;

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
    raise exception 'editor access required for this dataset' using errcode = '42501',
            detail = jsonb_build_object('table_id', p_table_id)::text;
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
$function$;

CREATE OR REPLACE FUNCTION public.udt_set_table_row_actions(p_table_id uuid, p_row_actions jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_action jsonb;
  v_step jsonb;
  v_kind text;
  v_set text;
  v_field text;
  v_name text;
  v_metadata jsonb;
  v_ids text[] := '{}';
begin
  if auth.uid() is null then
    raise exception 'sign-in required' using errcode = '42501';
  end if;
  if workbench.udt_dataset_access(p_table_id, 'editor') is not true then
    raise exception 'editor access required for this dataset' using errcode = '42501',
            detail = jsonb_build_object('table_id', p_table_id)::text;
  end if;

  if p_row_actions is not null and jsonb_typeof(p_row_actions) <> 'null' then
    if jsonb_typeof(p_row_actions) <> 'array' then
      raise exception 'row_actions must be an array' using errcode = '22023';
    end if;
    if jsonb_array_length(p_row_actions) > 24 then
      raise exception 'a table can have at most 24 row actions' using errcode = '22023';
    end if;
    if length(p_row_actions::text) > 200000 then
      raise exception 'row_actions is larger than 200 KB' using errcode = '22023';
    end if;
    for v_action in select * from jsonb_array_elements(p_row_actions) loop
      if jsonb_typeof(v_action) <> 'object' then
        raise exception 'each row action must be an object' using errcode = '22023';
      end if;
      if coalesce(v_action->>'id', '') = '' then
        raise exception 'a row action is missing its id' using errcode = '22023';
      end if;
      if v_action->>'id' = any (v_ids) then
        raise exception 'two row actions share the id "%"', v_action->>'id' using errcode = '22023';
      end if;
      v_ids := v_ids || (v_action->>'id');
      v_name := btrim(coalesce(v_action->>'name', ''));
      if v_name = '' then
        raise exception 'a row action is missing its name' using errcode = '22023';
      end if;
      if length(v_name) > 80 then
        raise exception 'row action name "%" is longer than 80 characters', left(v_name, 20) using errcode = '22023';
      end if;
      v_kind := coalesce(v_action->>'kind', 'update');
      if v_kind = 'agent' then
        if btrim(coalesce(v_action->>'prompt', '')) = '' then
          raise exception 'row action "%" asks an agent but has no prompt', v_name using errcode = '22023';
        end if;
      elsif v_kind = 'update' then
        if jsonb_typeof(v_action->'steps') <> 'array' or jsonb_array_length(v_action->'steps') = 0 then
          raise exception 'row action "%" has no changes', v_name using errcode = '22023';
        end if;
        if jsonb_array_length(v_action->'steps') > 60 then
          raise exception 'row action "%" changes more than 60 columns', v_name using errcode = '22023';
        end if;
        for v_step in select * from jsonb_array_elements(v_action->'steps') loop
          v_field := v_step->>'field';
          if v_field is null or not exists (
            select 1 from workbench.udt_dataset_fields
            where table_id = p_table_id and field_name = v_field and deleted_at is null
          ) then
            raise exception 'row action "%" names a column "%" that is not on this table', v_name, coalesce(v_field, '') using errcode = '22023';
          end if;
          if exists (
            select 1 from workbench.udt_dataset_fields
            where table_id = p_table_id and field_name = v_field and deleted_at is null
              and metadata->'format'->>'id' in ('formula', 'created_time', 'modified_time', 'autonumber')
          ) then
            raise exception 'row action "%" sets the calculated column "%"', v_name, v_field using errcode = '22023';
          end if;
          v_set := v_step->>'set';
          if v_set not in ('value', 'clear', 'formula') then
            raise exception 'row action "%": step.set must be value, clear or formula', v_name using errcode = '22023';
          end if;
          if v_set = 'formula' and btrim(coalesce(v_step->>'expression', '')) = '' then
            raise exception 'row action "%": the formula for "%" is empty', v_name, v_field using errcode = '22023';
          end if;
        end loop;
      else
        raise exception 'row action "%": kind must be update or agent', v_name using errcode = '22023';
      end if;
    end loop;
    if jsonb_array_length(p_row_actions) = 0 then
      p_row_actions := null;
    end if;
  else
    p_row_actions := null;
  end if;

  update workbench.udt_datasets
     set metadata = case
           when p_row_actions is null then coalesce(metadata, '{}'::jsonb) - 'row_actions'
           else jsonb_set(coalesce(metadata, '{}'::jsonb), '{row_actions}', p_row_actions, true)
         end
   where id = p_table_id and deleted_at is null
   returning metadata into v_metadata;
  if v_metadata is null then
    perform platform.refuse_not_found(format('dataset %s not found', p_table_id));
  end if;

  return jsonb_build_object('success', true, 'row_actions', coalesce(v_metadata -> 'row_actions', '[]'::jsonb));
end;
$function$;

CREATE OR REPLACE FUNCTION public.udt_set_table_row_label(p_table_id uuid, p_row_label jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_kind text;
  v_field text;
  v_expression text;
  v_metadata jsonb;
begin
  if auth.uid() is null then
    raise exception 'sign-in required' using errcode = '42501';
  end if;
  if workbench.udt_dataset_access(p_table_id, 'editor') is not true then
    raise exception 'editor access required for this dataset' using errcode = '42501',
            detail = jsonb_build_object('table_id', p_table_id)::text;
  end if;

  if p_row_label is not null and jsonb_typeof(p_row_label) <> 'null' then
    if jsonb_typeof(p_row_label) <> 'object' then
      raise exception 'row_label must be an object' using errcode = '22023';
    end if;
    v_kind := p_row_label->>'kind';
    if v_kind = 'field' then
      v_field := p_row_label->>'field';
      if v_field is null or not exists (
        select 1 from workbench.udt_dataset_fields
        where table_id = p_table_id and field_name = v_field and deleted_at is null
      ) then
        raise exception 'row_label.field "%" is not a column of this table', coalesce(v_field, '') using errcode = '22023';
      end if;
      p_row_label := jsonb_build_object('kind', 'field', 'field', v_field);
    elsif v_kind = 'formula' then
      v_expression := p_row_label->>'expression';
      if v_expression is null or btrim(v_expression) = '' then
        raise exception 'row_label.expression is empty' using errcode = '22023';
      end if;
      if length(v_expression) > 2000 then
        raise exception 'row_label.expression is longer than 2000 characters' using errcode = '22023';
      end if;
      p_row_label := jsonb_build_object('kind', 'formula', 'expression', v_expression);
    else
      raise exception 'row_label.kind must be "field" or "formula", got "%"', coalesce(v_kind, '') using errcode = '22023';
    end if;
  else
    p_row_label := null;
  end if;

  update workbench.udt_datasets
     set metadata = case
           when p_row_label is null then coalesce(metadata, '{}'::jsonb) - 'row_label'
           else jsonb_set(coalesce(metadata, '{}'::jsonb), '{row_label}', p_row_label, true)
         end
   where id = p_table_id and deleted_at is null
   returning metadata into v_metadata;
  if v_metadata is null then
    perform platform.refuse_not_found(format('dataset %s not found', p_table_id));
  end if;

  return jsonb_build_object('success', true, 'row_label', v_metadata -> 'row_label');
end;
$function$;

CREATE OR REPLACE FUNCTION public.udt_set_table_style(p_table_id uuid, p_path text[], p_value jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_style jsonb;
  v_depth int;
  v_head text;
  v_parent text[];
  i int;
begin
  if workbench.udt_dataset_access(p_table_id, 'editor') is not true then
    raise exception 'editor access required for this dataset' using errcode = '42501',
            detail = jsonb_build_object('table_id', p_table_id)::text;
  end if;

  v_depth := coalesce(array_length(p_path, 1), 0);
  if v_depth < 1 or v_depth > 3 then
    raise exception 'style path must have 1 to 3 segments, got %', v_depth using errcode = '22023';
  end if;
  v_head := p_path[1];
  if v_head not in ('colorBy', 'rules', 'rows', 'cells', 'columns') then
    raise exception 'unknown style key "%": expected colorBy, rules, rows, cells or columns', v_head using errcode = '22023';
  end if;
  if (v_head in ('colorBy', 'rules') and v_depth <> 1)
     or (v_head in ('rows', 'columns') and v_depth <> 2)
     or (v_head = 'cells' and v_depth <> 3) then
    raise exception 'style key "%" does not take a path of % segments', v_head, v_depth using errcode = '22023';
  end if;

  select coalesce(metadata -> 'style', '{}'::jsonb)
    into v_style
    from workbench.udt_datasets
   where id = p_table_id
   for update;

  if v_style is null then
    perform platform.refuse_not_found(format('dataset %s not found', p_table_id));
  end if;
  if jsonb_typeof(v_style) <> 'object' then
    v_style := '{}'::jsonb;
  end if;

  if p_value is null or p_value = 'null'::jsonb then
    -- Delete the leaf, then prune empty parents so the blob never accumulates
    -- `{ "cells": { "<row>": {} } }` husks.
    v_style := v_style #- p_path;
    for i in reverse (v_depth - 1)..1 loop
      v_parent := p_path[1:i];
      if v_style #> v_parent = '{}'::jsonb then
        v_style := v_style #- v_parent;
      end if;
    end loop;
  else
    -- jsonb_set only creates the LAST segment; make every parent exist first.
    for i in 1..(v_depth - 1) loop
      v_parent := p_path[1:i];
      if v_style #> v_parent is null or jsonb_typeof(v_style #> v_parent) <> 'object' then
        v_style := jsonb_set(v_style, v_parent, '{}'::jsonb, true);
      end if;
    end loop;
    v_style := jsonb_set(v_style, p_path, p_value, true);
  end if;

  v_style := v_style || jsonb_build_object('version', 1);

  update workbench.udt_datasets
     set metadata = jsonb_set(coalesce(metadata, '{}'::jsonb), array['style'], v_style, true),
         updated_at = now()
   where id = p_table_id;

  return jsonb_build_object('success', true, 'table_id', p_table_id, 'style', v_style);
end;
$function$;

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
$function$;

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
  IF NOT FOUND THEN raise exception 'udt_upsert_cell: table not found' using errcode = 'P0001', detail = jsonb_build_object('table_id', p_table_id)::text; END IF;
  IF NOT workbench.udt_dataset_access(p_table_id, 'editor') THEN
    RAISE EXCEPTION 'udt_upsert_cell: caller lacks editor permission';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM workbench.udt_dataset_fields WHERE table_id = p_table_id AND field_name = p_field_name AND deleted_at IS NULL) THEN
    raise exception 'udt_upsert_cell: field % not in this table', p_field_name using errcode = 'P0001', detail = jsonb_build_object('table_id', p_table_id)::text;
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
  IF NOT FOUND THEN raise exception 'udt_upsert_cell: row not found in this table' using errcode = 'P0001', detail = jsonb_build_object('row_id', p_row_id, 'table_id', p_table_id)::text; END IF;
  RETURN to_jsonb(v_row);
END;
$function$;

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
    raise exception 'udt_upsert_row: table not found' using errcode = 'P0001', detail = jsonb_build_object('table_id', p_table_id)::text;
  END IF;
  IF NOT workbench.udt_dataset_access(p_table_id, 'editor') THEN
    raise exception 'udt_upsert_row: caller lacks editor permission on this table' using errcode = 'P0001', detail = jsonb_build_object('table_id', p_table_id)::text;
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
      raise exception 'udt_upsert_row: row not found in this table' using errcode = 'P0001', detail = jsonb_build_object('row_id', p_row_id, 'table_id', p_table_id)::text;
    END IF;
  END IF;
  RETURN to_jsonb(v_row);
END;
$function$;

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
$function$;

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
$function$;

CREATE OR REPLACE FUNCTION public.update_field_metadata(p_field_id uuid, p_display_name text DEFAULT NULL::text, p_is_required boolean DEFAULT NULL::boolean, p_field_order integer DEFAULT NULL::integer, p_validation_rules jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_result JSONB;
    v_updated_field JSONB;
    v_table_id UUID;
BEGIN
    SELECT table_id INTO v_table_id
    FROM workbench.udt_dataset_fields
    WHERE id = p_field_id;

    UPDATE workbench.udt_dataset_fields
    SET
        display_name = COALESCE(p_display_name, display_name),
        is_required = COALESCE(p_is_required, is_required),
        field_order = COALESCE(p_field_order, field_order),
        validation_rules = COALESCE(p_validation_rules, validation_rules),
        updated_at = NOW()
    WHERE id = p_field_id
    RETURNING jsonb_build_object(
        'id', id,
        'field_name', field_name,
        'display_name', display_name,
        'data_type', data_type,
        'field_order', field_order,
        'is_required', is_required,
        'validation_rules', validation_rules,
        'updated_at', updated_at
    ) INTO v_updated_field;

    IF v_updated_field IS NOT NULL THEN
        UPDATE workbench.udt_datasets
        SET version = version + 1, updated_at = NOW()
        WHERE id = v_table_id;

        v_result := jsonb_build_object('success', true, 'field', v_updated_field);
    ELSE
        v_result := jsonb_build_object('success', false, 'error', 'Field not found or update failed');
    END IF;

    RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_user_table_config(p_table_id uuid, p_table_updates jsonb DEFAULT NULL::jsonb, p_field_updates jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if workbench.udt_dataset_access(p_table_id, 'editor') is not true then
    raise exception 'editor access required for this dataset' using errcode = '42501',
            detail = jsonb_build_object('table_id', p_table_id)::text;
  end if;
  return public._d31_impl_update_user_table_config(p_table_id, p_table_updates, p_field_updates);
end;
$function$;

CREATE OR REPLACE FUNCTION public.update_user_table_default_sort(p_table_id uuid, p_sort_field text DEFAULT NULL::text, p_sort_direction text DEFAULT 'asc'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_user_id UUID;
    v_current_config JSONB;
    v_new_config JSONB;
BEGIN
    v_user_id := auth.uid();

    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Authentication required');
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM workbench.udt_datasets
        WHERE id = p_table_id AND user_id = v_user_id
    ) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Table not found or access denied');
    END IF;

    SELECT COALESCE(row_ordering_config, '{}'::jsonb) INTO v_current_config
    FROM workbench.udt_datasets
    WHERE id = p_table_id;

    IF p_sort_field IS NULL THEN
        v_new_config := v_current_config - 'default_sort';
    ELSE
        v_new_config := v_current_config || jsonb_build_object(
            'default_sort', jsonb_build_object(
                'field', p_sort_field,
                'direction', p_sort_direction
            )
        );
    END IF;

    UPDATE workbench.udt_datasets
    SET row_ordering_config = v_new_config, updated_at = now()
    WHERE id = p_table_id AND user_id = v_user_id;

    RETURN jsonb_build_object('success', true, 'config', v_new_config);

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_user_table_metadata(p_table_id uuid, p_table_name text DEFAULT NULL::text, p_description text DEFAULT NULL::text, p_is_public boolean DEFAULT NULL::boolean, p_authenticated_read boolean DEFAULT NULL::boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if workbench.udt_dataset_access(p_table_id, 'editor') is not true then
    raise exception 'editor access required for this dataset' using errcode = '42501',
            detail = jsonb_build_object('table_id', p_table_id)::text;
  end if;
  return public._d31_impl_update_user_table_metadata(
    p_table_id, p_table_name, p_description, p_is_public, p_authenticated_read
  );
end;
$function$;

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
$function$;
