-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- based-on: custom.io_export(uuid, uuid, text[], integer, text) 449ad952662527b48977e4b3898b1e6773cdb4a021dbdb33fc5d6114f7c06b6d
--
-- EXPORT-FIX — THE EXPORT IS THE READ DOOR'S ANSWER, ROW FOR ROW.
--
-- WHAT WAS MEASURED on the MAIN database on 2026-09-20, from the seat `authenticated`, in
-- `ZZZ PORTAL All Green Recycling`, through `custom.list_door_disagreements(null,null,200,true)`
-- — the census LEAK-T10 built for exactly this question:
--
--   256 (member, Table) pairs named, every one of them `custom.io_export`, in two shapes:
--
--   * 250 `unmeasured: custom.io_export raised 22023 (field name must not be null)`.
--     THE EXPORT DOOR WAS DEAD for every reader the store withholds NOTHING from — which is
--     every owner and every full member on this database. It did not export less; it raised.
--
--   * 6 `doors-disagree: custom.io_export counts 20 row(s) of this Table and
--     custom.read_record opens 10 of them` (and 6/3, and 2/1). EXACTLY DOUBLE, for the two
--     members the store withholds exactly TWO columns from. Reproduced from the seat as
--     `test@test.com`'s colleague: `custom.read_records` 10 rows, two `_hidden` keys per row,
--     `custom.io_export` 20 rows.
--
-- ONE EXPRESSION CAUSED BOTH. The door built the page and the withheld-column map in a single
-- SELECT, by LEFT JOIN LATERAL `jsonb_each(rr.document -> '_hidden')` onto the page:
--
--     select coalesce(jsonb_agg(x.doc order by x.ord), '[]'),
--            coalesce(jsonb_object_agg(h.key, h.value), '{}')
--       from (… custom.read_records(…) rr) x
--       left join lateral jsonb_each(coalesce(x.hidden, '{}')) h on true
--
--   With N withheld columns the join multiplies EVERY row of the page N times, so
--   `jsonb_agg` emitted each record N times — the export handed a person more rows than the
--   read door opens, which is the one thing census 13 exists to refuse.
--   With ZERO withheld columns the LEFT JOIN produces a null `h.key` for every row and
--   `jsonb_object_agg(null, null)` raises 22023 — the export was simply unavailable.
--
-- THE FIX: the page and the withheld map are computed over the page ONCE EACH, as two
-- separate aggregates over the same CTE, so neither can shape the other. `withheld` is built
-- from a set that is EMPTY when nothing is withheld (`jsonb_object_agg` over no rows is null,
-- and the coalesce makes it `{}`), and the row list is aggregated from the page itself, so
-- `jsonb_array_length(… -> 'rows')` is the number of rows `custom.read_records` returned — by
-- construction, not by luck. `custom.read_records` is already the read door's own answer (it
-- is the door census 13 measures `custom.read_record` against), it already masks, it already
-- choice-renders, so export = the read door's answer field for field as well as row for row.
--
-- TWO MORE THINGS THIS DOOR DID QUIETLY, both closed here:
--
--   * `p_required` was accepted and NEVER READ. A caller asking for the rows it may EDIT was
--     handed the rows it may VIEW, silently. `custom.read_records` — the read door — takes no
--     level and answers at `viewer`, so `viewer` is the only level this door can honestly
--     serve: anything else is now REFUSED by name with the remedy, rather than answered wrong.
--   * A Field row carrying no `key` put a NULL into the column list, and `jsonb_object_agg`
--     would have raised on it the same way. Nulls are dropped and the door SAYS SO, naming
--     the Table, so a malformed Field costs a column and not the export.
--
-- ITS INVERSE is migrations/inverse/exportfix_the_export_is_the_read_doors_answer_down.sql and
-- `scripts/campaign-tests/exportfix_red.sql` executes its real bytes.

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
  with page as (
    select row_number() over () as ord, rr.document as document
      from custom.read_records(p_organization_id, p_table_id, false,
                               greatest(1, least(coalesce(p_limit, 10000), 100000)), 0) rr
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
                            'choices', custom.choice_field_map(p_organization_id, p_table_id));
end;
$function$;
