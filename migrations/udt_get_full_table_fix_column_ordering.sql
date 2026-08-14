-- udt_get_full_table_fix_column_ordering.sql
--
-- public.get_full_table(jsonb) failed 100% of the time. Not a checker artifact —
-- executed live against a real dataset on 2026-08-13 and it raised:
--
--   42803  column "tf.field_order" must appear in the GROUP BY clause
--          or be used in an aggregate function
--
-- The 'columns' sub-select aggregates the field rows with jsonb_agg but hangs the
-- ORDER BY off the QUERY instead of the AGGREGATE:
--
--   SELECT COALESCE(jsonb_agg(to_jsonb(tf) - ...), '[]')
--   FROM workbench.udt_dataset_fields tf
--   WHERE tf.table_id = v_table_id
--   ORDER BY tf.field_order, tf.created_at      -- <- ungrouped column
--
-- With an aggregate and no GROUP BY the query produces exactly one row, so
-- ordering by a per-row column is not just wrong, it is rejected outright. The
-- intent — dataset columns in field order — belongs INSIDE jsonb_agg, which is
-- the canonical form and the only one that actually orders the array.
--
-- Blast radius: the UDT "read a whole dataset" path over 140 live
-- workbench.udt_datasets rows. Anything that reached this RPC got a hard 42803,
-- never partial or wrong data, so there is no bad persisted state to repair.
--
-- Found by the conformance checker on the same day it was taught to run
-- plpgsql_check under each function's own effective search_path. Under the old
-- 'pg_catalog'-only path this function's real error was reachable, but it sat in
-- a 101-row pile that was ~97% false positives, which is exactly how a
-- 100%-failing live function stayed invisible.
--
-- Idempotent. Safe to re-run.

create or replace function public.get_full_table(ref jsonb)
returns jsonb
language plpgsql
stable
as $function$
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
    RAISE EXCEPTION 'Table not found or name mismatch';
  END IF;

  j := jsonb_build_object(
    'table',
    (
      SELECT to_jsonb(t) - 'row_ordering_config'
      FROM workbench.udt_datasets t
      WHERE t.id = v_table_id
    ),
    'columns',
    (
      -- ORDER BY belongs to the aggregate, not the single-row outer query.
      SELECT COALESCE(
               jsonb_agg(to_jsonb(tf) - 'validation_rules' - 'default_value'
                         ORDER BY tf.field_order, tf.created_at),
               '[]'::jsonb)
      FROM workbench.udt_dataset_fields tf
      WHERE tf.table_id = v_table_id
    ),
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

-- Prove it against real rows rather than trusting the checker: the function must
-- return a populated envelope, and the columns array must come back in
-- field_order. Uses whichever live dataset has the most fields.
do $assert$
declare
  v_id uuid;
  v_res jsonb;
  v_orders int[];
  v_field_count int;
begin
  select tf.table_id into v_id
  from workbench.udt_dataset_fields tf
  join workbench.udt_datasets d on d.id = tf.table_id
  group by tf.table_id
  order by count(*) desc
  limit 1;

  if v_id is null then
    raise notice 'No UDT dataset with fields to verify against; shape check skipped.';
    return;
  end if;

  v_res := public.get_full_table(jsonb_build_object('table_id', v_id));

  if v_res->'table' is null or jsonb_typeof(v_res->'columns') <> 'array' then
    raise exception 'get_full_table returned an unexpected envelope: %', v_res;
  end if;

  select count(*) into v_field_count
  from workbench.udt_dataset_fields where table_id = v_id;

  if jsonb_array_length(v_res->'columns') <> v_field_count then
    raise exception 'get_full_table returned % columns, expected %',
      jsonb_array_length(v_res->'columns'), v_field_count;
  end if;

  select array_agg((c->>'field_order')::int order by ord)
    into v_orders
  from jsonb_array_elements(v_res->'columns') with ordinality as t(c, ord);

  if v_orders is distinct from (select array_agg(x order by x) from unnest(v_orders) x) then
    raise exception 'get_full_table columns are not in field_order: %', v_orders;
  end if;
end $assert$;
