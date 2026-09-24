-- chair-step: this REPLACES the bodies of 5 live functions in the five older-store read doors (public.get_full_table, get_table_cell, get_table_column, get_table_row, list_table_rows), changing ONE kind of statement and nothing else: every `raise exception … using errcode = 'P0002'` (5 of them) becomes `perform platform.refuse_not_found(<the same sentence>, <the same hint>, <the same detail>)`. Called directly (the server, every suite, every other function) the refusal is byte-for-byte what it was: SQLSTATE P0002, same message, hint and detail. Called through PostgREST it answers HTTP 404 with error code P0002 instead of HTTP 500. No table, column, policy, trigger or grant is touched; nothing is written. Needs errorshonest_s1_one_way_to_say_not_found.sql first. Inverse: migrations/inverse/errorshonest_s6_the_older_table_doors_say_not_found_down.sql restores every body verbatim.
-- lane: ERRORS-HONEST
-- based-on: public.get_full_table(jsonb) 2db0bcb3628c1f7c9091a876fbaf47c2afd7cc734068bbe47a093fbf0a7dfac0
-- based-on: public.get_table_cell(jsonb) 48108e9e072f228514dbbd2811763517c91b5a044600060de08c7e776cab4511
-- based-on: public.get_table_column(jsonb) 3a90d15bd9e56a5ded65ca8605b65647fcd0b48e41f23578b396b8cdb4cb64c7
-- based-on: public.get_table_row(jsonb) ffc59fea14f286767f99bdec1d0543a3d0a45d8d88d0f1d9cc7dc4b5f1bc6d0d
-- based-on: public.list_table_rows(jsonb, integer, integer, text, text) e4987df669ac114b13dbd1a611070645f0a2fd56e594c61ba1922c4be689b209
--
-- SUPERSEDES activeorgpages_a_table_she_cannot_open_answers_not_found_never_a_fault.sql (lane
-- ACTIVE-ORG-PAGES, never applied to production). That file raises PostgREST's shape INLINE on these
-- five doors, so a DIRECT caller — the server's matrx-graph, which reads this exact refusal as
-- RecordNotAvailableError (SQLSTATE P0002) — would get SQLSTATE PGRST and a JSON blob, and a failed
-- save would read as "the database broke". This file gives the same HTTP 404 through PostgREST and
-- keeps P0002 for the direct caller. Apply THIS one, not that one: both are based on the same five
-- live bodies, so whichever runs second is refused by its based-on lines, and nothing half-applies.
--
-- LANE ERRORS-HONEST — A THING THAT IS NOT THERE, OR NOT YOURS, ANSWERS "NOT FOUND", NEVER A SERVER FAULT.
--
-- THE USE CASE. Alex Hart (test@test.com) opens a link a teammate sent her to something she was
-- never given, or that was archived since. The door is right to refuse, and says so with SQLSTATE
-- P0002 — which PostgREST answers as HTTP 500, a server FAULT, so every client page shows the
-- "something broke" screen instead of the honest not-found / no-access one.
--
-- THE CONVENTION (errorshonest_s1_one_way_to_say_not_found.sql): a not-found is raised ONE way,
-- `perform platform.refuse_not_found(message, hint, detail)`. Inside a PostgREST request it raises
-- PostgREST's own error shape (SQLSTATE PGRST: body {code: P0002, message, details, hint},
-- status 404); everywhere else it raises exactly the P0002 it replaces. `pnpm check:not-found-is-honest`
-- fails on any function in the database that still raises P0002 itself.
--
-- Function by function (census 2026-09-24, production, read-only):
--   public.get_full_table(jsonb): 1 not-found raise
--   public.get_table_cell(jsonb): 1 not-found raise
--   public.get_table_column(jsonb): 1 not-found raise
--   public.get_table_row(jsonb): 1 not-found raise
--   public.list_table_rows(jsonb, integer, integer, text, text): 1 not-found raise

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
