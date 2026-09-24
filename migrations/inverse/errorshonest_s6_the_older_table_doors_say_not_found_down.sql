-- chair-step: this restores the 5 live bodies in the five older-store read doors (public.get_full_table, get_table_cell, get_table_column, get_table_row, list_table_rows) that errorshonest_s6_the_older_table_doors_say_not_found.sql replaced, byte-for-byte as read from production on 2026-09-24. Undoing it returns each of their not-found refusals to HTTP 500 through PostgREST; called directly nothing changes either way.
-- lane: ERRORS-HONEST
-- based-on: public.get_full_table(jsonb) e1ced80eaa3580041065877b107db1240c005172aae9f414f8844d1add6277ff
-- based-on: public.get_table_cell(jsonb) a2c094dece970010d18325d0536bcf7560a2bca07c6c79f59c085ccddd11001f
-- based-on: public.get_table_column(jsonb) 0ecf1d309b1f5758594c4c008216724debca3fcfab5d75230a925429c54ae797
-- based-on: public.get_table_row(jsonb) a7f9d4fa06428f0b3572800102c691b649d3f6c105c052d5070d798cbbf9ed1d
-- based-on: public.list_table_rows(jsonb, integer, integer, text, text) d320c8d5a70deb3559e7d531716351e0c7a8df42979b6bb8e985189c26f42e80

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
    RAISE EXCEPTION
      'dataset % is not available to this account — it may not exist, the table_name may not match, or your access may not reach it',
      v_table_id
      USING ERRCODE = 'P0002';
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
    )
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
    RAISE EXCEPTION
      'dataset % is not available to this account — it may not exist, the table_name may not match, or your access may not reach it',
      v_table_id
      USING ERRCODE = 'P0002';
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
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM workbench.udt_datasets t
    WHERE t.id = v_table_id
      AND (v_table_name IS NULL OR t.table_name = v_table_name)
  ) THEN
    RAISE EXCEPTION
      'dataset % is not available to this account — it may not exist, the table_name may not match, or your access may not reach it',
      v_table_id
      USING ERRCODE = 'P0002';
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
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM workbench.udt_datasets t
    WHERE t.id = v_table_id
      AND (v_table_name IS NULL OR t.table_name = v_table_name)
  ) THEN
    RAISE EXCEPTION
      'dataset % is not available to this account — it may not exist, the table_name may not match, or your access may not reach it',
      v_table_id
      USING ERRCODE = 'P0002';
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
    RAISE EXCEPTION
      'dataset % is not available to this account — it may not exist, the table_name may not match, or your access may not reach it',
      v_table_id
      USING ERRCODE = 'P0002';
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
$function$;
