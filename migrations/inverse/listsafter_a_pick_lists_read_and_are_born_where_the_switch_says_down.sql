-- chair-step: INVERSE of migrations/campaign/listsafter_a_pick_lists_read_and_are_born_where_the_switch_says.sql (lane LISTS-AFTER-SWITCH). Puts back the fifteen bodies exactly as production held them before the file (the based-on bodies: the list doors read only the older lists again, create_user_list makes an older list in every organization, the older table reads answer unmarked), turns the INSERT guard into a pass-through (its two triggers stay bound: dropping a trigger on the older tables takes the same lock as creating one, and a pass-through changes nothing), and drops the functions, the two server views and the reserved metadata key the file added. Lists born in the store while the file was on stay in the store as ordinary Tables (data, not schema); the older list doors no longer list them.
-- based-on: workbench._switched_org_makes_nothing_older() a26e78a5c97a06f3d73b1f4fb58629230153a05c342b0f83e6f78b242d671ab6
-- based-on: public._d31_impl_get_user_list_with_items(uuid) f69fb4b47d929654eebbcefae3dfad5490d982285bc50ce30f77bcc39a32f8cb
-- based-on: public.create_user_list(character varying, text, uuid, boolean, boolean, boolean, jsonb, uuid) cadd365d9f9f99dd1a55afce508c8de99c71abf7c75923242991dca3c7b57ea4
-- based-on: public.export_user_table_as_csv(uuid) adfded6b8be12bd09c099f343f8da006da6cbaef9c9a152640e9806a8270f6ee
-- based-on: public.export_user_table_as_csv(uuid, text, text) 73e3300d7002bd80cb785492adb1b717d537a5827042f437621ddf84bc48ac54
-- based-on: public.get_structured_list_for_selection(uuid) b92dde7acd310c74b8d9b318040bf07f1079f379c5340a7e6e98bd269fd6c707
-- based-on: public.get_table_cell(jsonb) f0089225ecadfd518dd4eb54f4c4938780c05020f49077a361da33f2258ed781
-- based-on: public.get_table_column(jsonb) ba589ce88e569c35f4a1c540e59ba3ba8f41342e250242fbab4ad2b6234a5c54
-- based-on: public.get_table_row(jsonb) b0975e06062f3da28f41146d01397b0c47498fe8edc8da1c403cd2c6fdb9c803
-- based-on: public.get_user_list_with_items(uuid) 3443d0cc058eec802feb4299ed791c671d6ab20b60b84efdb1fd15e016fc79e0
-- based-on: public.get_user_lists_summary(uuid) 993911bdeae59d9f34b198f8850f3bc84a856bf0eca4b2e4ee28d279596df159
-- based-on: public.list_table_columns(jsonb) 587dc2b7ee964b350a68f7d803bcbcde8d671f7f749130fdc9ffed2bd5ec0c5b
-- based-on: public.list_table_rows(jsonb, integer, integer, text, text) 901fdfaa131d806b0e52581129ad05daaf69531e8dfd0f4760bf18b305176b69
-- based-on: public.udt_column_facets(uuid, text, integer, text) b2af38f3423ac55304dd9fba5586ab439b8955b42683606e0cfc0c959de4cccc
-- based-on: public.udt_table_profile(uuid, integer) c3f81849ee9598959b475a82cec841844a5502e3a9f0b07f7a25cc2e28ce9876
-- based-on: public.update_user_list(uuid, character varying, text, boolean, boolean, boolean, jsonb) e31689512a23fb1f04696c2c5aaff23a07d29b313bc41c7efb701d34747e40dd
-- lane: LISTS-AFTER-SWITCH

create or replace function workbench._switched_org_makes_nothing_older()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog'
as $$
begin
  -- INVERSE of LISTS-AFTER-SWITCH: a pass-through; the triggers stay bound.
  return new;
end;
$$;

CREATE OR REPLACE FUNCTION public._d31_impl_get_user_list_with_items(p_list_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
    v_result jsonb;
    v_is_editor boolean := false;
begin
    select (l.user_id = (select auth.uid())
            or iam.has_access('structured_list', l.id, 'editor'::public.permission_level))
      into v_is_editor
    from workbench.udt_structured_lists l
    where l.id = p_list_id
      and (l.deleted_at is null or platform._older_list_moved_by_switch(l.id));

    select jsonb_build_object(
        'list_id', l.id, 'list_name', l.list_name, 'description', l.description,
        'created_at', l.created_at, 'updated_at', l.updated_at,
        'is_public', l.is_public, 'public_read', l.public_read,
        -- lane OLDER-DOORS-AFTER-SWITCH: marked moved when the list moved with the switch.
        'moved_to', workbench.older_table_moved_to(l.id),
        'items_grouped', (
            select jsonb_object_agg(coalesce(group_name, 'Ungrouped'), items)
            from (
                select
                    group_name,
                    jsonb_agg(jsonb_build_object(
                        'id', i.id, 'label', i.label,
                        'description', case when v_is_editor then i.description else null end,
                        'help_text', i.help_text
                    ) order by i.created_at) as items
                from workbench.udt_structured_list_items i
                where i.list_id = l.id
                  and i.deleted_at is null
                group by group_name
            ) as grouped_items
        )
    )
    into v_result
    from workbench.udt_structured_lists l
    where l.id = p_list_id
      and (l.deleted_at is null or platform._older_list_moved_by_switch(l.id));
    return v_result;
end;
$function$
;

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
      raise exception 'access denied: caller cannot file a list in organization %', p_organization_id
        using errcode = '42501';
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

    v_query := 'SELECT id, data FROM workbench.udt_dataset_rows WHERE table_id = $1';

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

    RETURN v_csv;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_structured_list_for_selection(p_list_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_result jsonb;
begin
    select jsonb_build_object(
        'list_id', l.id,
        'list_name', l.list_name,
        'description', l.description,
        'is_public', l.is_public,
        'public_read', l.public_read,
        'moved_to', workbench.older_table_moved_to(l.id),
        'items_grouped', (
            select jsonb_object_agg(coalesce(group_name, 'Ungrouped'), items)
            from (
                select
                    group_name,
                    jsonb_agg(jsonb_build_object(
                        'id', i.id,
                        'label', i.label,
                        'help_text', i.help_text,
                        'group_name', i.group_name,
                        'icon_name', i.icon_name
                    ) order by i.created_at) as items
                from workbench.udt_structured_list_items i
                where i.list_id = l.id
                  and i.deleted_at is null
                group by group_name
            ) as grouped_items
        )
    )
    into v_result
    from workbench.udt_structured_lists l
    where l.id = p_list_id
      -- lane OLDER-DOORS-AFTER-SWITCH: a list that moved with the switch still reads (marked moved).
      and (l.deleted_at is null or platform._older_list_moved_by_switch(l.id))
      -- 🚨 THE GATE (DD-169 batch 3). Mirrors udt_structured_lists' std_select + pub_read.
      and (l.created_by = (select auth.uid())
        or l.visibility = 'public'::platform.visibility
        or iam.has_access('structured_list', l.id, 'viewer'::public.permission_level));
    return v_result;
end;
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
    AND d.id = v_row_id;

  IF v_value IS NULL THEN
    RETURN jsonb_build_object('value', null, 'field', v_resolved_field);
  END IF;

  RETURN jsonb_build_object('value', v_value, 'field', v_resolved_field);
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
  WHERE tf.table_id = v_table_id
    AND (
      (v_field_name IS NOT NULL AND tf.field_name = v_field_name)
      OR (v_field_name IS NULL AND v_display_name IS NOT NULL AND tf.display_name = v_display_name)
    )
  LIMIT 1;

  IF j IS NULL THEN
    RAISE EXCEPTION 'Column not found';
  END IF;

  RETURN j;
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
  );

  IF j IS NULL THEN
    RAISE EXCEPTION 'Row not found';
  END IF;

  RETURN j;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_user_list_with_items(p_list_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if (
    auth.role() = 'service_role'
    or exists (
      select 1 from workbench.udt_structured_lists l
      where l.id = p_list_id
        -- lane OLDER-DOORS-AFTER-SWITCH: a list that moved with the switch still reads (marked moved).
        and (l.deleted_at is null or platform._older_list_moved_by_switch(l.id))
        and (l.is_public or l.public_read or l.user_id = (select auth.uid()))
    )
    or coalesce(iam.has_access('structured_list', p_list_id, 'viewer'::public.permission_level), false)
  ) is not true then
    raise exception 'viewer access required for list %', p_list_id using errcode = '42501';
  end if;
  return public._d31_impl_get_user_list_with_items(p_list_id);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_user_lists_summary(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_result jsonb;
begin
  if (auth.role() = 'service_role' or p_user_id = ( SELECT auth.uid())) is not true then
    raise exception 'access denied: caller is not the target user'
      using errcode = '42501';
  end if;

  select jsonb_agg(
    jsonb_build_object(
      'list_id', l.id,
      'list_name', l.list_name,
      'description', l.description,
      'created_at', l.created_at,
      'updated_at', l.updated_at,
      'item_count', (
        select count(*)
        from workbench.udt_structured_list_items i
        where i.list_id = l.id
          and i.deleted_at is null
      ),
      'group_count', (
        select count(distinct i.group_name)
        from workbench.udt_structured_list_items i
        where i.list_id = l.id
          and i.deleted_at is null
      )
    )
    order by l.created_at desc
  )
  into v_result
  from workbench.udt_structured_lists l
  where l.user_id = p_user_id
    and l.deleted_at is null;

  return coalesce(v_result, '[]'::jsonb);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.list_table_columns(ref jsonb)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
  SELECT COALESCE(
    jsonb_agg(to_jsonb(tf) - 'validation_rules' - 'default_value' ORDER BY tf.field_order, tf.created_at),
    '[]'::jsonb
  )
  FROM workbench.udt_dataset_fields tf
  WHERE tf.table_id = (ref->>'table_id')::uuid;
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
      'total', (SELECT COUNT(*)::int FROM workbench.udt_dataset_rows dd WHERE dd.table_id = v_table_id)
    )
    FROM (
      SELECT d.*
      FROM workbench.udt_dataset_rows d
      WHERE d.table_id = v_table_id
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

  RETURN COALESCE(j, jsonb_build_object('rows','[]'::jsonb,'total',0));
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
    FROM workbench.udt_dataset_rows WHERE table_id = p_table_id;

    SELECT jsonb_build_object(
        'success',    true,
        'table_id',   p_table_id,
        'total_rows', v_rows,
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
$function$
;

CREATE OR REPLACE FUNCTION public.update_user_list(p_list_id uuid, p_list_name character varying DEFAULT NULL::character varying, p_description text DEFAULT NULL::text, p_is_public boolean DEFAULT NULL::boolean, p_authenticated_read boolean DEFAULT NULL::boolean, p_public_read boolean DEFAULT NULL::boolean, p_items jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if (
    auth.role() = 'service_role'
    or exists (
      select 1 from workbench.udt_structured_lists l
      where l.id = p_list_id and l.user_id = (select auth.uid())
    )
  ) is not true then
    raise exception 'owner access required for list %', p_list_id using errcode = '42501';
  end if;
  return public._d31_impl_update_user_list(
    p_list_id, p_list_name, p_description, p_is_public,
    p_authenticated_read, p_public_read, p_items
  );
end;
$function$
;

drop view if exists workbench.pick_list_item_live;
drop view if exists workbench.pick_list_live;
drop function if exists custom.where_lists_live(uuid[]);
drop function if exists platform._pick_list_born_in_store(uuid, text, text, jsonb);
drop function if exists platform._store_pick_list_document(uuid, uuid, text);
drop function if exists platform.list_lives_in(uuid);
drop function if exists platform._is_store_pick_list(jsonb);
drop function if exists platform.older_tables_switched(uuid);

delete from platform.client_callable_door
 where declared_by = 'migrations/campaign/listsafter_a_pick_lists_read_and_are_born_where_the_switch_says.sql (lane LISTS-AFTER-SWITCH)';
delete from platform.metadata_reserved_keys where table_token = 'record' and key = 'pick_list';
