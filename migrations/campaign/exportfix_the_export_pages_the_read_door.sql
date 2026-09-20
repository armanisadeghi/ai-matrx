-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- based-on: custom.io_export(uuid, uuid, text[], integer, text) b07a924408242caf4e903a7aaaeec5149b46a0cada5a19a7235c98c8412449ac
--
-- EXPORT-FIX — THE EXPORT'S PAGE IS BUILT OUT OF PAGES THE READ DOOR WILL SERVE.
--
-- The export door declares its own ceiling, `custom.export_ceiling` = 100,000, and its own
-- default of 10,000 (PAGE-1, lane WRITE-PERF). Its rows come from `custom.read_records`, whose
-- ceiling is `custom.page_ceiling` = 1,000 and which refuses a bigger ask outright rather than
-- quietly reading fewer. So the door RAISED when called the way its own signature invites:
--
--   select custom.io_export(org, table);
--   ERROR: custom.read_records was asked for 10000 rows; this store serves at most 1000 rows
--          in one page, so nothing was read rather than quietly reading fewer.
--
-- Found by `scripts/campaign-tests/exportfix_green.sql` PART 5b — the control clause beside the
-- `p_required` refusal, which calls the door with nothing but an organization and a Table.
--
-- AN EXPORT IS NOT A SCREEN PAGE. It walks the read door at the store's page size and stops at
-- the number the export contract promised, so both ceilings keep meaning what they say and
-- neither door has to be widened. Every exported row is still exactly a row `custom.read_records`
-- handed over, in the order it handed them over, so this lane's parity clause is untouched:
-- 1,000 (member, record) pairs hash identically through the export and through
-- `custom.read_record`.
--
-- ITS INVERSE is migrations/inverse/exportfix_the_export_pages_the_read_door_down.sql.

CREATE OR REPLACE FUNCTION custom.io_export(p_organization_id uuid, p_table_id uuid, p_columns text[] DEFAULT NULL::text[], p_limit integer DEFAULT 10000, p_required text DEFAULT 'viewer'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_cols    text[];
  v_named   integer;
  v_token   text;
  v_rows    jsonb;
  v_held    jsonb;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.io_export');
  perform custom.assert_may_know_table(p_organization_id, p_table_id, 'custom.io_export');
  perform custom.assert_store_door(p_organization_id, 'custom.io_export');

  -- NOTHING FAILS SILENTLY. This door's rows come from `custom.read_records`, which is the
  -- read door and answers at `viewer`; there is no list door in this store that answers "the
  -- rows I may edit". A caller asking for one used to be handed the viewer rows with no word
  -- said, which is the export path answering a question nobody asked.
  if coalesce(p_required, 'viewer') <> 'viewer' then
    raise exception 'custom.io_export answers at viewer and cannot export a higher level.'
      using errcode = '22023',
            hint = 'The export is the read door''s answer: it is built from custom.read_records, '
                   'which resolves the reader from the session and answers at viewer. Call it '
                   'with p_required => ''viewer'' (its default) and decide what may be CHANGED '
                   'with custom.my_level or custom.assert_client_may_change.';
  end if;

  select t.data ->> 'token' into v_token from custom.record t
   where t.organization_id = p_organization_id and t.id = p_table_id;

  v_cols := coalesce(p_columns,
    (select array_agg(f.data ->> 'key' order by coalesce((f.data ->> 'sort')::int, 0),
                                                 f.data ->> 'key')
       from custom.applicable_fields(p_organization_id, p_table_id, null) f),
    (select array_agg(k order by k)
       from (select distinct jsonb_object_keys(r.data) k
               from custom.record r
              where r.organization_id = p_organization_id
                and r.table_id = p_table_id
                and r.deleted_at is null) ks
      where left(k, 1) <> '_'),
    array[]::text[]);

  -- A Field with no `key` is a data defect, not a reason to refuse the whole export. It is
  -- dropped and NAMED, with the remedy, exactly as `custom.derived_value` names a malformed
  -- worked-out column instead of taking the Table down with it.
  v_named := coalesce(pg_catalog.array_length(v_cols, 1), 0);
  v_cols  := coalesce(pg_catalog.array_remove(v_cols, null), array[]::text[]);
  if v_named > coalesce(pg_catalog.array_length(v_cols, 1), 0) then
    raise warning 'custom.io_export: % column(s) of table % carry no key and were left out of '
      'this export. Every other column and every row are unaffected. REMEDY: give the Field a '
      'key through custom.field_update, or retire it with custom.field_retire.',
      v_named - coalesce(pg_catalog.array_length(v_cols, 1), 0), p_table_id;
  end if;

  -- THE READ DOOR DECIDES BOTH QUESTIONS: which rows, and which cells of them.
  -- `custom.read_records` already choice-renders and already carries `_hidden`.
  --
  -- THE PAGE AND THE WITHHELD MAP ARE TWO AGGREGATES OVER THE SAME CTE, never one join.
  -- Joining `jsonb_each(_hidden)` onto the page multiplied every exported row by the number
  -- of columns withheld from the reader, and produced a null key — 22023 — when none were.
  --
  -- AND THE EXPORT'S PAGE IS BUILT OUT OF PAGES THE READ DOOR WILL ACTUALLY SERVE.
  -- `custom.export_ceiling` is 100,000 and `custom.page_ceiling` is 1,000, so asking the read
  -- door for the export's own page raised PAGE-1 — the door DIED on its own default of 10,000
  -- ("custom.read_records was asked for 10000 rows; this store serves at most 1000 rows in one
  -- page"). An export is not a screen page: it walks the read door at the store's page size
  -- and stops at the number the export contract promised. Every row is still exactly a row the
  -- read door handed over, so the parity clause is untouched.
  with want as (
    select custom.page_size(p_organization_id, 'custom.io_export', p_limit, 10000,
                            custom.export_ceiling(p_organization_id)) as n,
           greatest(1, custom.page_ceiling(p_organization_id)) as chunk
  ),
  page as (
    select row_number() over (order by o.off, rr.ord) as ord, rr.document as document
      from want w
      cross join lateral generate_series(0, w.n - 1, w.chunk) o(off)
      cross join lateral (
        select row_number() over () as ord, d.document
          from custom.read_records(p_organization_id, p_table_id, false,
                                   least(w.chunk, w.n - o.off)::integer, o.off::integer) d
      ) rr
  ),
  cells as (
    select p.ord,
           (select coalesce(jsonb_object_agg(c, coalesce(p.document -> c, 'null'::jsonb)),
                            '{}'::jsonb)
              from unnest(v_cols) c) as doc
      from page p
  ),
  held as (
    select distinct on (h.key) h.key, h.value
      from page p
      cross join lateral jsonb_each(coalesce(p.document -> '_hidden', '{}'::jsonb)) h
  )
  select coalesce((select jsonb_agg(c.doc order by c.ord) from cells c), '[]'::jsonb),
         coalesce((select jsonb_object_agg(h.key, h.value) from held h), '{}'::jsonb)
    into v_rows, v_held;

  -- NOTHING FAILS SILENTLY: a column the store withheld from this reader is named with the
  -- store's own reason, beside an export whose cells for it read `null`.
  return jsonb_build_object('table_id', p_table_id, 'token', v_token,
                            'columns', to_jsonb(v_cols), 'rows', v_rows,
                            'withheld', v_held,
                            -- PAGE-1. An export is one page of its own declared ceiling, and it
                            -- says what it was asked for, what came back, and where to carry on.
                            'page', jsonb_build_object(
                              'requested', custom.page_size(p_organization_id, 'custom.io_export', p_limit, 10000, custom.export_ceiling(p_organization_id)),
                              'returned',  jsonb_array_length(coalesce(v_rows, '[]'::jsonb)),
                              'ceiling',   custom.export_ceiling(p_organization_id),
                              'next',      case when jsonb_array_length(coalesce(v_rows, '[]'::jsonb))
                                                   = custom.page_size(p_organization_id, 'custom.io_export', p_limit, 10000, custom.export_ceiling(p_organization_id))
                                                then jsonb_array_length(coalesce(v_rows, '[]'::jsonb)) else null end),
                            'choices', custom.choice_field_map(p_organization_id, p_table_id));
end;
$function$;
