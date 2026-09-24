-- chair-step: this REPLACES the bodies of the five older-store read doors (public.get_full_table, get_table_cell, get_table_column, get_table_row, list_table_rows), changing ONE statement in each: the "dataset is not available to this account" refusal is raised as PostgREST's own error shape so it answers HTTP 404 instead of HTTP 500, keeping the error code P0002 and the message word for word. Nothing else in any body changes; no table, column, policy, trigger or grant is touched; nothing is written. Inverse: migrations/inverse/activeorgpages_a_table_she_cannot_open_answers_not_found_never_a_fault_down.sql restores the five live bodies verbatim.
-- lane: ACTIVE-ORG-PAGES
-- based-on: public.get_full_table(jsonb) 2db0bcb3628c1f7c9091a876fbaf47c2afd7cc734068bbe47a093fbf0a7dfac0
-- based-on: public.get_table_cell(jsonb) 48108e9e072f228514dbbd2811763517c91b5a044600060de08c7e776cab4511
-- based-on: public.get_table_column(jsonb) 3a90d15bd9e56a5ded65ca8605b65647fcd0b48e41f23578b396b8cdb4cb64c7
-- based-on: public.get_table_row(jsonb) ffc59fea14f286767f99bdec1d0543a3d0a45d8d88d0f1d9cc7dc4b5f1bc6d0d
-- based-on: public.list_table_rows(jsonb, integer, integer, text, text) e4987df669ac114b13dbd1a611070645f0a2fd56e594c61ba1922c4be689b209
--
-- THE USE CASE (VERIFIER-17 H3). Alex Hart (test@test.com) is a shared-only member of admin's
-- Workspace. A teammate sends her the old /data/<id> link to the workspace's Service Calls, which
-- nobody has given her. The door correctly finds nothing (SECURITY INVOKER, RLS hides the row) and
-- raises P0002 — which PostgREST answers as HTTP 500, a server FAULT, on every such open. Measured
-- on production as test@test.com: `500 {"code":"P0002",…}`.
--
-- The refusal is right; the status is wrong. `RAISE SQLSTATE 'PGRST'` is PostgREST's documented way
-- to set the response: the MESSAGE json becomes the error body (so `error.code` is still P0002 and
-- every client check — features/data-tables/service.ts, matrx-ai datasets.py — reads the same
-- thing) and the DETAIL json sets the HTTP status to 404. Nothing about WHO may read changes: that
-- is still the row's own read rule, which never consulted the active organization.
--
-- Class census: 192 functions in the database raise P0002 through PostgREST; this file takes the
-- five older-store read doors the /data/<id> page opens with. The rest are recorded, not fixed, in
-- common-docs/projects/data-doctrine-adoption/v5/handoff-2026-09-20/PROGRESS-ACCESS-IS-PERSONAL.md.

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
    -- A refusal, not a fault: PostgREST answers SQLSTATE P0002 with HTTP 500. This keeps the
    -- error code P0002 (every client reads error.code) and answers HTTP 404.
    RAISE SQLSTATE 'PGRST' USING
      MESSAGE = json_build_object(
        'code', 'P0002',
        'message', format('dataset %s is not available to this account — it may not exist, the table_name may not match, or your access may not reach it', v_table_id),
        'details', NULL,
        'hint', NULL)::text,
      DETAIL = json_build_object('status', 404, 'headers', json_build_object())::text;
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
    -- A refusal, not a fault: PostgREST answers SQLSTATE P0002 with HTTP 500. This keeps the
    -- error code P0002 (every client reads error.code) and answers HTTP 404.
    RAISE SQLSTATE 'PGRST' USING
      MESSAGE = json_build_object(
        'code', 'P0002',
        'message', format('dataset %s is not available to this account — it may not exist, the table_name may not match, or your access may not reach it', v_table_id),
        'details', NULL,
        'hint', NULL)::text,
      DETAIL = json_build_object('status', 404, 'headers', json_build_object())::text;
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
    -- A refusal, not a fault: PostgREST answers SQLSTATE P0002 with HTTP 500. This keeps the
    -- error code P0002 (every client reads error.code) and answers HTTP 404.
    RAISE SQLSTATE 'PGRST' USING
      MESSAGE = json_build_object(
        'code', 'P0002',
        'message', format('dataset %s is not available to this account — it may not exist, the table_name may not match, or your access may not reach it', v_table_id),
        'details', NULL,
        'hint', NULL)::text,
      DETAIL = json_build_object('status', 404, 'headers', json_build_object())::text;
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
    -- A refusal, not a fault: PostgREST answers SQLSTATE P0002 with HTTP 500. This keeps the
    -- error code P0002 (every client reads error.code) and answers HTTP 404.
    RAISE SQLSTATE 'PGRST' USING
      MESSAGE = json_build_object(
        'code', 'P0002',
        'message', format('dataset %s is not available to this account — it may not exist, the table_name may not match, or your access may not reach it', v_table_id),
        'details', NULL,
        'hint', NULL)::text,
      DETAIL = json_build_object('status', 404, 'headers', json_build_object())::text;
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
    -- A refusal, not a fault: PostgREST answers SQLSTATE P0002 with HTTP 500. This keeps the
    -- error code P0002 (every client reads error.code) and answers HTTP 404.
    RAISE SQLSTATE 'PGRST' USING
      MESSAGE = json_build_object(
        'code', 'P0002',
        'message', format('dataset %s is not available to this account — it may not exist, the table_name may not match, or your access may not reach it', v_table_id),
        'details', NULL,
        'hint', NULL)::text,
      DETAIL = json_build_object('status', 404, 'headers', json_build_object())::text;
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
